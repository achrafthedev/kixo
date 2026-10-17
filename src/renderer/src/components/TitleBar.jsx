import { useEffect, useState } from 'react'
import { login } from '../lib/chat.js'
import { store, useStore } from '../lib/store.js'
import Icon from './Icon.jsx'

export default function TitleBar() {
  const user = useStore((s) => s.user)
  const status = useStore((s) => s.status)
  const update = useStore((s) => s.update)
  const [max, setMax] = useState(false)
  useEffect(() => window.kixo.win.onMaximized(setMax), [])

  return (
    <header className="titlebar">
      <div className="brand">
        <span className="logo">kixo</span>
        <span className={`conn ${status}`} title={`Chat connection: ${status}`} />
      </div>
      <div className="tb-actions">
        {update?.state === 'ready' && (
          <button className="tb-btn update" onClick={() => window.kixo.updates.install()} title={`Restart to update to ${update.version}`}>
            <Icon name="update" /> Update
          </button>
        )}
        {user ? (
          <>
            <button className="tb-btn" title="Stream manager" onClick={() => store.set({ modal: { type: 'stream' } })}>
              <Icon name="broadcast" />
            </button>
            <button className="tb-user" title={`Logged in as ${user.username}`} onClick={() => store.set({ modal: { type: 'settings', section: 'account' } })}>
              {user.avatar ? <img src={user.avatar} alt="" /> : <span className="avatar-fallback">{user.username?.[0]}</span>}
            </button>
          </>
        ) : (
          <button
            className="tb-login"
            onClick={() => (store.get().authMode === 'none' ? store.set({ modal: { type: 'settings', section: 'account' } }) : login())}
          >
            Log in
          </button>
        )}
        <button className="tb-btn" title="Settings (Ctrl+,)" onClick={() => store.set({ modal: { type: 'settings' } })}>
          <Icon name="gear" />
        </button>
        <div className="win-controls">
          <button onClick={() => window.kixo.win.minimize()} title="Minimize">
            <Icon name="minus" size={14} />
          </button>
          <button onClick={() => window.kixo.win.maximize()} title={max ? 'Restore' : 'Maximize'}>
            <Icon name="square" size={12} />
          </button>
          <button className="close" onClick={() => window.kixo.win.close()} title="Close">
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>
    </header>
  )
}
