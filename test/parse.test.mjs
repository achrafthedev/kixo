import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encodeOutgoing, normalizeChat, normalizeEvent, resolveBadges, subBadgeFor, tokenize } from '../src/renderer/src/lib/parse.js'

test('tokenize: kick emote tags, 7TV words, links and mentions', () => {
  const stv = new Map([['KEKW', { url: 'https://cdn.7tv.app/emote/1/2x.webp', provider: '7tv' }]])
  const segs = tokenize('hi [emote:37226:KEKW] KEKW @Bob, see https://kick.com/xqc.', stv)
  assert.deepEqual(
    segs.map((s) => s.type),
    ['text', 'emote', 'text', 'emote', 'text', 'mention', 'text', 'link', 'text']
  )
  assert.equal(segs[1].url, 'https://files.kick.com/emotes/37226/fullsize')
  assert.equal(segs[1].provider, 'kick')
  assert.equal(segs[3].provider, '7tv')
  assert.equal(segs[5].username, 'Bob')
  assert.equal(segs[7].href, 'https://kick.com/xqc')
})

test('tokenize: plain text is merged into one segment', () => {
  assert.deepEqual(tokenize('just some words', new Map()), [{ type: 'text', text: 'just some words' }])
})

test('normalizeChat: reply metadata, mention and highlight detection', () => {
  const raw = {
    id: 'a',
    content: 'hey achraf, giveaway time',
    type: 'reply',
    created_at: '2026-10-17T15:00:00Z',
    metadata: JSON.stringify({ original_sender: { username: 'x' }, original_message: { id: 'b', content: 'yo [emote:1:Pog]' } }),
    sender: { id: 1, username: 'Viewer', identity: { color: '#fff', badges: [] } }
  }
  const m = normalizeChat(raw, { me: 'Achraf', highlightWords: ['giveaway'] })
  assert.equal(m.mentioned, true)
  assert.equal(m.highlighted, true)
  assert.equal(m.reply.content, 'yo Pog')
  assert.equal(m.ts, Date.parse('2026-10-17T15:00:00Z'))
})

test('normalizeChat: own messages are never mentions; bots detected', () => {
  const self = normalizeChat({ id: '1', content: '@achraf hi', sender: { username: 'achraf', identity: {} } }, { me: 'achraf' })
  assert.equal(self.mentioned, false)
  assert.equal(self.isSelf, true)
  const bot = normalizeChat({ id: '2', content: 'hi', sender: { username: 'BotRix', identity: {} } }, {})
  assert.equal(bot.isBot, true)
  assert.equal(bot.user.badges.length, 1)
})

test('badges: badges_v2 preferred, unselected hidden, legacy subscriber uses channel art', () => {
  const v2 = resolveBadges({
    badges_v2: [
      { name: 'level', image_url: 'l.png', selected: false },
      { name: 'kick_founder22', image_url: 'f.png', selected: true, sort_order: 2 }
    ]
  })
  assert.deepEqual(v2, [{ src: 'f.png', title: 'Kick Founder' }])
  const subs = [
    { months: 1, src: 's1' },
    { months: 6, src: 's6' }
  ]
  assert.equal(subBadgeFor(subs, 8), 's6')
  const legacy = resolveBadges({ badges: [{ type: 'subscriber', count: 3 }, { type: 'moderator' }] }, subs)
  assert.equal(legacy[0].src, 's1')
  assert.equal(legacy[1].title, 'Moderator')
})

test('normalizeEvent: bans, deletes, subs, gifts', () => {
  assert.deepEqual(normalizeEvent('App\\Events\\MessageDeletedEvent', { message: { id: 'z' } }), { action: 'delete', id: 'z' })
  const ban = normalizeEvent('App\\Events\\UserBannedEvent', { user: { id: 5, username: 'u' }, banned_by: { username: 'mod' }, duration: 10 })
  assert.equal(ban.action, 'ban')
  assert.match(ban.line.text, /timed out for 10m by mod/)
  assert.match(normalizeEvent('App\\Events\\GiftedSubscriptionsEvent', { gifter_username: 'g', gifted_usernames: ['a', 'b'] }).line.text, /gifted 2 subs/)
  assert.equal(normalizeEvent('App\\Events\\Unknown', {}), null)
})

test('encodeOutgoing: typed Kick emote names become tags', () => {
  const idx = new Map([['KEKW', { id: '37226', name: 'KEKW' }]])
  assert.equal(encodeOutgoing('lol KEKW  ok', idx), 'lol [emote:37226:KEKW]  ok')
})
