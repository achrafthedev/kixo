// Kixo auth proxy — plain Node (18+) version of worker.js for a VPS.
// Usage: KICK_CLIENT_ID=... KICK_CLIENT_SECRET=... PORT=4200 node server.mjs
// Put it behind HTTPS (nginx/caddy) and build Kixo with MAIN_VITE_AUTH_PROXY=https://your-host
//
// Also hosts the login "handoff": the hosted callback page drops Kick's one-time
// code here (keyed by the app's random state) and the desktop app polls for it.
// This avoids redirecting the browser to localhost, which some browsers,
// firewalls and port clashes break. The code is useless without the app's PKCE
// verifier, is single-use, and expires after a few minutes.
import { createServer } from 'node:http'
import worker from './worker.js'

const env = {
  KICK_CLIENT_ID: process.env.KICK_CLIENT_ID,
  KICK_CLIENT_SECRET: process.env.KICK_CLIENT_SECRET,
  REDIRECT_URI: process.env.REDIRECT_URI
}
if (!env.KICK_CLIENT_ID || !env.KICK_CLIENT_SECRET) {
  console.error('Set KICK_CLIENT_ID and KICK_CLIENT_SECRET')
  process.exit(1)
}

const HANDOFF_TTL = 10 * 60 * 1000
const STATE_RE = /^[A-Za-z0-9._-]{16,128}$/
const handoffs = new Map() // state -> { code?, error?, at }
const stats = { posted: 0, collected: 0, expired: 0 }

setInterval(() => {
  const now = Date.now()
  for (const [k, v] of handoffs) {
    if (now - v.at > HANDOFF_TTL) {
      handoffs.delete(k)
      stats.expired++
    }
  }
}, 60_000).unref()

// Hourly one-line summary in the journal: lets us see logins that never finish.
setInterval(() => {
  if (stats.posted || stats.expired) console.log(`handoff stats: ${JSON.stringify(stats)} pending=${handoffs.size}`)
  stats.posted = stats.collected = stats.expired = 0
}, 60 * 60 * 1000).unref()

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

function handoff(req, res, url, body) {
  if (req.method === 'POST' && url.pathname === '/handoff') {
    let b
    try {
      b = JSON.parse(body || '{}')
    } catch {
      return json(res, 400, { error: 'invalid_json' })
    }
    if (!STATE_RE.test(String(b.state || ''))) return json(res, 400, { error: 'bad_state' })
    if (handoffs.size > 10_000) return json(res, 503, { error: 'busy' })
    const entry = { at: Date.now() }
    if (b.code) entry.code = String(b.code).slice(0, 2048)
    else entry.error = String(b.error || 'cancelled').slice(0, 200)
    handoffs.set(b.state, entry)
    stats.posted++
    return json(res, 200, { ok: true })
  }
  const m = url.pathname.match(/^\/handoff\/([A-Za-z0-9._-]{16,128})$/)
  if (req.method === 'GET' && m) {
    const entry = handoffs.get(m[1])
    if (!entry) return json(res, 204)
    handoffs.delete(m[1]) // single use
    stats.collected++
    return json(res, 200, entry.code ? { code: entry.code } : { error: entry.error })
  }
  return false
}

createServer(async (req, res) => {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > 16 * 1024) return res.writeHead(413).end()
    chunks.push(c)
  }
  const body = Buffer.concat(chunks).toString('utf8')
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname.startsWith('/handoff')) {
    if (handoff(req, res, url, body) !== false) return
    return json(res, 404, { error: 'not_found' })
  }
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
    body: req.method === 'POST' ? body : undefined
  })
  const response = await worker.fetch(request, env)
  res.writeHead(response.status, { 'Content-Type': 'application/json' })
  res.end(await response.text())
}).listen(Number(process.env.PORT) || 4200, '127.0.0.1', () => console.log('kixo auth proxy listening'))
