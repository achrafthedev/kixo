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
  if (!res.ok) {
    const err = new Error(explainTokenError(mode, res.status, text))
    err.status = res.status
    throw err
  }
  const tok = JSON.parse(text)
  return {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
    scope: tok.scope || '',
    mode: mode.kind // refresh through the same path that issued the token
  }
}

// Lets the main process tell the window when the session changes on its own
// (expired/revoked login), so the UI never shows a stale "logged in" state.
let authListener = () => {}
export const onAuthChange = (fn) => (authListener = fn)
const notifyAuth = () => authListener(getState().user || null)

let pendingLogin = null // { promise, reopen, cancel }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function login() {
  // Clicking "Log in" again while waiting re-opens the Kick page instead of
  // silently waiting (a closed/lost browser tab looked like a frozen login).
  if (pendingLogin) {
    pendingLogin.reopen()
    return pendingLogin.promise
  }
  const mode = authMode()
  if (mode.kind === 'none') {
    return Promise.reject(new Error('Login is unavailable in this build. Add your own Kick app in Settings → Account.'))
  }
  const official = mode.kind === 'proxy'
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  // "h." tells the kixo.app callback page to use the polling handoff (below).
  const stateParam = (official ? 'h.' : '') + b64url(randomBytes(24))
  const authorizeUrl =
    `${KICK_ID}/oauth/authorize?` +
    new URLSearchParams({
      response_type: 'code',
      client_id: mode.clientId,
      redirect_uri: mode.redirect,
      scope: SCOPES.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: stateParam
    })

  let resolve, reject
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)))
  const cleanups = []
  let done = false
  const finish = (fn) => {
    if (done) return
    done = true
    for (const c of cleanups) c()
    pendingLogin = null
    Promise.resolve().then(fn).then(resolve, reject)
  }
  const fail = (message) => finish(() => Promise.reject(new Error(message)))
  const complete = (code) =>
    finish(async () => {
      const tokens = await tokenRequest(mode, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: mode.redirect })
      setSecrets({ tokens })
      const me = await fetchMe()
      setState({ user: me })
      return me
    })
  const deniedMessage = (err) => (/access_denied|cancel/i.test(err || '') ? 'Login was cancelled on Kick.' : `Kick login failed: ${err}`)

  if (official) {
    // Kick → kixo.app/auth/callback, which drops the code at /auth/handoff;
    // poll for it. Works regardless of browser/firewall/localhost quirks.
    let stopped = false
    cleanups.push(() => (stopped = true))
    ;(async () => {
      while (!stopped) {
        await sleep(1500)
        if (stopped) return
        try {
          const r = await fetch(`${mode.proxy}/handoff/${stateParam}`, { cache: 'no-store' })
          if (r.status !== 200) continue
          const j = await r.json()
          return j.code ? complete(j.code) : fail(deniedMessage(j.error))
        } catch {
          // offline for a moment: keep polling until the timeout
        }
      }
    })()
  } else {
    // Bring-your-own app: Kick redirects straight to localhost. Listen on IPv4
    // and IPv6 loopback so "localhost" works whichever one the browser picks.
    let failures = 0
    for (const host of ['127.0.0.1', '::1']) {
      const server = createServer((req, res) => {
        const url = new URL(req.url, OAUTH_REDIRECT)
        if (url.pathname !== '/callback') return res.writeHead(404).end()
        const code = url.searchParams.get('code')
        const ok = code && url.searchParams.get('state') === stateParam
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(callbackPage(ok))
        if (ok) complete(code)
        else fail(deniedMessage(url.searchParams.get('error_description') || url.searchParams.get('error') || 'cancelled'))
      })
      server.on('error', (e) => {
        if (++failures === 2) fail(`Port ${OAUTH_PORT} is already in use by another app (${e.code}). Close it and try again.`)
      })
      server.listen(OAUTH_PORT, host)
      cleanups.push(() => server.close())
    }
  }

  const timeout = setTimeout(() => fail('Login timed out. Click "Log in with Kick" to try again.'), 5 * 60 * 1000)
  cleanups.push(() => clearTimeout(timeout))
  // KIXO_NO_BROWSER=1 (tests): print the URL instead of opening a browser.
  const open = () => (process.env.KIXO_NO_BROWSER ? console.log(`[kixo] authorize: ${authorizeUrl}`) : shell.openExternal(authorizeUrl))
  open()
  pendingLogin = { promise, reopen: open, cancel: () => fail('Login cancelled.') }
  return promise
}

export function cancelLogin() {
  pendingLogin?.cancel()
}

export const loginPending = () => !!pendingLogin

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
    .then((t) => {
      // Kick may omit a new refresh token; keep the old one so later refreshes work.
      const next = { ...t, refreshToken: t.refreshToken || tokens.refreshToken }
      setSecrets({ tokens: next })
      return next.accessToken
    })
    .catch((e) => {
      // Only a definitive rejection from Kick ends the session. Network blips,
      // timeouts or a 5xx keep the login; the next call simply retries.
      if (e.status === 400 || e.status === 401) {
        setSecrets({ tokens: null })
        setState({ user: null })
        notifyAuth()
        return null
      }
      throw new Error('Could not reach Kick to renew your login. Check your connection and try again.')
    })
    .finally(() => (refreshing = null))
  return refreshing
}

// Authenticated call to the official Kick Public API.
export async function kickApi(method, path, body, retried = false) {
  const token = await getAccessToken()
  if (!token) {
    notifyAuth()
    throw new Error('Please log in with Kick first.')
  }
  const res = await fetch(KICK_API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  // Token rejected before its expiry (revoked/rotated): force one refresh + retry.
  if (res.status === 401 && !retried) {
    const { tokens } = getSecrets()
    if (tokens?.refreshToken) {
      setSecrets({ tokens: { ...tokens, expiresAt: 0 } })
      return kickApi(method, path, body, true)
    }
  }
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
