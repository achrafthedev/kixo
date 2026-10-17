import { net } from 'electron'

// Read-only data the official Public API doesn't expose yet (chatroom ids, chat
// history, emote sets, realtime connection info). These are the same public
// endpoints kick.com uses for logged-out viewers. Everything that acts on your
// behalf (sending, moderation, stream edits) goes through the official API.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36'

async function getJson(url, init = {}) {
  const res = await net.fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers || {}) }
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

const cache = new Map()
async function cached(key, ttl, fn) {
  const hit = cache.get(key)
  if (hit && hit.until > Date.now()) return hit.value
  const value = await fn()
  cache.set(key, { value, until: Date.now() + ttl })
  return value
}

export async function getChannel(slug) {
  const c = await getJson(`https://kick.com/api/v2/channels/${encodeURIComponent(slug.toLowerCase())}`)
  return {
    id: c.id,
    userId: c.user_id,
    slug: c.slug,
    username: c.user?.username || c.slug,
    avatar: c.user?.profile_pic || null,
    verified: !!c.verified,
    followers: c.followers_count ?? null,
    chatroomId: c.chatroom?.id,
    chatroom: c.chatroom
      ? {
          slowMode: !!c.chatroom.slow_mode,
          interval: c.chatroom.message_interval,
          followersMode: !!c.chatroom.followers_mode,
          subscribersMode: !!c.chatroom.subscribers_mode,
          emotesMode: !!c.chatroom.emotes_mode
        }
      : null,
    subBadges: (c.subscriber_badges || [])
      .map((b) => ({ months: b.months, src: b.badge_image?.src }))
      .sort((a, b) => a.months - b.months),
    live: c.livestream
      ? {
          id: c.livestream.id,
          title: c.livestream.session_title,
          viewers: c.livestream.viewer_count,
          startedAt: c.livestream.start_time || c.livestream.created_at,
          category: c.livestream.categories?.[0]?.name || null
        }
      : null
  }
}

export function getHistory(channelId) {
  return getJson(`https://kick.com/api/v2/channels/${channelId}/messages`)
    .then((r) => r?.data?.messages || [])
    .catch(() => [])
}

export function getUserCard(slug, username) {
  return getJson(
    `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/users/${encodeURIComponent(username.toLowerCase())}`
  ).catch(() => null)
}

const kickEmoteUrl = (id) => `https://files.kick.com/emotes/${id}/fullsize`
const stvUrl = (e) => {
  const host = e.data?.host
  return host ? `https:${host.url}/2x.webp` : `https://cdn.7tv.app/emote/${e.id}/2x.webp`
}

export async function getEmotes(slug, userId) {
  const [kick, stvChannel, stvGlobal] = await Promise.all([
    cached(`kick:${slug}`, 10 * 60_000, () => getJson(`https://kick.com/emotes/${encodeURIComponent(slug)}`)).catch(() => []),
    cached(`7tv:${userId}`, 10 * 60_000, () => getJson(`https://7tv.io/v3/users/kick/${userId}`)).catch(() => null),
    cached('7tv:global', 60 * 60_000, () => getJson('https://7tv.io/v3/emote-sets/global')).catch(() => null)
  ])
  const sets = []
  for (const s of Array.isArray(kick) ? kick : []) {
    const name = s.id === 'Global' ? 'Kick Global' : s.id === 'Emoji' ? 'Emoji' : s.user?.username || s.slug || 'Channel'
    sets.push({
      id: `kick-${s.id}`,
      name,
      provider: 'kick',
      emotes: (s.emotes || []).map((e) => ({ id: String(e.id), name: e.name, url: kickEmoteUrl(e.id), subOnly: !!e.subscribers_only }))
    })
  }
  const stv = (set, name) =>
    set?.emotes?.length && sets.push({
      id: `7tv-${name}`,
      name,
      provider: '7tv',
      emotes: set.emotes.map((e) => ({ id: e.id, name: e.name, url: stvUrl(e), zeroWidth: (e.flags & 1) === 1 }))
    })
  stv(stvChannel?.emote_set, '7TV Channel')
  stv(stvGlobal, '7TV Global')
  return sets
}

// Kick moved live chat from Pusher to Centrifugo in 2026. Ask Kick which
// provider to use, and get an anonymous guest token for Centrifugo.
export async function getRealtime(channelId) {
  const clientId = crypto.randomUUID()
  const body = JSON.stringify({
    client: { id: clientId, type: 'web' },
    capabilities: { accepted_providers: [{ provider: 'pusher' }, { provider: 'centrifugo' }] }
  })
  const headers = { 'Content-Type': 'application/json', Origin: 'https://kick.com', Referer: 'https://kick.com/' }
  let connections = []
  try {
    const r = await getJson(`https://web.kick.com/api/v1/realtime/channels/${channelId}/chat/connection`, { method: 'POST', headers, body })
    connections = r?.data?.connections || []
  } catch {
    // fall through to the legacy Pusher defaults below
  }
  const cf = connections.find((c) => c.provider === 'centrifugo' && c.credentials?.url)
  if (cf) {
    const t = await getJson('https://web.kick.com/api/v1/realtime/auth/connection', {
      method: 'POST',
      headers,
      body: JSON.stringify({ client_id: clientId })
    })
    return { provider: 'centrifugo', url: cf.credentials.url, token: t?.data?.token }
  }
  const p = connections.find((c) => c.provider === 'pusher' && c.credentials?.app_key)
  return {
    provider: 'pusher',
    appKey: p?.credentials.app_key || '32cbd69e4b950bf97679',
    cluster: p?.credentials.cluster || 'us2'
  }
}
