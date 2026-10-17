// Pure helpers: normalize Kick payloads into Kixo messages and tokenize message
// content into renderable segments. No DOM access so they can be unit-tested.

const svg = (body, bg) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="${bg}"/>${body}</svg>`
  )

// Fallback art for legacy `identity.badges` entries (when Kick sends no badges_v2).
export const LEGACY_BADGES = {
  broadcaster: { title: 'Broadcaster', src: svg('<path d="M4 6h5l3-2v8l-3-2H4z" fill="#fff"/>', '#e9113c') },
  moderator: { title: 'Moderator', src: svg('<path d="M3.5 12.5l6-6M9.5 3.5l3 3M4.5 9.5l2 2M10.5 2.5l3 3-1 1-3-3z" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none"/>', '#00c853') },
  vip: { title: 'VIP', src: svg('<path d="M3 6.5L5 4h6l2 2.5L8 13z" fill="#fff"/><path d="M3 6.5h10M6.5 4L8 13M9.5 4L8 13" stroke="#e8a500" stroke-width=".8" fill="none"/>', '#ffb300') },
  og: { title: 'OG', src: svg('<text x="8" y="11.5" font-size="7" font-weight="700" text-anchor="middle" fill="#fff" font-family="sans-serif">OG</text>', '#1f9f6f') },
  founder: { title: 'Founder', src: svg('<path d="M8 3l1.6 3.4 3.7.4-2.8 2.5.8 3.7L8 11.2 4.7 13l.8-3.7L2.7 6.8l3.7-.4z" fill="#fff"/>', '#b0007a') },
  verified: { title: 'Verified', src: svg('<path d="M5 8.5l2 2 4-4.5" stroke="#fff" stroke-width="1.8" fill="none"/>', '#1fb15b') },
  staff: { title: 'Kick Staff', src: svg('<text x="8" y="11.5" font-size="8" font-weight="800" text-anchor="middle" fill="#000" font-family="sans-serif">K</text>', '#53fc18') },
  sub_gifter: { title: 'Sub Gifter', src: svg('<path d="M3 7h10v2H3zM4 9h8v4H4zM8 7v6M6 7c-2 0-2-3 0-2l2 2 2-2c2-1 2 2 0 2" stroke="#fff" fill="none"/>', '#7b4bff') },
  subscriber: { title: 'Subscriber', src: svg('<path d="M8 3l1.6 3.4 3.7.4-2.8 2.5.8 3.7L8 11.2 4.7 13l.8-3.7L2.7 6.8l3.7-.4z" fill="#000"/>', '#53fc18') },
  bot: { title: 'Bot', src: svg('<rect x="4" y="5" width="8" height="7" rx="2" fill="#fff"/><circle cx="6.5" cy="8.5" r="1" fill="#555"/><circle cx="9.5" cy="8.5" r="1" fill="#555"/>', '#555') }
}

export const KNOWN_BOTS = new Set(['botrix', 'kicklet', 'kickbot', 'streamelements', 'fossabot', 'nightbot', 'sery_bot', 'moobot'])

export function subBadgeFor(subBadges, months) {
  let pick = null
  for (const b of subBadges || []) if (months >= b.months) pick = b
  return pick?.src || null
}

// Display order for channel roles, as on kick.com.
const ROLE_ORDER = ['broadcaster', 'staff', 'moderator', 'vip', 'og', 'founder', 'verified', 'subscriber', 'sub_gifter', 'bot']

// Kick sends two lists: `badges` = channel roles (mod, VIP, OG, sub, gifter,
// verified, bot) and `badges_v2` = global cosmetics (level, founder, event
// badges). Show both: roles first, then the cosmetics the user has selected.
export function resolveBadges(identity, subBadges) {
  const roles = (identity?.badges || [])
    .slice()
    .sort((a, b) => rank(a.type) - rank(b.type))
    .map((b) => {
      if (b.type === 'subscriber') {
        const src = subBadgeFor(subBadges, b.count || 1) || LEGACY_BADGES.subscriber.src
        return { src, title: `Subscriber (${b.count || 1} mo)` }
      }
      const base = LEGACY_BADGES[b.type]
      return base ? { ...base, title: b.count ? `${base.title} (${b.count})` : base.title } : null
    })
    .filter(Boolean)
  const cosmetics = (identity?.badges_v2 || [])
    .filter((b) => b.image_url && b.selected !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((b) => ({ src: b.image_url, title: prettyBadge(b.name, b.metadata) }))
  return [...roles, ...cosmetics]
}

const rank = (type) => {
  const i = ROLE_ORDER.indexOf(type)
  return i === -1 ? ROLE_ORDER.length : i
}

function prettyBadge(name = '', meta) {
  if (name === 'level' && meta?.level) return `Level ${meta.level}`
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/\d+$/, '')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const EMOTE_RE = /\[emote:(\d+):([^\]]*)\]/g
const URL_RE = /^(https?:\/\/[^\s<>"]+[^\s<>".,!?)\]]|(?:www\.)[^\s<>"]+\.[a-z]{2,}[^\s<>".,!?)\]]*)$/i

// emoteIndex: Map<name, {url, name, zeroWidth?}> of words that render as emotes
// (7TV channel + global). Kick emotes arrive pre-tagged as [emote:id:name].
export function tokenize(content, emoteIndex) {
  const out = []
  const pushText = (text) => {
    if (!text) return
    const last = out[out.length - 1]
    if (last?.type === 'text') last.text += text
    else out.push({ type: 'text', text })
  }
  const words = (chunk) => {
    for (const part of chunk.split(/(\s+)/)) {
      if (!part) continue
      if (/^\s+$/.test(part)) {
        pushText(part)
        continue
      }
      const e = emoteIndex?.get(part)
      const [, core, trail] = part.match(/^(.*?)([.,!?:;)\]]*)$/)
      if (e) {
        out.push({ type: 'emote', name: part, url: e.url, zeroWidth: !!e.zeroWidth, provider: e.provider || '7tv' })
      } else if (URL_RE.test(core)) {
        out.push({ type: 'link', text: core, href: core.startsWith('http') ? core : `https://${core}` })
        pushText(trail)
      } else if (/^@[\w]{2,25}[,:.!?]?$/.test(part)) {
        const name = part.replace(/[,:.!?]$/, '')
        out.push({ type: 'mention', text: name, username: name.slice(1) })
        if (name !== part) pushText(part.slice(name.length))
      } else {
        pushText(part)
      }
    }
  }
  let last = 0
  for (const m of content.matchAll(EMOTE_RE)) {
    words(content.slice(last, m.index))
    out.push({ type: 'emote', name: m[2], url: `https://files.kick.com/emotes/${m[1]}/fullsize`, provider: 'kick', id: m[1] })
    last = m.index + m[0].length
  }
  words(content.slice(last))
  return out
}

