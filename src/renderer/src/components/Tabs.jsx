import { useEffect, useRef, useState } from 'react'
import { addChannel, removeChannel, reorderChannels, setActive } from '../lib/chat.js'
import { store, useStore } from '../lib/store.js'
import Icon from './Icon.jsx'

export default function Tabs() {
  const channels = useStore((s) => s.channels)
  const active = useStore((s) => s.active)
  const unread = useStore((s) => s.unread)
  const mentionCount = useStore((s) => s.mentions.length)
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')
  const dragFrom = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault()
        setAdding(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    const v = value
    setValue('')
    setAdding(false)
    if (v.trim()) await addChannel(v)
  }

  return (
    <nav className="tabs" onWheel={(e) => (e.currentTarget.scrollLeft += e.deltaY)}>
      {channels.map((c, i) => {
        const u = unread[c.slug]
        return (
          <div
            key={c.slug}
            className={`tab ${active === c.slug ? 'active' : ''} ${u?.mention ? 'mention' : ''}`}
            onClick={() => setActive(c.slug)}
            onMouseDown={(e) => e.button === 1 && (e.preventDefault(), removeChannel(c.slug))}
            draggable
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dragFrom.current !== null && dragFrom.current !== i && reorderChannels(dragFrom.current, i)}
            title={`${c.username}${c.live ? ` — LIVE: ${c.live.title || ''}` : ' — offline'}\nMiddle-click to close`}
          >
            <span className="tab-avatar">
              {c.avatar ? <img src={c.avatar} alt="" /> : c.username[0]}
              {c.live && <span className="live-dot" />}
            </span>
            <span className="tab-name">{c.username}</span>
            {u?.count > 0 && active !== c.slug && <span className="tab-count">{u.count > 99 ? '99+' : u.count}</span>}
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation()
                removeChannel(c.slug)
              }}
              title="Close"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        )
      })}
      {adding ? (
        <form className="tab-add-form" onSubmit={submit}>
          <input
            autoFocus
            placeholder="channel name or kick.com link"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => !value && setAdding(false)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
          />
        </form>
      ) : (
        <button className="tab-add" onClick={() => setAdding(true)} title="Add channel (Ctrl+T)">
          <Icon name="plus" size={14} />
        </button>
      )}
      <div className="tabs-spacer" />
      <button
        className={`tab tab-mentions ${active === '@mentions' ? 'active' : ''}`}
        onClick={() => store.set({ active: '@mentions' })}
        title="Mentions & highlights"
      >
        <Icon name="at" size={14} />
        {mentionCount > 0 && <span className="tab-count">{mentionCount}</span>}
      </button>
    </nav>
  )
}
