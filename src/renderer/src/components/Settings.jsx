import { useState } from 'react'
import { login, logout, refreshAuthState, updateSettings } from '../lib/chat.js'
import { store, toast, useStore } from '../lib/store.js'
import Icon from './Icon.jsx'

const SECTIONS = [
  ['appearance', 'Appearance'],
  ['chat', 'Chat'],
  ['filters', 'Highlights & filters'],
  ['window', 'Window & alerts'],
  ['account', 'Account'],
  ['overlay', 'OBS overlay'],
  ['about', 'About']
]

const ACCENTS = ['#53fc18', '#00e5ff', '#a970ff', '#ff4f8b', '#ffb020', '#ffffff']

function Toggle({ label, hint, value, onChange }) {
  return (
    <label className="row toggle-row">
      <span>
        {label}
        {hint && <small className="dim">{hint}</small>}
      </span>
      <button className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)} role="switch" aria-checked={value}>
        <span />
      </button>
    </label>
  )
}

function Range({ label, value, min, max, step, onChange, fmt = (v) => v }) {
  return (
    <label className="row">
      <span>{label}</span>
      <span className="range">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="dim small">{fmt(value)}</span>
      </span>
    </label>
  )
}

function ListEditor({ label, hint, items, onChange, placeholder }) {
  const [v, setV] = useState('')
  const add = () => {
    const w = v.trim().toLowerCase()
    if (w && !items.includes(w)) onChange([...items, w])
    setV('')
  }
  return (
    <div className="list-editor">
      <div className="le-label">
        {label}
        {hint && <small className="dim">{hint}</small>}
      </div>
      <div className="le-input">
        <input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn small" onClick={add}>
          Add
        </button>
      </div>
      <div className="chips">
        {items.map((w) => (
          <span key={w} className="chip removable" onClick={() => onChange(items.filter((x) => x !== w))} title="Remove">
            {w} <Icon name="x" size={10} />
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Settings() {
  const modal = useStore((s) => s.modal)
  const [section, setSection] = useState(modal.section || 'appearance')
  const s = useStore((st) => st.settings)
  const close = () => store.set({ modal: null })
  const set = (patch) => updateSettings(patch)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal settings">
        <aside className="settings-nav">
          <div className="settings-title">Settings</div>
          {SECTIONS.map(([id, label]) => (
            <button key={id} className={section === id ? 'on' : ''} onClick={() => setSection(id)}>
              {label}
            </button>
          ))}
        </aside>
        <div className="settings-body">
          <button className="icon-btn modal-x" onClick={close}>
            <Icon name="x" />
          </button>
          {section === 'appearance' && (
            <>
              <h3>Appearance</h3>
              <label className="row">
                <span>Theme</span>
                <select value={s.theme} onChange={(e) => set({ theme: e.target.value })}>
                  <option value="dark">Dark</option>
                  <option value="midnight">Midnight (OLED)</option>
                  <option value="slate">Slate</option>
                  <option value="light">Light</option>
                </select>
              </label>
              <div className="row">
                <span>Accent colour</span>
                <span className="accents">
                  {ACCENTS.map((c) => (
                    <button key={c} className={`accent ${s.accent === c ? 'on' : ''}`} style={{ background: c }} onClick={() => set({ accent: c })} />
                  ))}
                  <input type="color" value={s.accent} onChange={(e) => set({ accent: e.target.value })} />
                </span>
              </div>
              <Range label="Font size" value={s.fontSize} min={11} max={22} step={1} onChange={(v) => set({ fontSize: v })} fmt={(v) => `${v}px`} />
              <Range label="Emote size" value={s.emoteScale} min={0.6} max={2} step={0.1} onChange={(v) => set({ emoteScale: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Toggle label="Compact mode" hint="Tighter spacing to fit more chat" value={s.compact} onChange={(v) => set({ compact: v })} />
            </>
          )}
          {section === 'chat' && (
            <>
              <h3>Chat</h3>
              <Toggle label="Show timestamps" value={s.timestamps} onChange={(v) => set({ timestamps: v })} />
              <Toggle label="24-hour time" value={s.timestamp24h} onChange={(v) => set({ timestamp24h: v })} />
              <Toggle label="Show badges" value={s.showBadges} onChange={(v) => set({ showBadges: v })} />
              <Toggle label="7TV emotes" hint="Show channel and global 7TV emotes" value={s.show7tv} onChange={(v) => set({ show7tv: v })} />
              <Toggle label="Show subs, gifts, hosts & mod events" value={s.showEvents} onChange={(v) => set({ showEvents: v })} />
              <Toggle label="Moderator quick actions" hint="Delete / timeout buttons when hovering messages" value={s.showModTools} onChange={(v) => set({ showModTools: v })} />
              <Range label="Messages kept per channel" value={s.maxMessages} min={100} max={2000} step={100} onChange={(v) => set({ maxMessages: v })} />
            </>
          )}
          {section === 'filters' && (
            <>
              <h3>Highlights &amp; filters</h3>
              <ListEditor
                label="Highlight words"
                hint="Messages containing these words are highlighted and land in Mentions"
                items={s.highlightWords}
                onChange={(v) => set({ highlightWords: v })}
                placeholder="e.g. giveaway"
              />
              <ListEditor label="Ignored users" hint="Their messages are hidden everywhere" items={s.ignoredUsers} onChange={(v) => set({ ignoredUsers: v })} placeholder="username" />
              <Toggle label="Hide bot messages" hint="Botrix, Kicklet, StreamElements and other bots" value={s.hideBots} onChange={(v) => set({ hideBots: v })} />
            </>
          )}
          {section === 'window' && (
            <>
              <h3>Window &amp; alerts</h3>
              <Toggle label="Always on top" hint="Keep chat above your game or OBS" value={s.alwaysOnTop} onChange={(v) => set({ alwaysOnTop: v })} />
              <Range label="Window opacity" value={s.opacity} min={0.3} max={1} step={0.05} onChange={(v) => set({ opacity: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Toggle label="Sound on mention" value={s.mentionSound} onChange={(v) => set({ mentionSound: v })} />
              <Toggle label="Desktop notification on mention" hint="Only when Kixo isn't focused" value={s.desktopNotify} onChange={(v) => set({ desktopNotify: v })} />
            </>
          )}
          {section === 'account' && <Account />}
          {section === 'overlay' && <OverlayInfo />}
          {section === 'about' && <About />}
        </div>
      </div>
    </div>
  )
}

function Account() {
  const user = useStore((s) => s.user)
  const authMode = useStore((s) => s.authMode)
  const byoClientId = useStore((s) => s.byoClientId)
  const hasByoSecret = useStore((s) => s.hasByoSecret)
  const [id, setId] = useState(byoClientId)
  const [secret, setSecret] = useState('')
  const [show, setShow] = useState(authMode === 'none' || authMode === 'byo')

  const saveByo = async () => {
    await window.kixo.setByo({ clientId: id, clientSecret: secret || (hasByoSecret ? undefined : '') })
    setSecret('')
    await refreshAuthState()
    toast('Kick app saved', 'ok')
  }
  const clearByo = async () => {
    await window.kixo.setByo({ clientId: '', clientSecret: '' })
    setId('')
    await refreshAuthState()
  }

  return (
    <>
      <h3>Account</h3>
      {user ? (
        <div className="account-card">
          {user.avatar && <img src={user.avatar} alt="" />}
          <div>
            <div>
              Logged in as <b>{user.username}</b>
            </div>
            <div className="dim small">Sending, moderation and stream tools use Kick's official API.</div>
          </div>
          <button className="btn" onClick={logout}>
            <Icon name="logout" size={14} /> Log out
          </button>
        </div>
      ) : (
        <div className="account-card">
          <div>
            <div>Not logged in</div>
            <div className="dim small">Reading chat works without an account.</div>
          </div>
          <button className="btn primary" disabled={authMode === 'none'} onClick={login}>
            Log in with Kick
          </button>
        </div>
      )}
      <button className="link-btn" onClick={() => setShow(!show)}>
        {show ? '▾' : '▸'} Use your own Kick app {authMode === 'byo' && <span className="pill">active</span>}
      </button>
      {show && (
        <div className="byo">
          <ol className="dim small">
            <li>
              Open <a onClick={() => window.kixo.open('https://kick.com/settings/developer')}>kick.com/settings/developer</a> and create an app.
            </li>
            <li>
              Set the redirect URL to <code>http://localhost:53682/callback</code>
            </li>
            <li>Enable scopes: user:read, channel:read, channel:write, chat:write, moderation:ban, moderation:chat_message:manage, kicks:read.</li>
            <li>Paste the Client ID and Secret here. The secret is encrypted with your OS keychain and never leaves this PC except to Kick.</li>
          </ol>
          <label className="field">
            <span>Client ID</span>
            <input value={id} onChange={(e) => setId(e.target.value)} placeholder="01XXXXXXXXXXXXXXXXXXXXXXXX" />
          </label>
          <label className="field">
            <span>Client Secret {hasByoSecret && <small className="dim">(saved — leave blank to keep)</small>}</span>
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={hasByoSecret ? '••••••••' : ''} />
          </label>
          <div className="row-buttons">
            <button className="btn primary" disabled={!id.trim() || (!secret && !hasByoSecret)} onClick={saveByo}>
              Save
            </button>
            {(byoClientId || hasByoSecret) && (
              <button className="btn" onClick={clearByo}>
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function OverlayInfo() {
  const port = useStore((s) => s.overlayPort)
  const channels = useStore((s) => s.channels)
  const user = useStore((s) => s.user)
  const slug = user?.username?.toLowerCase() || channels[0]?.slug || 'yourchannel'
  const url = `http://127.0.0.1:${port}/overlay?channel=${slug}`
  return (
    <>
      <h3>OBS chat overlay</h3>
      <p className="dim small">
        Show your chat on stream with Kixo's emotes, 7TV and badges. In OBS add a <b>Browser Source</b> with the URL below. Kixo must be running; the channel
        joins automatically.
      </p>
      <div className="copy-row">
        <code>{url}</code>
        <button className="btn small" onClick={() => (navigator.clipboard.writeText(url), toast('Copied overlay URL', 'ok'))}>
          Copy
        </button>
      </div>
      <table className="opts">
        <tbody>
          <tr><td><code>channel=</code></td><td>Kick channel slug</td></tr>
          <tr><td><code>fade=30</code></td><td>Hide messages after N seconds (0 = never)</td></tr>
          <tr><td><code>size=18</code></td><td>Font size in px</td></tr>
          <tr><td><code>max=20</code></td><td>Max messages on screen</td></tr>
          <tr><td><code>bots=0</code></td><td>Hide bot messages</td></tr>
          <tr><td><code>badges=0</code></td><td>Hide badges</td></tr>
          <tr><td><code>bg=1</code></td><td>Dark bubble behind each message</td></tr>
        </tbody>
      </table>
    </>
  )
}

function About() {
  const version = useStore((s) => s.version)
  return (
    <>
      <h3>About</h3>
      <div className="about">
        <div className="welcome-logo small">kixo</div>
        <p>Version {version}</p>
        <p className="dim small">Free and open source (MIT). Not affiliated with Kick.</p>
        <div className="row-buttons">
          <button className="btn" onClick={() => window.kixo.open('https://github.com/achrafthedev/kixo')}>
            GitHub
          </button>
          <button className="btn" onClick={() => window.kixo.open('https://github.com/achrafthedev/kixo/issues/new')}>
            Report a bug
          </button>
        </div>
        <div className="shortcuts dim small">
          <span><kbd>Ctrl</kbd>+<kbd>1-9</kbd> switch tab</span>
          <span><kbd>Ctrl</kbd>+<kbd>Tab</kbd> next tab</span>
          <span><kbd>Ctrl</kbd>+<kbd>T</kbd> add channel</span>
          <span><kbd>Ctrl</kbd>+<kbd>F</kbd> search</span>
          <span><kbd>Ctrl</kbd>+<kbd>,</kbd> settings</span>
          <span><kbd>Tab</kbd> complete</span>
          <span><kbd>↑</kbd> last message</span>
        </div>
      </div>
    </>
  )
}