export const plainText = (content) => content.replace(EMOTE_RE, (_m, _id, name) => name)

// Raw Kick chat message (realtime or history) -> Kixo message.
export function normalizeChat(raw, ctx) {
  const sender = raw.sender || {}
  const identity = sender.identity || {}
  let meta = raw.metadata
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta)
    } catch {
      meta = null
    }
  }
  const username = sender.username || 'unknown'
  const isBot = meta?.sender_type === 'bot' || KNOWN_BOTS.has(username.toLowerCase())
  const content = raw.content || ''
  const me = ctx.me?.toLowerCase()
  const lower = plainText(content).toLowerCase()
  const isSelf = !!me && username.toLowerCase() === me
  const mentioned = !!me && !isSelf && new RegExp(`(^|[^\\w])@?${escapeRe(me)}(?![\\w])`, 'i').test(lower)
  const highlighted =
    !isSelf && (ctx.highlightWords || []).some((w) => w && new RegExp(`(^|[^\\w])${escapeRe(w.toLowerCase())}(?![\\w])`).test(lower))
  const badges = resolveBadges(identity, ctx.subBadges)
  if (isBot && !badges.length) badges.push(LEGACY_BADGES.bot)
  return {
    id: raw.id,
    kind: 'chat',
    ts: Date.parse(raw.created_at) || Date.now(),
    user: { id: sender.id, username, slug: sender.slug || username.toLowerCase(), color: identity.color || null, badges },
    content,
    segments: tokenize(content, ctx.emoteIndex),
    reply:
      raw.type === 'reply' && meta?.original_message
        ? {
            id: meta.original_message.id,
            username: meta.original_sender?.username || '',
            content: plainText(meta.original_message.content || '')
          }
        : null,
    isBot,
    isSelf,
    mentioned,
    highlighted
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function formatDuration(minutes) {
  if (!minutes) return 'permanently'
  if (minutes < 60) return `for ${minutes}m`
  if (minutes < 1440) return `for ${Math.round(minutes / 60)}h`
  return `for ${Math.round(minutes / 1440)}d`
}

// Non-chat realtime events -> a system/event line, or an action for the store.
export function normalizeEvent(event, d) {
  const name = (event || '').replace(/^App\\Events\\/, '')
  const ts = Date.now()
  const sys = (text, tone = 'info', extra = {}) => ({ kind: 'event', id: `${name}-${ts}-${Math.random()}`, ts, tone, text, ...extra })
  switch (name) {
    case 'MessageDeletedEvent':
      return { action: 'delete', id: d?.message?.id }
    case 'UserBannedEvent': {
      const who = d?.user?.username
      const by = d?.banned_by?.username
      const mins = d?.permanent ? 0 : d?.duration
      return { action: 'ban', userId: d?.user?.id, line: sys(`${who} was ${mins ? 'timed out' : 'banned'} ${formatDuration(mins)}${by ? ` by ${by}` : ''}`, 'mod') }
    }
    case 'UserUnbannedEvent':
      return { line: sys(`${d?.user?.username} was unbanned${d?.unbanned_by?.username ? ` by ${d.unbanned_by.username}` : ''}`, 'mod') }
    case 'ChatroomClearEvent':
      return { action: 'clear', line: sys('Chat was cleared by a moderator', 'mod') }
    case 'PinnedMessageCreatedEvent':
      return { action: 'pin', pin: d }
    case 'PinnedMessageDeletedEvent':
      return { action: 'unpin' }
    case 'SubscriptionEvent':
      return { line: sys(`${d?.username} subscribed${d?.months > 1 ? ` for ${d.months} months` : ''}!`, 'sub') }
    case 'GiftedSubscriptionsEvent': {
      const n = d?.gifted_usernames?.length || 1
      return { line: sys(`${d?.gifter_username || 'Anonymous'} gifted ${n} sub${n > 1 ? 's' : ''}!`, 'gift') }
    }
    case 'StreamHostEvent':
      return { line: sys(`${d?.host_username} is hosting with ${d?.number_viewers ?? 0} viewers`, 'host') }
    case 'KicksGifted':
    case 'KicksGiftedEvent': {
      const amount = d?.gift?.amount ?? d?.amount
      const who = d?.sender?.username || d?.username || 'Someone'
      return { line: sys(`${who} sent ${amount ?? ''} KICKs${d?.message ? `: ${d.message}` : ''}`, 'kicks') }
    }
    case 'StreamerIsLive':
      return { action: 'live', live: true, line: sys('Stream is now live', 'live') }
    case 'StopStreamBroadcast':
      return { action: 'live', live: false, line: sys('Stream went offline', 'info') }
    case 'ChatroomUpdatedEvent':
      return { action: 'chatroom', chatroom: d }
    case 'PollUpdateEvent':
      return { action: 'poll', poll: d?.poll }
    case 'PollDeleteEvent':
      return { action: 'poll', poll: null }
    default:
      return null
  }
}

// Turn typed Kick emote names into [emote:id:name] tags before sending.
export function encodeOutgoing(text, kickIndex) {
  return text
    .split(/(\s+)/)
    .map((w) => {
      const e = kickIndex?.get(w)
      return e ? `[emote:${e.id}:${e.name}]` : w
    })
    .join('')
}
