import { useState } from 'react'
import { addChannel, login } from '../lib/chat.js'
import { useStore } from '../lib/store.js'

const FEATURED = ['ces4rrs', 'nahoule82k']

export default function Welcome() {
  const [v, setV] = useState('')
  const user = useStore((s) => s.user)
  const authMode = useStore((s) => s.authMode)
  return (
    <div className="welcome">
      <div className="welcome-logo">kixo</div>
      <p className="dim">A fast, lightweight chat client for Kick.</p>
      <form
        className="welcome-form"
        onSubmit={(e) => {
          e.preventDefault()
          addChannel(v)
          setV('')
        }}
      >
        <input autoFocus placeholder="Type a channel name…" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn primary" disabled={!v.trim()}>
          Join chat
        </button>
      </form>
      <div className="chips">
        {FEATURED.map((p) => (
          <button key={p} className="chip" onClick={() => addChannel(p)}>
            {p}
          </button>
        ))}
      </div>
      {!user && (
        <p className="dim small">
          Reading chat needs no account.{' '}
          {authMode !== 'none' ? (
            <a onClick={login}>Log in with Kick</a>
          ) : (
            <span>Add a Kick app in Settings → Account</span>
          )}{' '}
          to send messages and moderate.
        </p>
      )}
      <div className="shortcuts dim small">
        <span><kbd>Ctrl</kbd>+<kbd>1-9</kbd> switch tabs</span>
        <span><kbd>Tab</kbd> complete emotes &amp; names</span>
        <span><kbd>Ctrl</kbd>+<kbd>F</kbd> search chat</span>
      </div>
    </div>
  )
}
