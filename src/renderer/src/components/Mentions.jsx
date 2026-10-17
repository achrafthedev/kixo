import { setActive } from '../lib/chat.js'
import { store, useStore } from '../lib/store.js'
import { Segments } from './Message.jsx'

export default function Mentions() {
  const mentions = useStore((s) => s.mentions)
  return (
    <section className="chat">
      <div className="chat-header">
        <div className="ch-main">
          <span className="ch-title">Mentions &amp; highlights</span>
        </div>
        {mentions.length > 0 && (
          <button className="btn small" onClick={() => store.set({ mentions: [] })}>
            Clear
          </button>
        )}
      </div>
      <div className="messages">
        {mentions.length === 0 && (
          <div className="center dim small">When someone @mentions you or says one of your highlight words, it shows up here.</div>
        )}
        {[...mentions].reverse().map(({ slug, msg }) => (
          <div key={slug + msg.id} className="msg mentioned clickable" onClick={() => setActive(slug)}>
            <div className="msg-line">
              <span className="ts">{new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="chan-tag">#{slug}</span>
              <span className="name" style={{ color: msg.user.color || undefined }}>
                {msg.user.username}
              </span>
              <span className="colon">: </span>
              <span className="content">
                <Segments segments={msg.segments} />
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
