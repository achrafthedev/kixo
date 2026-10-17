import { app, BrowserWindow, ipcMain, Menu, screen, session, shell } from 'electron'
import { join } from 'node:path'
import updater from 'electron-updater'
import { authMode, kickApi, login, logout } from './auth.js'
import { OVERLAY_PORT } from './config.js'
import { getChannel, getEmotes, getHistory, getRealtime, getUserCard } from './kick.js'
import { pushOverlay, startOverlayServer, watchedSlugs } from './overlay.js'
import { flushState, getSecrets, getState, setSecrets, setState } from './store.js'

const { autoUpdater } = updater
let win = null

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

function boundsOnScreen(b) {
  if (!b) return null
  const area = screen.getDisplayMatching(b).workArea
  const visible = b.x < area.x + area.width && b.x + b.width > area.x && b.y < area.y + area.height && b.y + b.height > area.y
  return visible ? b : null
}

function createWindow() {
  const s = getState()
  const bounds = boundsOnScreen(s.bounds) || { width: 460, height: 760 }
  win = new BrowserWindow({
    ...bounds,
    minWidth: 320,
    minHeight: 360,
    frame: false,
    show: false,
    backgroundColor: '#0b0d10',
    title: 'Kixo',
    icon: join(app.getAppPath(), 'resources', 'icon.png'),
    alwaysOnTop: !!s.settings?.alwaysOnTop,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      spellcheck: true
    }
  })
  if (s.maximized) win.maximize()
  win.setOpacity(Math.min(1, Math.max(0.3, s.settings?.opacity ?? 1)))
  win.once('ready-to-show', () => win.show())

  const saveBounds = () => {
    if (!win || win.isDestroyed()) return
    if (win.isMaximized()) setState({ maximized: true })
    else setState({ maximized: false, bounds: win.getBounds() })
  }
  win.on('resize', saveBounds)
  win.on('move', saveBounds)
  win.on('maximize', () => send('win:maximized', true))
  win.on('unmaximize', () => send('win:maximized', false))

  // Links in chat open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault()
      if (/^https?:\/\//.test(url)) shell.openExternal(url)
    }
  })

  // Spellcheck suggestions on right-click in the chat box.
  win.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable) return
    const items = p.dictionarySuggestions.slice(0, 5).map((w) => ({ label: w, click: () => win.webContents.replaceMisspelling(w) }))
    if (items.length) items.push({ type: 'separator' })
    items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' })
    Menu.buildFromTemplate(items).popup()
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

const send = (ch, payload) => win && !win.isDestroyed() && win.webContents.send(ch, payload)

function publicState() {
  const s = getState()
  return {
    settings: s.settings || {},
    channels: s.channels || [],
    user: s.user || null,
    byoClientId: s.byoClientId || '',
    hasByoSecret: !!getSecrets().byoClientSecret,
    authMode: authMode().kind,
    version: app.getVersion(),
    overlayPort: OVERLAY_PORT,
    platform: process.platform,
    // KIXO_DEMO=1 exposes a hook used to stage website screenshots.
    demo: !!process.env.KIXO_DEMO
  }
}

function registerIpc() {
  const handle = (ch, fn) =>
    ipcMain.handle(ch, async (_e, arg) => {
      try {
        return { ok: true, data: await fn(arg) }
      } catch (err) {
        return { ok: false, error: err?.message || String(err) }
      }
    })

  handle('state:get', () => publicState())
  handle('state:set', (patch) => {
    const allowed = {}
    for (const k of ['settings', 'channels']) if (k in patch) allowed[k] = patch[k]
    setState(allowed)
    if (patch.settings && win) {
      win.setAlwaysOnTop(!!patch.settings.alwaysOnTop)
      win.setOpacity(Math.min(1, Math.max(0.3, patch.settings.opacity ?? 1)))
    }
    return true
  })
  handle('byo:set', ({ clientId, clientSecret }) => {
    setState({ byoClientId: (clientId || '').trim() })
    if (clientSecret !== undefined) setSecrets({ byoClientSecret: (clientSecret || '').trim() || null })
    return publicState()
  })

  handle('auth:login', async () => {
    const me = await login()
    win?.show()
    win?.focus()
    return me
  })
  handle('auth:logout', () => logout())

  handle('kick:channel', (slug) => getChannel(slug))
  handle('kick:history', (channelId) => getHistory(channelId))
  handle('kick:emotes', ({ slug, userId }) => getEmotes(slug, userId))
  handle('kick:realtime', (channelId) => getRealtime(channelId))
  handle('kick:userCard', ({ slug, username }) => getUserCard(slug, username))

  handle('api:send', ({ broadcasterUserId, content, replyTo }) =>
    kickApi('POST', '/v1/chat', {
      type: 'user',
      broadcaster_user_id: broadcasterUserId,
      content,
      ...(replyTo ? { reply_to_message_id: replyTo } : {})
    })
  )
  handle('api:delete', (messageId) => kickApi('DELETE', `/v1/chat/${encodeURIComponent(messageId)}`))
  handle('api:ban', ({ broadcasterUserId, userId, duration, reason }) =>
    kickApi('POST', '/v1/moderation/bans', {
      broadcaster_user_id: broadcasterUserId,
      user_id: userId,
      ...(duration ? { duration } : {}),
      ...(reason ? { reason } : {})
    })
  )
  handle('api:unban', ({ broadcasterUserId, userId }) =>
    kickApi('DELETE', '/v1/moderation/bans', { broadcaster_user_id: broadcasterUserId, user_id: userId })
  )
  handle('api:myChannel', () => kickApi('GET', '/v1/channels').then((r) => r.data?.[0] || null))
  handle('api:patchChannel', (patch) => kickApi('PATCH', '/v1/channels', patch))
  handle('api:categories', (q) => kickApi('GET', `/v2/categories?name=${encodeURIComponent(q)}&limit=10`).then((r) => r.data || []))

  handle('win:minimize', () => win.minimize())
  handle('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()))
  handle('win:close', () => win.close())
  handle('shell:open', (url) => /^https?:\/\//.test(url) && shell.openExternal(url))

  ipcMain.on('overlay:push', (_e, { slug, event }) => pushOverlay(slug, event))
  handle('overlay:watched', () => watchedSlugs())

  handle('update:install', () => autoUpdater.quitAndInstall())
}

function setupUpdater() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return
  autoUpdater.autoDownload = true
  autoUpdater.on('update-available', (i) => send('update:status', { state: 'downloading', version: i.version }))
  autoUpdater.on('update-downloaded', (i) => send('update:status', { state: 'ready', version: i.version }))
  autoUpdater.on('error', () => {})
  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  setTimeout(check, 5000)
  setInterval(check, 4 * 60 * 60 * 1000)
}

app.whenReady().then(() => {
  app.setAppUserModelId('app.kixo.desktop')
  Menu.setApplicationMenu(null)
  // Kick's realtime servers reject the renderer's file:// origin on the
  // WebSocket handshake; present the same origin as kick.com's own viewers.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['wss://*.platform.kick.com/*', 'wss://*.pusher.com/*'] },
    (details, cb) => cb({ requestHeaders: { ...details.requestHeaders, Origin: 'https://kick.com' } })
  )
  registerIpc()
  createWindow()
  startOverlayServer((slug) => send('overlay:watch', slug))
  setupUpdater()
})

app.on('window-all-closed', () => {
  flushState()
  app.quit()
})
app.on('before-quit', flushState)
