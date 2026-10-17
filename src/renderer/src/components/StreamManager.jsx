import { useEffect, useRef, useState } from 'react'
import { addChannel } from '../lib/chat.js'
import { store, toast, useStore } from '../lib/store.js'
import Icon from './Icon.jsx'

// Streamer tools for the logged-in user's own channel (official API).
export default function StreamManager() {
  const user = useStore((s) => s.user)
  const port = useStore((s) => s.overlayPort)
  const [ch, setCh] = useState(null)
  const [error, setError] = useState(null)
  const [title, setTitle] = useState('')
  const [cat, setCat] = useState(null)
  const [catQ, setCatQ] = useState('')
  const [results, setResults] = useState([])
  const [saving, setSaving] = useState(false)
  const timer = useRef(null)
  const close = () => store.set({ modal: null })

  useEffect(() => {
    window.kixo.api
      .myChannel()
      .then((c) => {
        setCh(c)
        setTitle(c?.stream_title || '')
        setCat(c?.category || null)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    clearTimeout(timer.current)
    if (catQ.trim().length < 2) return setResults([])
    timer.current = setTimeout(() => window.kixo.api.categories(catQ.trim()).then(setResults).catch(() => setResults([])), 250)
  }, [catQ])

  const save = async () => {
    setSaving(true)
    try {
      await window.kixo.api.patchChannel({ stream_title: title, ...(cat?.id ? { category_id: cat.id } : {}) })
      toast('Stream info updated', 'ok')
    } catch (e) {
      toast(e.message, 'error')
    }
    setSaving(false)
  }

  const slug = ch?.slug || user?.username?.toLowerCase()
  const overlayUrl = `http://127.0.0.1:${port}/overlay?channel=${slug || 'yourchannel'}`

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal stream-manager">
        <button className="icon-btn modal-x" onClick={close}>
          <Icon name="x" />
        </button>
        <h2>
          <Icon name="broadcast" /> Stream manager
        </h2>
        {error && <p className="error-text">{error}</p>}
        {!ch && !error && <p className="dim">Loading your channel…</p>}
        {ch && (
          <>
            <div className="sm-status">
              {ch.stream?.is_live ? <span className="live-pill">LIVE</span> : <span className="off-pill">OFFLINE</span>}
              {ch.stream?.is_live && <span>{Number(ch.stream.viewer_count || 0).toLocaleString()} viewers</span>}
              <span className="dim">{ch.active_subscribers_count ?? 0} subs</span>
              <button className="btn small" onClick={() => (addChannel(ch.slug), close())}>
                Open my chat
              </button>
            </div>
            <label className="field">
              <span>Stream title</span>
              <input value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field">
              <span>Category</span>
              <div className="cat-picker">
                {cat && !catQ && (
                  <div className="cat-current">
                    {cat.thumbnail && <img src={cat.thumbnail} alt="" />}
                    {cat.name}
                  </div>
                )}
                <input placeholder="Search categories…" value={catQ} onChange={(e) => setCatQ(e.target.value)} />
                {results.length > 0 && (
                  <div className="cat-results">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setCat({ id: r.id, name: r.name, thumbnail: r.thumbnail })
                          setCatQ('')
                          setResults([])
                        }}
                      >
                        {r.thumbnail && <img src={r.thumbnail} alt="" />}
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>
            <button className="btn primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save stream info'}
            </button>
          </>
        )}
        <div className="sm-overlay">
          <div className="uc-label">
            <Icon name="layers" size={13} /> OBS chat overlay
          </div>
          <p className="dim small">Add a Browser Source in OBS with this URL (Kixo must be running). Width 400, height 600 works well.</p>
          <div className="copy-row">
            <code>{overlayUrl}</code>
            <button className="btn small" onClick={() => (navigator.clipboard.writeText(overlayUrl), toast('Copied overlay URL', 'ok'))}>
              Copy
            </button>
          </div>
          <p className="dim small">Options: <code>&amp;fade=30</code> (seconds), <code>&amp;size=18</code>, <code>&amp;bots=0</code>, <code>&amp;badges=0</code>, <code>&amp;max=20</code></p>
        </div>
      </div>
    </div>
  )
}
