// Kixo auth proxy — Cloudflare Worker.
//
// Kick's OAuth token endpoint requires the client secret even with PKCE, and a
// secret can't be shipped inside a public desktop app. This worker holds it and
// forwards only the two token calls Kixo needs. It never sees chat traffic and
// stores nothing.
//
// Deploy:  npx wrangler deploy   (then: npx wrangler secret put KICK_CLIENT_SECRET)
// Vars:    KICK_CLIENT_ID, KICK_CLIENT_SECRET

const REDIRECT_URI = 'http://localhost:53682/callback'
const KICK_TOKEN = 'https://id.kick.com/oauth/token'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/') return json({ ok: true, service: 'kixo-auth' })
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'invalid_json' }, 400)
    }

    let params
    if (url.pathname === '/token') {
      if (!body.code || !body.code_verifier) return json({ error: 'missing_code' }, 400)
      params = {
        grant_type: 'authorization_code',
        code: String(body.code),
        code_verifier: String(body.code_verifier),
        redirect_uri: REDIRECT_URI
      }
    } else if (url.pathname === '/refresh') {
      if (!body.refresh_token) return json({ error: 'missing_refresh_token' }, 400)
      params = { grant_type: 'refresh_token', refresh_token: String(body.refresh_token) }
    } else {
      return json({ error: 'not_found' }, 404)
    }

    const res = await fetch(KICK_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, client_id: env.KICK_CLIENT_ID, client_secret: env.KICK_CLIENT_SECRET })
    })
    return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } })
  }
}
