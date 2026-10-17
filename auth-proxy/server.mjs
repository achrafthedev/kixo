// Kixo auth proxy — plain Node (18+) version of worker.js for a VPS.
// Usage: KICK_CLIENT_ID=... KICK_CLIENT_SECRET=... PORT=4200 node server.mjs
// Put it behind HTTPS (nginx/caddy) and build Kixo with MAIN_VITE_AUTH_PROXY=https://your-host
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

createServer(async (req, res) => {
  const chunks = []
  for await (const c of req) {
    chunks.push(c)
    if (chunks.reduce((n, b) => n + b.length, 0) > 16 * 1024) return res.writeHead(413).end()
  }
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
    body: req.method === 'POST' ? Buffer.concat(chunks) : undefined
  })
  const response = await worker.fetch(request, env)
  res.writeHead(response.status, { 'Content-Type': 'application/json' })
  res.end(await response.text())
}).listen(Number(process.env.PORT) || 4200, '127.0.0.1', () => console.log('kixo auth proxy listening'))
