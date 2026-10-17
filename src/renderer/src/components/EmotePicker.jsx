import { useEffect, useMemo, useRef, useState } from 'react'

const RECENT_KEY = 'kixo.recentEmotes'
const loadRecent = () => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || []
  } catch {
    return []
  }
}

export default function EmotePicker({ sets, onPick, onClose }) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState(null)
  const [recent, setRecent] = useState(loadRecent)
  const ref = useRef(null)

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('.icon-btn')) onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase()
    const list = tab ? sets.filter((s) => s.id === tab) : sets
    if (!query) return list
    return list
      .map((s) => ({ ...s, emotes: s.emotes.filter((e) => e.name.toLowerCase().includes(query)) }))
      .filter((s) => s.emotes.length)
  }, [sets, q, tab])

  const pick = (e) => {
    const next = [e, ...recent.filter((r) => r.name !== e.name)].slice(0, 24)
    setRecent(next)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
    onPick(e)
  }

  return (
    <div className="emote-picker" ref={ref}>
      <div className="ep-top">
        <input autoFocus placeholder="Search emotes…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onClose()} />
      </div>
      <div className="ep-tabs">
        <button className={!tab ? 'on' : ''} onClick={() => setTab(null)}>
          All
        </button>
        {sets.map((s) => (
          <button key={s.id} className={tab === s.id ? 'on' : ''} onClick={() => setTab(s.id)}>
            {s.name}
          </button>
        ))}
      </div>
      <div className="ep-body">
        {!q && !tab && recent.length > 0 && (
          <EmoteSet name="Recently used" emotes={recent} onPick={pick} />
        )}
        {shown.map((s) => (
          <EmoteSet key={s.id} name={s.name} emotes={s.emotes} onPick={pick} />
        ))}
        {!shown.length && <div className="dim small center">No emotes found</div>}
      </div>
    </div>
  )
}

function EmoteSet({ name, emotes, onPick }) {
  return (
    <div className="ep-set">
      <div className="ep-set-name">{name}</div>
      <div className="ep-grid">
        {emotes.map((e) => (
          <button key={e.id + e.name} title={e.subOnly ? `${e.name} (subscribers)` : e.name} onClick={() => onPick(e)}>
            <img src={e.url} alt={e.name} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  )
}
