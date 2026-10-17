import { shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import {
  BUILT_IN_AUTH_PROXY,
  BUILT_IN_CLIENT_ID,
  BUILT_IN_REDIRECT,
  KICK_API,
  KICK_ID,
  OAUTH_PORT,
  OAUTH_REDIRECT,
  SCOPES
} from './config.js'
import { getSecrets, getState, setSecrets, setState } from './store.js'

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const officialMode = () =>
  BUILT_IN_CLIENT_ID && BUILT_IN_AUTH_PROXY
    ? { kind: 'proxy', clientId: BUILT_IN_CLIENT_ID, proxy: BUILT_IN_AUTH_PROXY, redirect: BUILT_IN_REDIRECT }
    : { kind: 'none' }

// Which credentials are in play: Kixo's official app (default), or the user's
// own Kick app when they switched "Use my own Kick app" on in Settings → Account.
export function authMode(kind) {
  const s = getState()
  const byoReady = s.byoClientId && getSecrets().byoClientSecret
  const wantByo = kind ? kind === 'byo' : s.useByo && byoReady
  if (wantByo && byoReady) {
    return { kind: 'byo', clientId: s.byoClientId, clientSecret: getSecrets().byoClientSecret, redirect: OAUTH_REDIRECT }
  }
  return officialMode()
}

// Turn Kick's terse token errors into something a user can act on.
function explainTokenError(mode, status, text) {
  if (status === 401 || /invalid_client|unauthorized/i.test(text)) {
    return mode.kind === 'byo'
      ? `Kick rejected the login (401). Check your Client ID/Secret, and that your Kick app's redirect URL is exactly ${mode.redirect}`
      : 'Kick rejected the login (401). Please try again; if it keeps failing, report it on GitHub.'
  }
  if (status === 429) return 'Too many login attempts. Wait a minute and try again.'
  return `Kick login failed (${status}) ${text.slice(0, 160)}`
}

async function tokenRequest(mode, params) {
  let res
  if (mode.kind === 'byo') {
    res = await fetch(`${KICK_ID}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, client_id: mode.clientId, client_secret: mode.clientSecret })
    })
  } else if (mode.kind === 'proxy') {
    const path = params.grant_type === 'refresh_token' ? '/refresh' : '/token'
    res = await fetch(mode.proxy + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })
  } else {
    throw new Error('Login is unavailable in this build. Add your own Kick app in Settings → Account.')
  }
  const text = await res.text()
  if (!res.ok) throw new Error(explainTokenError(mode, res.status, text))
  const tok = JSON.parse(text)
  return {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
    scope: tok.scope || '',
    mode: mode.kind // refresh through the same path that issued the token
  }
}

let pendingLogin = null

export function login() {
  if (pendingLogin) return pendingLogin.promise
  const mode = authMode()
  if (mode.kind === 'none') {
    return Promise.reject(new Error('Login is unavailable in this build. Add your own Kick app in Settings → Account.'))
  }
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const stateParam = b64url(randomBytes(16))

  let resolve, reject
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)))
  const server = createServer(async (req, res) => {
    // Official mode: Kick → kixo.app/auth/callback → here. BYO: Kick → here.
    const url = new URL(req.url, OAUTH_REDIRECT)
    if (url.pathname !== '/callback') return res.writeHead(404).end()
    const code = url.searchParams.get('code')
    const ok = code && url.searchParams.get('state') === stateParam
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(callbackPage(ok))
    finish(async () => {
      if (!ok) throw new Error(url.searchParams.get('error_description') || 'Login was cancelled.')
      const tokens = await tokenRequest(mode, {
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: mode.redirect
      })
      setSecrets({ tokens })
      const me = await fetchMe()
      setState({ user: me })
      return me
    })
  })
  const timeout = setTimeout(() => finish(() => Promise.reject(new Error('Login timed out.'))), 5 * 60 * 1000)
  function finish(fn) {
    clearTimeout(timeout)
    server.close()
    pendingLogin = null
    Promise.resolve().then(fn).then(resolve, reject)
  }
  server.on('error', (e) => finish(() => Promise.reject(new Error(`Port ${OAUTH_PORT} is busy: ${e.message}`))))
  server.listen(OAUTH_PORT, 'localhost', () => {
    // `localhost` (not 127.0.0.1) avoids Kick's documented Next.js loopback bug.
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: mode.clientId,
      redirect_uri: mode.redirect,
      scope: SCOPES.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: stateParam
    })
    shell.openExternal(`${KICK_ID}/oauth/authorize?${q}`)
  })
  pendingLogin = { promise }
  return promise
}

export async function logout() {
  const { tokens } = getSecrets()
  if (tokens?.accessToken) {
    fetch(`${KICK_ID}/oauth/revoke?token=${encodeURIComponent(tokens.accessToken)}&token_hint_type=access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }).catch(() => {})
  }
  setSecrets({ tokens: null })
  setState({ user: null })
}

let refreshing = null
export async function getAccessToken() {
  const { tokens } = getSecrets()
  if (!tokens?.accessToken) return null
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken
  if (!tokens.refreshToken) return null
  refreshing ??= tokenRequest(authMode(tokens.mode || 'proxy'), { grant_type: 'refresh_token', refresh_token: tokens.refreshToken })
    .then((t) => (setSecrets({ tokens: t }), t.accessToken))
    .catch(() => (setSecrets({ tokens: null }), setState({ user: null }), null))
    .finally(() => (refreshing = null))
  return refreshing
}

// Authenticated call to the official Kick Public API.
export async function kickApi(method, path, body) {
  const token = await getAccessToken()
  if (!token) throw new Error('Please log in with Kick first.')
  const res = await fetch(KICK_API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  if (res.status === 204) return { ok: true }
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { message: text }
  }
  if (!res.ok) {
    const hint = res.status === 403 ? ' (missing permission — are you a moderator here?)' : res.status === 429 ? ' (slow down)' : ''
    throw new Error(`${json.message || 'Kick API error'} [${res.status}]${hint}`)
  }
  return json
}

async function fetchMe() {
  const { data } = await kickApi('GET', '/v1/users')
  const u = data?.[0] || {}
  return { id: u.user_id, username: u.name, avatar: u.profile_picture }
}

function callbackPage(ok) {
  return `<!doctype html><meta charset="utf-8"><title>Kixo</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0d10;color:#e8eaed;font:16px system-ui">
<div style="text-align:center"><div style="font-size:44px;font-weight:800;color:#53fc18">kixo</div>
<p>${ok ? 'You are logged in. You can close this tab and go back to Kixo.' : 'Login failed or was cancelled. You can close this tab.'}</p></div>
<script>setTimeout(()=>window.close(),1500)</script></body>`
}
