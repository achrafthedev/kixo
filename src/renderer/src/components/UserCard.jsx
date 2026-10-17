import { useEffect, useMemo, useState } from 'react'
import { banUser, timeoutUser, unbanUser, updateSettings } from '../lib/chat.js'
import { resolveBadges } from '../lib/parse.js'
import { store, useStore } from '../lib/store.js'
import Icon from './Icon.jsx'
import { Segments } from './Message.jsx'

const TIMEOUTS = [
  [1, '1m'],
  [10, '10m'],
  [60, '1h'],
  [1440, '1d'],
  [10080, '7d']
]

const fmtDate = (s) => (s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null)

export default function UserCard({ slug, user }) {
  const [card, setCard] = useState(null)
  const me = useStore((s) => s.user)
  const ignored = useStore((s) => s.settings.ignoredUsers)
  const channel = useStore((s) => s.channels.find((c) => c.slug === slug))
  const messages = useStore((s) => s.messages[slug])
  const close = () => store.set({ modal: null })

  useEffect(() => {
    window.kixo.kick.userCard(slug, user.username).then(setCard)
  }, [slug, user.username])

  const recent = useMemo(
    () => (messages || []).filter((m) => m.kind === 'chat' && m.user.username.toLowerCase() === user.username.toLowerCase()).slice(-30).reverse(),
    [messages, user.username]
  )

  const target = { id: card?.id ?? user.id, username: card?.username || user.username }
  const badges = card ? resolveBadges(card, channel?.subBadges) : user.badges || []
  const isIgnored = ignored.includes(target.username.toLowerCase())
  const canMod = !!me && me.username?.toLowerCase() !== target.username.toLowerCase() && target.id

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal user-card">
        <button className="icon-btn modal-x" onClick={close}>
          <Icon name="x" />
        </button>
        <div className="uc-head">
          {card?.profile_pic ? <img className="uc-avatar" src={card.profile_pic} alt="" /> : <div className="uc-avatar fallback">{target.username[0]}</div>}
          <div>
            <div className="uc-name" style={{ color: user.color || undefined }}>
              {target.username}
            </div>
            <div className="uc-badges">
              {badges.map((b, i) => (
                <img key={i} src={b.src} title={b.title} alt={b.title} className="badge" />
              ))}
              {card?.is_moderator && <span className="pill">Mod</span>}
              {card?.is_channel_owner && <span className="pill">Owner</span>}
              {card?.banned && <span className="pill danger">Banned</span>}
            </div>
          </div>
        </div>
        <div className="uc-facts">
          {card?.created_at && <span>Joined Kick {fmtDate(card.created_at)}</span>}
          {card?.following_since ? <span>Following since {fmtDate(card.following_since)}</span> : card && <span>Not following</span>}
          {card?.subscribed_for > 0 && <span>Subscribed {card.subscribed_for} mo</span>}
        </div>
        <div className="uc-actions">
          <button className="btn" onClick={() => window.kixo.open(`https://kick.com/${card?.slug || target.username.toLowerCase()}`)}>
            <Icon name="external" size={14} /> Profile
          </button>
          {me && (
            <button
              className="btn"
              onClick={() => {
                close()
                setTimeout(() => {
                  const ta = document.querySelector('.input-row textarea')
                  if (!ta) return
                  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
                  setter.call(ta, `@${target.username} ${ta.value}`)
                  ta.dispatchEvent(new Event('input', { bubbles: true }))
                  ta.focus()
                })
              }}
            >
              <Icon name="at" size={14} /> Mention
            </button>
          )}
          <button
            className="btn"
            onClick={() =>
              updateSettings({
                ignoredUsers: isIgnored ? ignored.filter((u) => u !== target.username.toLowerCase()) : [...ignored, target.username.toLowerCase()]
              })
            }
          >
            {isIgnored ? 'Unignore' : 'Ignore'}
          </button>
        </div>
        {canMod && (
          <div className="uc-mod">
            <div className="uc-label">Moderation</div>
            <div className="uc-mod-row">
              {TIMEOUTS.map(([m, l]) => (
                <button key={m} className="btn small" onClick={() => timeoutUser(slug, target, m)}>
                  {l}
                </button>
              ))}
              <button className="btn small danger" onClick={() => banUser(slug, target)}>
                Ban
              </button>
              <button className="btn small" onClick={() => unbanUser(slug, target)}>
                Unban
              </button>
            </div>
          </div>
        )}
        <div className="uc-label">Recent messages in #{slug}</div>
        <div className="uc-recent">
          {recent.length === 0 && <div className="dim small">No messages seen yet.</div>}
          {recent.map((m) => (
            <div key={m.id} className={`uc-msg ${m.deleted ? 'deleted' : ''}`}>
              <span className="ts">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <Segments segments={m.segments} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
