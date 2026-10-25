import { encodeOutgoing, normalizeChat, normalizeEvent } from './parse.js'
import { realtime } from './realtime.js'
import { DEFAULT_SETTINGS, store, toast } from './store.js'

const k = window.kixo
const rooms = new Map() // slug -> runtime room
const watched = new Set() // slugs with an OBS overlay attached

const persistChannels = () => k.setState({ channels: store.get().channels.map((c) => c.slug) })

function roomCtx(room) {
  const { user, settings } = store.get()
  return {
    me: user?.username,
    highlightWords: settings.highlightWords,
    subBadges: room.info.subBadges,
    emoteIndex: settings.show7tv ? room.stvIndex : null
  }
}

export async function init() {
  const s = await k.getState()
  store.set({
    user: s.user,
    authMode: s.authMode,
    byoClientId: s.byoClientId,
    hasByoSecret: s.hasByoSecret,
    useByo: s.useByo,
    version: s.version,
    overlayPort: s.overlayPort,
    settings: { ...DEFAULT_SETTINGS, ...s.settings },
    ready: true
  })
  realtime.onStatus((status) => store.set({ status }))
  k.onAuthUser((user) => {
    const had = store.get().user
    store.set({ user })
    if (had && !user) toast('Your Kick login expired. Please log in again.', 'error')
  })
  k.updates.onStatus((update) => store.set({ update }))
  k.overlay.onWatch((slug) => {
    watched.add(slug)
    if (!rooms.has(slug)) addChannel(slug, { activate: false })
  })
  for (const slug of await k.overlay.watched()) watched.add(slug)

  const saved = s.channels?.length ? s.channels : []
  await Promise.all(saved.map((slug) => addChannel(slug, { activate: false, persist: false })))
  // Lookups finish in any order; restore the saved tab order.
  store.set((st) => ({ channels: [...st.channels].sort((a, b) => saved.indexOf(a.slug) - saved.indexOf(b.slug)) }))
  const first = store.get().channels[0]
  if (first) setActive(first.slug)

  setInterval(flush, 80)
  if (s.demo) {
    // Screenshot staging only: feed raw Kick events through the real pipeline.
    window.__kixoDemo = {
      store,
      feed: (slug, event, data) => rooms.get(slug) && onEvent(rooms.get(slug), { event, data }),
      patch: patchChannel
    }
  } else {
    setInterval(refreshInfo, 60_000)
  }
}

export async function addChannel(input, { activate = true, persist = true } = {}) {
  const slug = String(input || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?kick\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/^@/, '')
    .toLowerCase()
  if (!slug) return
  if (rooms.has(slug)) {
    if (activate) setActive(slug)
    return
  }
  let info
  try {
    info = await k.kick.channel(slug)
  } catch {
    toast(`Couldn't find channel "${slug}"`, 'error')
    return
  }
  if (!info?.chatroomId) return toast(`"${slug}" has no chatroom`, 'error')
  const room = { info, slug, buffer: [], stvIndex: new Map(), kickIndex: new Map(), chatters: new Map(), leave: null }
  rooms.set(slug, room)
  store.set((s) => ({ channels: [...s.channels, { slug, ...info }], messages: { ...s.messages, [slug]: [] } }))
  if (persist) persistChannels()
  if (activate) setActive(slug)

  room.leave = realtime.join({ channelId: info.id, chatroomId: info.chatroomId }, (e) => onEvent(room, e))
  loadEmotes(room)
  k.kick.history(info.id).then((list) => {
    const ctx = roomCtx(room)
    const msgs = list
      .slice()
      .reverse()
      .map((raw) => normalizeChat(raw, ctx))
    for (const m of msgs) trackChatter(room, m)
    store.set((s) => {
      const existing = s.messages[slug] || []
      const seen = new Set(existing.map((m) => m.id))
      const merged = [...msgs.filter((m) => !seen.has(m.id)).map((m) => ({ ...m, history: true })), ...existing]
      return { messages: { ...s.messages, [slug]: merged.slice(-s.settings.maxMessages) } }
    })
  })
}

async function loadEmotes(room) {
  try {
    const sets = await k.kick.emotes(room.info.slug, room.info.userId)
    // Sets arrive channel-first. Kick: first set wins a name. 7TV: iterate
    // global before channel so the channel's emote overrides the global one.
    const kickIndex = new Map()
    const stvIndex = new Map()
    for (const set of sets.filter((x) => x.provider === 'kick')) {
      for (const e of set.emotes) if (!kickIndex.has(e.name)) kickIndex.set(e.name, e)
    }
    for (const set of sets.filter((x) => x.provider === '7tv').reverse()) {
      for (const e of set.emotes) stvIndex.set(e.name, { ...e, provider: '7tv' })
    }
    room.kickIndex = kickIndex
    room.stvIndex = stvIndex
    store.set((s) => ({ emotes: { ...s.emotes, [room.slug]: sets } }))
    retokenize(room)
  } catch (e) {
    console.warn('emotes failed', e)
  }
}

