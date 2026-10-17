import { memo } from 'react'
import { deleteMessage, timeoutUser } from '../lib/chat.js'
import { store } from '../lib/store.js'
import Icon from './Icon.jsx'

const fmtTime = (ts, h24) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !h24 })

// Readable fallback colour when Kick provides none, or the colour is too dark
// for the current theme.
function nameColor(user, theme) {
  if (user.color) {
    if (theme === 'light') return user.color
    const hex = user.color.replace('#', '')
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return lum < 0.28 ? `color-mix(in srgb, ${user.color} 50%, white)` : user.color
  }
  let h = 0
  for (const c of user.username) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h} 70% ${theme === 'light' ? 38 : 65}%)`
}

export function Segments({ segments, onMention }) {
  return segments.map((s, i) => {
    if (s.type === 'emote')
      return (
        <img key={i} className={`emote ${s.zeroWidth ? 'zw' : ''}`} src={s.url} alt={s.name} title={`${s.name} (${s.provider === 'kick' ? 'Kick' : '7TV'})`} loading="lazy" draggable={false} />
      )
    if (s.type === 'link')
      return (
        <a key={i} href={s.href} target="_blank" rel="noreferrer" title={s.href}>
          {s.text}
        </a>
      )
    if (s.type === 'mention')
      return (
        <span key={i} className="mention-tag" onClick={() => onMention?.(s.username)}>
          {s.text}
        </span>
      )
    return <span key={i}>{s.text}</span>
  })
}

function Message({ m, slug, settings }) {
  if (m.kind === 'event') {
    return (
      <div className={`msg event tone-${m.tone}`}>
        {settings.timestamps && <span className="ts">{fmtTime(m.ts, settings.timestamp24h)}</span>}
        <span>{m.text}</span>
      </div>
    )
  }
  const { user: me } = store.get()
  const canMod = !!me && settings.showModTools && !m.isSelf
  const openUser = () => store.set({ modal: { type: 'user', slug, user: m.user } })
  const cls = ['msg', m.deleted && 'deleted', m.mentioned && 'mentioned', m.highlighted && 'highlighted', m.isSelf && 'self', m.history && 'history']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls}>
      {m.reply && (
        <div className="reply-ctx" title={m.reply.content}>
          <Icon name="reply" size={12} /> <b>@{m.reply.username}</b> <span>{m.reply.content}</span>
        </div>
      )}
      <div className="msg-line">
        {settings.timestamps && <span className="ts">{fmtTime(m.ts, settings.timestamp24h)}</span>}
        {settings.showBadges &&
          m.user.badges.map((b, i) => <img key={i} className="badge" src={b.src} title={b.title} alt={b.title} draggable={false} />)}
        <span className="name" style={{ color: nameColor(m.user, settings.theme) }} onClick={openUser}>
          {m.user.username}
        </span>
        <span className="colon">: </span>
        <span className="content">
          <Segments segments={m.segments} onMention={(u) => store.set({ modal: { type: 'user', slug, user: { username: u } } })} />
        </span>
        {m.deleted && <span className="deleted-tag">(deleted)</span>}
      </div>
      {!m.deleted && (
        <div className="msg-actions">
          {me && (
            <button title="Reply" onClick={() => store.set({ reply: { slug, msg: m } })}>
              <Icon name="reply" size={14} />
            </button>
          )}
          <button title="Copy message" onClick={() => navigator.clipboard.writeText(m.segments.map((s) => s.text || s.name).join(''))}>
            <Icon name="copy" size={14} />
          </button>
          {canMod && (
            <>
              <button title="Delete message" onClick={() => deleteMessage(slug, m.id)}>
                <Icon name="trash" size={14} />
              </button>
              <button title="Timeout 10 minutes" onClick={() => timeoutUser(slug, m.user, 10)}>
                <Icon name="clock" size={14} />
              </button>
              <button title="More (ban, user info)" onClick={openUser}>
                <Icon name="ban" size={14} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(Message, (a, b) => a.m === b.m && a.settings === b.settings && a.slug === b.slug)
