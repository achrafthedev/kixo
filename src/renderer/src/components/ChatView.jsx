import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { plainText, tokenize } from '../lib/parse.js'
import { useStore } from '../lib/store.js'
import ChatInput from './ChatInput.jsx'
import Icon from './Icon.jsx'
import Message, { Segments } from './Message.jsx'

function useUptime(startedAt) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [startedAt])
  if (!startedAt) return null
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt.replace(' ', 'T') + (startedAt.includes('Z') || startedAt.includes('+') ? '' : 'Z'))) / 60000))
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
}

export default function ChatView({ slug }) {
  const channel = useStore((s) => s.channels.find((c) => c.slug === slug))
  const pinned = useStore((s) => s.pinned[slug])
  const poll = useStore((s) => s.polls[slug])
  const [search, setSearch] = useState(null)
  const uptime = useUptime(channel?.live?.startedAt)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearch((s) => (s === null ? '' : s))
        setTimeout(() => document.querySelector('.search-bar input')?.focus())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!channel) return null
  const cr = channel.chatroom || {}

  return (
    <section className="chat">
      <div className="chat-header">
        <div className="ch-main">
          {channel.live ? <span className="live-pill">LIVE</span> : <span className="off-pill">OFFLINE</span>}
          <span className="ch-title" title={channel.live?.title || ''}>
            {channel.live?.title || channel.username}
          </span>
        </div>
        <div className="ch-meta">
          {channel.live?.category && <span className="ch-cat">{channel.live.category}</span>}
          {channel.live && (
            <span title="Viewers">
              <Icon name="eye" size={13} /> {Number(channel.live.viewers || 0).toLocaleString()}
            </span>
          )}
          {uptime && (
            <span title="Uptime">
              <Icon name="clock" size={13} /> {uptime}
            </span>
          )}
          {cr.slowMode && <span className="mode" title={`Slow mode: ${cr.interval}s`}>slow {cr.interval}s</span>}
          {cr.followersMode && <span className="mode" title="Followers-only chat">followers</span>}
          {cr.subscribersMode && <span className="mode" title="Subscribers-only chat">subs</span>}
          {cr.emotesMode && <span className="mode" title="Emote-only chat">emotes</span>}
          <button className="icon-btn" title="Search chat (Ctrl+F)" onClick={() => setSearch((s) => (s === null ? '' : null))}>
            <Icon name="search" size={14} />
          </button>
          <button className="icon-btn" title="Open on kick.com" onClick={() => window.kixo.open(`https://kick.com/${slug}`)}>
            <Icon name="external" size={14} />
          </button>
        </div>
      </div>
      {search !== null && (
        <div className="search-bar">
          <Icon name="search" size={14} />
          <input
            placeholder="Filter messages or @user…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearch(null)}
          />
          <button className="icon-btn" onClick={() => setSearch(null)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
      {pinned?.message && <Pinned pin={pinned} />}
      {poll && <Poll poll={poll} />}
      <MessageList slug={slug} search={search} />
      <ChatInput slug={slug} channel={channel} />
    </section>
  )
}

function Pinned({ pin }) {
  const [open, setOpen] = useState(true)
  const m = pin.message
  return (
    <div className={`pinned ${open ? '' : 'collapsed'}`} onClick={() => setOpen(!open)}>
      <Icon name="pin" size={13} />
      <span>
        <b style={{ color: m.sender?.identity?.color }}>{m.sender?.username}</b>: <Segments segments={tokenize(m.content || '', null)} />
      </span>
    </div>
  )
}

function Poll({ poll }) {
  const total = poll.options?.reduce((a, o) => a + (o.votes || 0), 0) || 0
  return (
    <div className="poll">
      <div className="poll-title">
        <Icon name="chart" size={13} /> {poll.title}
      </div>
      {poll.options?.map((o) => {
        const pct = total ? Math.round(((o.votes || 0) / total) * 100) : 0
        return (
          <div key={o.id} className="poll-opt">
            <div className="poll-bar" style={{ width: `${pct}%` }} />
            <span>{o.label}</span>
            <span className="dim">{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}

function MessageList({ slug, search }) {
  const messages = useStore((s) => s.messages[slug])
  const settings = useStore((s) => s.settings)
  const ref = useRef(null)
  const stick = useRef(true)
  const [paused, setPaused] = useState(false)
  const [missed, setMissed] = useState(0)
  const lastLen = useRef(0)

  const visible = useMemo(() => {
    const ignored = new Set(settings.ignoredUsers.map((u) => u.toLowerCase()))
    let list = (messages || []).filter((m) => {
      if (m.kind === 'event') return settings.showEvents
      if (ignored.has(m.user.username.toLowerCase())) return false
      if (settings.hideBots && m.isBot) return false
      return true
    })
    if (search) {
      const q = search.toLowerCase()
      list = q.startsWith('@')
        ? list.filter((m) => m.kind === 'chat' && m.user.username.toLowerCase().startsWith(q.slice(1)))
        : list.filter((m) => m.kind === 'chat' && (plainText(m.content).toLowerCase().includes(q) || m.user.username.toLowerCase().includes(q)))
    }
    return list
  }, [messages, settings.ignoredUsers, settings.hideBots, settings.showEvents, search])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (stick.current) {
      el.scrollTop = el.scrollHeight
      setMissed(0)
    } else {
      setMissed((n) => n + Math.max(0, visible.length - lastLen.current))
    }
    lastLen.current = visible.length
  }, [visible])

  const onScroll = () => {
    const el = ref.current
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    stick.current = atBottom
    setPaused(!atBottom)
    if (atBottom) setMissed(0)
  }

  const jump = () => {
    stick.current = true
    setPaused(false)
    setMissed(0)
    ref.current.scrollTop = ref.current.scrollHeight
  }

  return (
    <div className="messages-wrap">
      <div className="messages" ref={ref} onScroll={onScroll}>
        {visible.length === 0 && <div className="center dim small">{search ? 'No matching messages' : 'Waiting for messages…'}</div>}
        {visible.map((m) => (
          <Message key={m.id} m={m} slug={slug} settings={settings} />
        ))}
      </div>
      {paused && (
        <button className="jump" onClick={jump}>
          <Icon name="down" size={14} /> {missed > 0 ? `${missed} new message${missed > 1 ? 's' : ''}` : 'Chat paused — jump to latest'}
        </button>
      )}
    </div>
  )
}