export function removeChannel(slug) {
  const room = rooms.get(slug)
  if (!room) return
  room.leave?.()
  rooms.delete(slug)
  store.set((s) => {
    const channels = s.channels.filter((c) => c.slug !== slug)
    const { [slug]: _m, ...messages } = s.messages
    const active = s.active === slug ? channels[Math.max(0, s.channels.findIndex((c) => c.slug === slug) - 1)]?.slug || null : s.active
    return { channels, messages, active }
  })
  persistChannels()
}

export function reorderChannels(from, to) {
  store.set((s) => {
    const channels = [...s.channels]
    const [moved] = channels.splice(from, 1)
    channels.splice(to, 0, moved)
    return { channels }
  })
  persistChannels()
}

export function setActive(slug) {
  store.set((s) => ({ active: slug, unread: { ...s.unread, [slug]: { count: 0, mention: false } } }))
}

function trackChatter(room, m) {
  if (m.kind !== 'chat') return
  room.chatters.delete(m.user.username)
  room.chatters.set(m.user.username, { id: m.user.id, username: m.user.username, color: m.user.color })
  if (room.chatters.size > 500) room.chatters.delete(room.chatters.keys().next().value)
}

export const getChatters = (slug) => [...(rooms.get(slug)?.chatters.values() || [])].reverse()
export const getRoom = (slug) => rooms.get(slug)

function onEvent(room, { event, data }) {
  if (event === 'App\\Events\\ChatMessageEvent') {
    const m = normalizeChat(data, roomCtx(room))
    trackChatter(room, m)
    room.buffer.push(m)
    return
  }
  const r = normalizeEvent(event, data)
  if (!r) return
  const slug = room.slug
  if (r.action === 'delete') {
    room.buffer.push({ op: 'delete', id: r.id })
    if (watched.has(slug)) k.overlay.push(slug, { type: 'delete', id: r.id })
  }
  if (r.action === 'ban') {
    room.buffer.push({ op: 'ban', userId: r.userId })
    if (watched.has(slug)) k.overlay.push(slug, { type: 'ban', userId: r.userId })
  }
  if (r.action === 'clear') {
    room.buffer.push({ op: 'clear' })
    if (watched.has(slug)) k.overlay.push(slug, { type: 'clear' })
  }
  if (r.action === 'pin') store.set((s) => ({ pinned: { ...s.pinned, [slug]: r.pin } }))
  if (r.action === 'unpin') store.set((s) => ({ pinned: { ...s.pinned, [slug]: null } }))
  if (r.action === 'poll') store.set((s) => ({ polls: { ...s.polls, [slug]: r.poll } }))
  if (r.action === 'live') {
    patchChannel(slug, { live: r.live ? { ...(room.info.live || {}), startedAt: new Date().toISOString() } : null })
    if (!r.live) store.set((s) => ({ polls: { ...s.polls, [slug]: null } }))
    else refreshInfo(slug)
  }
  if (r.action === 'chatroom' && r.chatroom) {
    const c = r.chatroom
    patchChannel(slug, {
      chatroom: {
        slowMode: !!c.slow_mode?.enabled,
        interval: c.slow_mode?.message_interval,
        followersMode: !!c.followers_mode?.enabled,
        subscribersMode: !!c.subscribers_mode?.enabled,
        emotesMode: !!c.emotes_mode?.enabled
      }
    })
  }
  if (r.line) room.buffer.push(r.line)
}

function patchChannel(slug, patch) {
  const room = rooms.get(slug)
  if (room) room.info = { ...room.info, ...patch }
  store.set((s) => ({ channels: s.channels.map((c) => (c.slug === slug ? { ...c, ...patch } : c)) }))
}

async function refreshInfo(only) {
  const slugs = typeof only === 'string' ? [only] : [...rooms.keys()]
  for (const slug of slugs) {
    try {
      const info = await k.kick.channel(slug)
      if (rooms.has(slug)) patchChannel(slug, { live: info.live, followers: info.followers, chatroom: info.chatroom, avatar: info.avatar })
    } catch {
      /* transient */
    }
  }
}

// Apply buffered realtime events to the store in one render per tick.
function flush() {
  const s = store.get()
  let messages = null
  let unread = null
  let mentions = null
  for (const [slug, room] of rooms) {
    if (!room.buffer.length) continue
    const batch = room.buffer
    room.buffer = []
    let list = (messages || s.messages)[slug] || []
    list = list.slice()
    for (const item of batch) {
      if (item.op === 'delete') list = list.map((m) => (m.id === item.id ? { ...m, deleted: true } : m))
      else if (item.op === 'ban') list = list.map((m) => (m.user?.id === item.userId ? { ...m, deleted: true } : m))
      else if (item.op === 'clear') list = list.map((m) => (m.kind === 'chat' ? { ...m, deleted: true } : m))
      else {
        list.push(item)
        if (item.kind === 'chat') onNewChat(slug, item, s)
        if (item.kind === 'chat' && (item.mentioned || item.highlighted)) {
          mentions = mentions || s.mentions.slice()
          mentions.push({ slug, msg: item })
        }
        if (s.active !== slug && item.kind === 'chat') {
          unread = unread || { ...s.unread }
          const u = unread[slug] || { count: 0, mention: false }
          unread[slug] = { count: u.count + 1, mention: u.mention || item.mentioned || item.highlighted }
        }
      }
    }
    if (list.length > s.settings.maxMessages) list = list.slice(-s.settings.maxMessages)
    messages = { ...(messages || s.messages), [slug]: list }
  }
  if (!messages) return
  const patch = { messages }
  if (unread) patch.unread = unread
  if (mentions) patch.mentions = mentions.slice(-200)
  store.set(patch)
}

