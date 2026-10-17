import { contextBridge, ipcRenderer } from 'electron'

const call = (ch, arg) =>
  ipcRenderer.invoke(ch, arg).then((r) => {
    if (!r.ok) throw new Error(r.error)
    return r.data
  })

const on = (ch, fn) => {
  const listener = (_e, payload) => fn(payload)
  ipcRenderer.on(ch, listener)
  return () => ipcRenderer.removeListener(ch, listener)
}

contextBridge.exposeInMainWorld('kixo', {
  getState: () => call('state:get'),
  setState: (patch) => call('state:set', patch),
  setByo: (creds) => call('byo:set', creds),
  login: () => call('auth:login'),
  logout: () => call('auth:logout'),
  kick: {
    channel: (slug) => call('kick:channel', slug),
    history: (channelId) => call('kick:history', channelId),
    emotes: (slug, userId) => call('kick:emotes', { slug, userId }),
    realtime: (channelId) => call('kick:realtime', channelId),
    userCard: (slug, username) => call('kick:userCard', { slug, username })
  },
  api: {
    send: (args) => call('api:send', args),
    deleteMessage: (id) => call('api:delete', id),
    ban: (args) => call('api:ban', args),
    unban: (args) => call('api:unban', args),
    myChannel: () => call('api:myChannel'),
    patchChannel: (patch) => call('api:patchChannel', patch),
    categories: (q) => call('api:categories', q)
  },
  kickweb: {
    status: () => call('kickweb:status'),
    connect: () => call('kickweb:connect'),
    disconnect: () => call('kickweb:disconnect'),
    setRole: (args) => call('kickweb:role', args)
  },
  win: {
    minimize: () => call('win:minimize'),
    maximize: () => call('win:maximize'),
    close: () => call('win:close'),
    onMaximized: (fn) => on('win:maximized', fn)
  },
  open: (url) => call('shell:open', url),
  overlay: {
    push: (slug, event) => ipcRenderer.send('overlay:push', { slug, event }),
    watched: () => call('overlay:watched'),
    onWatch: (fn) => on('overlay:watch', fn)
  },
  updates: {
    onStatus: (fn) => on('update:status', fn),
    install: () => call('update:install')
  }
})
