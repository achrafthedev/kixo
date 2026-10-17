import { useEffect, useMemo, useRef, useState } from 'react'
import { getChatters, login, sendMessage } from '../lib/chat.js'
import { store, useStore } from '../lib/store.js'
import EmotePicker from './EmotePicker.jsx'
import Icon from './Icon.jsx'

const MAX = 500
const history = [] // shared sent-message history (session only)

function currentWord(text, caret) {
  const before = text.slice(0, caret)
  const start = before.search(/\S+$/)
  return start === -1 ? { word: '', start: caret } : { word: before.slice(start), start }
}

export default function ChatInput({ slug, channel }) {
  const user = useStore((s) => s.user)
  const authMode = useStore((s) => s.authMode)
  const emoteSets = useStore((s) => s.emotes[slug])
  const show7tv = useStore((s) => s.settings.show7tv)
  const reply = useStore((s) => (s.reply?.slug === slug ? s.reply : null))
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [picker, setPicker] = useState(false)
  const [sugg, setSugg] = useState({ items: [], index: 0, start: 0, word: '' })
  const histPos = useRef(-1)
  const tabCycle = useRef(null)
  const ref = useRef(null)

  const allEmotes = useMemo(
    () => (emoteSets || []).filter((s) => show7tv || s.provider !== '7tv').flatMap((s) => s.emotes.map((e) => ({ ...e, provider: s.provider }))),
    [emoteSets, show7tv]
  )

  useEffect(() => {
    if (reply) ref.current?.focus()
  }, [reply])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [text])

  const computeSuggestions = (value, caret) => {
    const { word, start } = currentWord(value, caret)
    let items = []
    if (word.startsWith('@') && word.length >= 2) {
      const q = word.slice(1).toLowerCase()
      items = getChatters(slug)
        .filter((c) => c.username.toLowerCase().startsWith(q))
        .slice(0, 8)
        .map((c) => ({ kind: 'user', label: c.username, insert: `@${c.username}`, color: c.color }))
    } else if (word.startsWith(':') && word.length >= 3) {
      const q = word.slice(1).toLowerCase()
      const starts = allEmotes.filter((e) => e.name.toLowerCase().startsWith(q))
      const contains = allEmotes.filter((e) => !e.name.toLowerCase().startsWith(q) && e.name.toLowerCase().includes(q))
      const seen = new Set()
      items = [...starts, ...contains]
        .filter((e) => !seen.has(e.name) && seen.add(e.name))
        .slice(0, 8)
        .map((e) => ({ kind: 'emote', label: e.name, insert: e.name, url: e.url, provider: e.provider }))
    }
    setSugg({ items, index: 0, start, word })
  }

  const applyInsert = (insert, start, word) => {
    const el = ref.current
    const caret = el.selectionStart
    const next = text.slice(0, start) + insert + ' ' + text.slice(start + word.length).replace(/^ /, '')
    setText(next)
    setSugg({ items: [], index: 0, start: 0, word: '' })
    requestAnimationFrame(() => {
      const pos = start + insert.length + 1
      el.setSelectionRange(pos, pos)
      el.focus()
    })
    return caret
  }

  // Tab: complete the current word against emotes and chatters, cycling on repeat.
  const tabComplete = (back) => {
    const el = ref.current
    let cycle = tabCycle.current
    if (!cycle) {
      const { word, start } = currentWord(text, el.selectionStart)
      if (!word) return
      const q = word.replace(/^[@:]/, '').toLowerCase()
      const users = getChatters(slug).map((c) => '@' + c.username)
      const emotes = allEmotes.map((e) => e.name)
      const pool = word.startsWith('@') ? users : [...new Set([...emotes, ...users])]
      const options = pool.filter((n) => n.replace(/^@/, '').toLowerCase().startsWith(q))
      if (!options.length) return
      cycle = { options, i: -1, start, len: word.length }
    }
    cycle.i = (cycle.i + (back ? -1 : 1) + cycle.options.length) % cycle.options.length
    const choice = cycle.options[cycle.i]
    const next = text.slice(0, cycle.start) + choice + text.slice(cycle.start + cycle.len)
    cycle.len = choice.length
    tabCycle.current = cycle
    setText(next)
    requestAnimationFrame(() => el.setSelectionRange(cycle.start + choice.length, cycle.start + choice.length))
  }

  const submit = async () => {
    const value = text.trim()
    if (!value || sending) return
    if ([...value].length > MAX) return
    setSending(true)
    const ok = await sendMessage(slug, value)
    setSending(false)
    if (ok) {
      history.unshift(value)
      if (history.length > 50) history.pop()
      histPos.current = -1
      setText('')
    }
    ref.current?.focus()
  }

  const onKeyDown = (e) => {
    if (e.key !== 'Tab') tabCycle.current = null
    if (sugg.items.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const d = e.key === 'ArrowDown' ? 1 : -1
        setSugg((s) => ({ ...s, index: (s.index + d + s.items.length) % s.items.length }))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const it = sugg.items[sugg.index]
        applyInsert(it.insert, sugg.start, sugg.word)
        return
      }
      if (e.key === 'Escape') {
        setSugg({ items: [], index: 0, start: 0, word: '' })
        return
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      tabComplete(e.shiftKey)
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape' && reply) {
      store.set({ reply: null })
    } else if (e.key === 'ArrowUp' && (!text || histPos.current >= 0) && history.length) {
      e.preventDefault()
      histPos.current = Math.min(histPos.current + 1, history.length - 1)
      setText(history[histPos.current])
    } else if (e.key === 'ArrowDown' && histPos.current >= 0) {
      e.preventDefault()
      histPos.current -= 1
      setText(histPos.current >= 0 ? history[histPos.current] : '')
    }
  }

  if (!user) {
    return (
      <div className="input-area logged-out">
        {authMode !== 'none' ? (
          <button className="btn primary wide" onClick={login}>
            Log in with Kick to chat
          </button>
        ) : (
          <button className="btn wide" onClick={() => store.set({ modal: { type: 'settings', section: 'account' } })}>
            Set up a Kick app to chat →
          </button>
        )}
      </div>
    )
  }

  const len = [...text].length
  return (
    <div className="input-area">
      {sugg.items.length > 0 && (
        <div className="suggestions">
          {sugg.items.map((it, i) => (
            <div
              key={it.kind + it.label}
              className={`sugg ${i === sugg.index ? 'sel' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                applyInsert(it.insert, sugg.start, sugg.word)
              }}
            >
              {it.url ? <img src={it.url} alt="" /> : <Icon name="at" size={14} />}
              <span style={it.color ? { color: it.color } : undefined}>{it.label}</span>
              {it.provider && <span className="dim small">{it.provider === 'kick' ? 'Kick' : '7TV'}</span>}
            </div>
          ))}
        </div>
      )}
      {picker && (
        <EmotePicker
          sets={(emoteSets || []).filter((s) => show7tv || s.provider !== '7tv')}
          onPick={(e) => {
            const el = ref.current
            const pos = el?.selectionStart ?? text.length
            const pre = text.slice(0, pos)
            const insert = (pre && !pre.endsWith(' ') ? ' ' : '') + e.name + ' '
            setText(pre + insert + text.slice(pos))
            requestAnimationFrame(() => el?.focus())
          }}
          onClose={() => setPicker(false)}
        />
      )}
      {reply && (
        <div className="reply-banner">
          <Icon name="reply" size={13} />
          <span>
            Replying to <b>@{reply.msg.user.username}</b>
          </span>
          <button className="icon-btn" onClick={() => store.set({ reply: null })}>
            <Icon name="x" size={13} />
          </button>
        </div>
      )}
      <div className="input-row">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={`Message #${channel.slug}`}
          onChange={(e) => {
            setText(e.target.value)
            histPos.current = -1
            computeSuggestions(e.target.value, e.target.selectionStart)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setSugg((s) => ({ ...s, items: [] })), 100)}
          maxLength={2000}
          spellCheck
        />
        {len > 400 && <span className={`counter ${len > MAX ? 'over' : ''}`}>{MAX - len}</span>}
        <button className={`icon-btn ${picker ? 'on' : ''}`} title="Emotes" onClick={() => setPicker(!picker)}>
          <Icon name="smile" size={18} />
        </button>
        <button className="icon-btn send" title="Send (Enter)" disabled={!text.trim() || sending || len > MAX} onClick={submit}>
          <Icon name="send" size={16} />
        </button>
      </div>
    </div>
  )
}