function onNewChat(slug, m, s) {
  if (watched.has(slug) && !m.deleted) {
    k.overlay.push(slug, {
      type: 'msg',
      id: m.id,
      user: m.user,
      segments: m.segments,
      isBot: m.isBot,
      reply: m.reply ? { username: m.reply.username } : null
    })
  }
  if ((m.mentioned || m.highlighted) && !s.settings.ignoredUsers.includes(m.user.username.toLowerCase())) {
    const away = !document.hasFocus() || s.active !== slug
    if (away && s.settings.mentionSound) beep()
    if (!document.hasFocus() && s.settings.desktopNotify) {
      const n = new Notification(`${m.user.username} in #${slug}`, { body: m.segments.map((x) => x.text || x.name).join(''), silent: true })
      n.onclick = () => setActive(slug)
    }
  }
}

let audio
function beep() {
  try {
    audio ??= new AudioContext()
    const o = audio.createOscillator()
    const g = audio.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(880, audio.currentTime)
    o.frequency.exponentialRampToValueAtTime(1320, audio.currentTime + 0.08)
    g.gain.setValueAtTime(0.0001, audio.currentTime)
    g.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25)
    o.connect(g).connect(audio.destination)
    o.start()
    o.stop(audio.currentTime + 0.26)
  } catch {
    /* audio unavailable */
  }
}

export async function sendMessage(slug, text) {
  const room = rooms.get(slug)
  if (!room) return false
  const content = encodeOutgoing(text.trim(), room.kickIndex)
  if (!content) return false
  const reply = store.get().reply
  try {
    await k.api.send({
      broadcasterUserId: room.info.userId,
      content,
      replyTo: reply?.slug === slug ? reply.msg.id : undefined
    })
    store.set({ reply: null })
    return true
  } catch (e) {
    toast(e.message, 'error')
    return false
  }
}

const modCall = async (fn, okText) => {
  try {
    await fn()
    if (okText) toast(okText, 'ok')
  } catch (e) {
    toast(e.message, 'error')
  }
}

export const deleteMessage = (slug, id) => modCall(() => k.api.deleteMessage(id))
export const timeoutUser = (slug, user, minutes) =>
  modCall(() => k.api.ban({ broadcasterUserId: rooms.get(slug).info.userId, userId: user.id, duration: minutes }), `Timed out ${user.username}`)
export const banUser = (slug, user, reason) =>
  modCall(() => k.api.ban({ broadcasterUserId: rooms.get(slug).info.userId, userId: user.id, reason }), `Banned ${user.username}`)
export const unbanUser = (slug, user) =>
  modCall(() => k.api.unban({ broadcasterUserId: rooms.get(slug).info.userId, userId: user.id }), `Unbanned ${user.username}`)

export async function updateSettings(patch) {
  const settings = { ...store.get().settings, ...patch }
  store.set({ settings })
  await k.setState({ settings })
  if ('show7tv' in patch || 'highlightWords' in patch) for (const room of rooms.values()) retokenize(room)
}

// Re-run tokenizing/highlighting over loaded messages (after emotes load or
// settings change) so the change applies retroactively.
function retokenize(room) {
  const ctx = roomCtx(room)
  store.set((s) => ({
    messages: {
      ...s.messages,
      [room.slug]: (s.messages[room.slug] || []).map((m) => {
        if (m.kind !== 'chat') return m
        const n = normalizeChat(
          { id: m.id, content: m.content, sender: { id: m.user.id, username: m.user.username, identity: {} } },
          ctx
        )
        return { ...m, segments: n.segments, mentioned: n.mentioned, highlighted: n.highlighted }
      })
    }
  }))
}

export async function login() {
  // A second click while waiting just re-opens Kick's page in the browser
  // (the first call is still awaiting the same login).
  if (store.get().loggingIn) {
    k.login().catch(() => {})
    toast('Kick login opened again in your browser', 'info')
    return
  }
  store.set({ loggingIn: true })
  try {
    const user = await k.login()
    store.set({ user })
    toast(`Logged in as ${user.username}`, 'ok')
  } catch (e) {
    if (e.message !== 'Login cancelled.') toast(e.message, 'error')
  } finally {
    store.set({ loggingIn: false })
  }
}

export const cancelLogin = () => k.cancelLogin()

export async function logout() {
  await k.logout()
  store.set({ user: null })
}

export async function refreshAuthState() {
  const s = await k.getState()
  store.set({ authMode: s.authMode, byoClientId: s.byoClientId, hasByoSecret: s.hasByoSecret, useByo: s.useByo, user: s.user })
}
