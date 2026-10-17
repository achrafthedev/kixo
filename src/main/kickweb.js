import { BrowserWindow, session } from 'electron'

// Optional kick.com website session, used ONLY for actions Kick's official API
// doesn't offer yet (granting/removing VIP, OG and moderator). The user logs in
// on kick.com in a dedicated window; cookies stay in this isolated partition.
const PARTITION = 'persist:kickweb'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36'

const ses = () => {
  const s = session.fromPartition(PARTITION)
  s.setUserAgent(UA)
  return s
}

async function cookie(name) {
  const [c] = await ses().cookies.get({ url: 'https://kick.com', name })
  return c ? decodeURIComponent(c.value) : null
}

async function webFetch(path, init = {}) {
  const token = await cookie('session_token')
  if (!token) throw new Error('Connect your kick.com account first (Settings → Account).')
  const xsrf = await cookie('XSRF-TOKEN')
  return ses().fetch(`https://kick.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {})
    }
  })
}

export async function status() {
  if (!(await cookie('session_token'))) return { connected: false }
  try {
    const res = await webFetch('/api/v1/user')
    if (!res.ok) return { connected: false, expired: res.status === 401 }
    const u = await res.json()
    return { connected: true, username: u.username }
  } catch {
    return { connected: false }
  }
}

let connecting = null
export function connect(parent) {
  if (connecting) return connecting
  connecting = new Promise((resolve) => {
    const win = new BrowserWindow({
      parent,
      width: 520,
      height: 760,
      title: 'Connect kick.com — Kixo',
      autoHideMenuBar: true,
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true }
    })
    win.loadURL('https://kick.com/')
    // Poll for the login cookie, then validate it and close the window.
    const timer = setInterval(async () => {
      if (win.isDestroyed()) return
      if (await cookie('session_token')) {
        const s = await status()
        if (s.connected) {
          clearInterval(timer)
          win.close()
          resolve(s)
        }
      }
    }, 1500)
    win.on('closed', async () => {
      clearInterval(timer)
      connecting = null
      resolve(await status())
    })
  })
  return connecting
}

export async function disconnect() {
  await ses().clearStorageData()
  return { connected: false }
}

const ROLE_PATH = { vip: ['vips', 'vip'], og: ['ogs', 'og'], moderator: ['moderators', 'moderator'] }

// add/remove a channel role. Kick has used both plural and singular paths, so
// try the current (plural) one first and fall back on 404/405.
export async function setRole({ slug, role, username, add }) {
  const paths = ROLE_PATH[role]
  if (!paths) throw new Error(`Unknown role ${role}`)
  let res
  for (const p of paths) {
    const base = `/api/internal/v1/channels/${encodeURIComponent(slug)}/community/${p}`
    res = add
      ? await webFetch(base, { method: 'POST', body: JSON.stringify({ username }) })
      : await webFetch(`${base}/${encodeURIComponent(username)}`, { method: 'DELETE' })
    if (res.status !== 404 && res.status !== 405) break
  }
  if (res.ok) return { ok: true }
  const text = await res.text().catch(() => '')
  let msg = ''
  try {
    msg = JSON.parse(text).message || ''
  } catch {
    msg = text.slice(0, 120)
  }
  if (res.status === 401) throw new Error('Your kick.com session expired. Reconnect it in Settings → Account.')
  if (res.status === 403) throw new Error(`Kick refused: only the channel owner can change ${role === 'moderator' ? 'moderators' : role.toUpperCase()}s here.`)
  if (res.status === 404) throw new Error(`User "${username}" not found.`)
  throw new Error(`Kick error ${res.status}${msg ? `: ${msg}` : ''}`)
}
