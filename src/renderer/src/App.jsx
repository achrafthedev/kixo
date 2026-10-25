import { useEffect } from 'react'
import ChatView from './components/ChatView.jsx'
import Mentions from './components/Mentions.jsx'
import Settings from './components/Settings.jsx'
import StreamManager from './components/StreamManager.jsx'
import Tabs from './components/Tabs.jsx'
import TitleBar from './components/TitleBar.jsx'
import Toasts from './components/Toasts.jsx'
import UserCard from './components/UserCard.jsx'
import Welcome from './components/Welcome.jsx'
import { cancelLogin, login, setActive } from './lib/chat.js'
import { store, useStore } from './lib/store.js'

const THEMES = {
  dark: { bg: '#0b0d10', panel: '#12151a', panel2: '#191d24', line: '#232833', text: '#e8eaed', dim: '#8b93a1' },
  midnight: { bg: '#000000', panel: '#0a0a0c', panel2: '#121216', line: '#1d1d24', text: '#f0f0f3', dim: '#80808c' },
  slate: { bg: '#161a22', panel: '#1c212b', panel2: '#232936', line: '#2e3544', text: '#e6e9ef', dim: '#949cad' },
  light: { bg: '#f4f5f7', panel: '#ffffff', panel2: '#eceef2', line: '#dcdfe5', text: '#15181d', dim: '#5d6573' }
}

export default function App() {
  const ready = useStore((s) => s.ready)
  const settings = useStore((s) => s.settings)
  const active = useStore((s) => s.active)
  const hasChannels = useStore((s) => s.channels.length > 0)
  const modal = useStore((s) => s.modal)
  const loggingIn = useStore((s) => s.loggingIn)

  useEffect(() => {
    const t = THEMES[settings.theme] || THEMES.dark
    const root = document.documentElement.style
    for (const [k, v] of Object.entries(t)) root.setProperty(`--${k}`, v)
    root.setProperty('--accent', settings.accent)
    root.setProperty('--font', `${settings.fontSize}px`)
    root.setProperty('--emote', `${Math.round(28 * settings.emoteScale)}px`)
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme, settings.accent, settings.fontSize, settings.emoteScale])

  useEffect(() => {
    const onKey = (e) => {
      const { channels, active: cur } = store.get()
      if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
        const c = channels[Number(e.key) - 1]
        if (c) setActive(c.slug), e.preventDefault()
      } else if (e.ctrlKey && e.key === 'Tab' && channels.length) {
        const i = channels.findIndex((c) => c.slug === cur)
        const next = channels[(i + (e.shiftKey ? -1 : 1) + channels.length) % channels.length]
        setActive(next.slug)
        e.preventDefault()
      } else if (e.key === 'Escape' && store.get().modal) {
        store.set({ modal: null })
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        store.set({ modal: { type: 'settings' } })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app ${settings.compact ? 'compact' : ''}`}>
      <TitleBar />
      {ready && <Tabs />}
      {loggingIn && (
        <div className="login-bar">
          <span className="spinner" />
          <span>Approve Kixo on Kick in your browser…</span>
          <button className="btn small" onClick={login}>
            Open again
          </button>
          <button className="btn small" onClick={cancelLogin}>
            Cancel
          </button>
        </div>
      )}
      <main className="main">
        {!ready ? (
          <div className="center dim">Loading…</div>
        ) : active === '@mentions' ? (
          <Mentions />
        ) : active && hasChannels ? (
          <ChatView key={active} slug={active} />
        ) : (
          <Welcome />
        )}
      </main>
      {modal?.type === 'settings' && <Settings />}
      {modal?.type === 'user' && <UserCard {...modal} />}
      {modal?.type === 'stream' && <StreamManager />}
      <Toasts />
    </div>
  )
}
