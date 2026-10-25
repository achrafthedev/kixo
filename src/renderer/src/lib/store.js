import { useSyncExternalStore } from 'react'

// Minimal global store: immutable top-level updates + selector subscriptions.
export function createStore(initial) {
  let state = initial
  const listeners = new Set()
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
      for (const l of listeners) l()
    },
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    }
  }
}

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  accent: '#53fc18',
  fontSize: 14,
  timestamps: true,
  timestamp24h: true,
  compact: false,
  showBadges: true,
  show7tv: true,
  emoteScale: 1,
  alwaysOnTop: false,
  opacity: 1,
  highlightWords: [],
  ignoredUsers: [],
  hideBots: false,
  mentionSound: true,
  desktopNotify: true,
  showModTools: true,
  maxMessages: 400,
  showEvents: true
}

export const store = createStore({
  ready: false,
  user: null,
  authMode: 'none',
  byoClientId: '',
  hasByoSecret: false,
  useByo: false,
  loggingIn: false, // waiting for the user to approve on kick.com
  version: '',
  overlayPort: 4848,
  settings: DEFAULT_SETTINGS,
  channels: [], // [{ slug, ...channel info }]
  active: null, // slug | '@mentions'
  messages: {}, // slug -> Message[]
  emotes: {}, // slug -> EmoteSet[]
  pinned: {}, // slug -> pin | null
  polls: {}, // slug -> poll | null
  unread: {}, // slug -> { count, mention }
  mentions: [], // [{ slug, msg }]
  status: 'idle',
  modal: null, // { type: 'settings'|'user'|'stream', ... }
  reply: null, // { slug, msg }
  toasts: [],
  update: null
})

export function useStore(selector) {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()))
}

let toastId = 0
export function toast(text, tone = 'info') {
  const id = ++toastId
  store.set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }))
  setTimeout(() => store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === 'error' ? 6000 : 3500)
}
