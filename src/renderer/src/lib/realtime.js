// One shared realtime socket for every open channel. Kick now serves chat over
// Centrifugo (JSON protocol); we keep a Pusher path because Kick's connection
// endpoint can still hand one out, and older infra used it exclusively.
//
// Consumers call join({ channelId, chatroomId }, handler) and receive
// handler({ event, data }) where `event` is Kick's "App\Events\..." name.

const topicsFor = ({ channelId, chatroomId }) => [`chatrooms.${chatroomId}.v2`, `channel.${channelId}`]

class Realtime {
  constructor() {
    this.rooms = new Map() // topic -> { handlers:Set, room }
    this.ws = null
    this.cfg = null
    this.cmdId = 0
    this.backoff = 1000
    this.status = 'idle'
    this.statusListeners = new Set()
    this.refreshTimer = null
    this.connecting = null
  }

  onStatus(fn) {
    this.statusListeners.add(fn)
    fn(this.status)
    return () => this.statusListeners.delete(fn)
  }

  setStatus(s) {
    this.status = s
    for (const fn of this.statusListeners) fn(s)
  }

  join(room, handler) {
    for (const topic of topicsFor(room)) {
      if (!this.rooms.has(topic)) {
        this.rooms.set(topic, { handlers: new Set(), room })
        this.subscribe(topic)
      }
      this.rooms.get(topic).handlers.add(handler)
    }
    this.ensureConnected(room.channelId)
    return () => {
      for (const topic of topicsFor(room)) {
        const entry = this.rooms.get(topic)
        if (!entry) continue
        entry.handlers.delete(handler)
        if (!entry.handlers.size) {
          this.rooms.delete(topic)
          this.unsubscribe(topic)
        }
      }
      if (!this.rooms.size) this.close()
    }
  }

  async ensureConnected(channelId) {
    if (this.ws && this.ws.readyState <= 1) return
    if (this.connecting) return this.connecting
    this.connecting = (async () => {
      try {
        this.setStatus('connecting')
        this.cfg = await window.kixo.kick.realtime(channelId)
        this.open()
      } catch (e) {
        console.warn('[realtime] config failed', e)
        this.scheduleReconnect()
      } finally {
        this.connecting = null
      }
    })()
    return this.connecting
  }

  open() {
    const cfg = this.cfg
    const ws =
      cfg.provider === 'centrifugo'
        ? new WebSocket(cfg.url)
        : new WebSocket(`wss://ws-${cfg.cluster}.pusher.com/app/${cfg.appKey}?protocol=7&client=js&version=8.4.0&flash=false`)
    this.ws = ws
    ws.onopen = () => {
      if (cfg.provider === 'centrifugo') {
        this.raw({ id: ++this.cmdId, connect: { token: cfg.token, name: 'js' } })
      }
      for (const topic of this.rooms.keys()) this.subscribe(topic)
    }
    ws.onmessage = (e) => (cfg.provider === 'centrifugo' ? this.onCentrifugo(e.data) : this.onPusher(e.data))
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      clearTimeout(this.refreshTimer)
      if (this.rooms.size) this.scheduleReconnect()
      else this.setStatus('idle')
    }
    ws.onerror = () => ws.close()
  }

  scheduleReconnect() {
    this.setStatus('reconnecting')
    const delay = this.backoff
    this.backoff = Math.min(this.backoff * 2, 30000)
    setTimeout(() => {
      const first = this.rooms.values().next().value
      if (first) this.ensureConnected(first.room.channelId)
    }, delay)
  }

  close() {
    clearTimeout(this.refreshTimer)
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.setStatus('idle')
  }

  raw(obj) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj))
  }

  subscribe(topic) {
    if (!this.cfg || this.ws?.readyState !== 1) return
    if (this.cfg.provider === 'centrifugo') this.raw({ id: ++this.cmdId, subscribe: { channel: topic } })
    else this.raw({ event: 'pusher:subscribe', data: { auth: '', channel: topic } })
  }

  unsubscribe(topic) {
    if (!this.cfg || this.ws?.readyState !== 1) return
    if (this.cfg.provider === 'centrifugo') this.raw({ id: ++this.cmdId, unsubscribe: { channel: topic } })
    else this.raw({ event: 'pusher:unsubscribe', data: { channel: topic } })
  }

  dispatch(topic, event, data) {
    const entry = this.rooms.get(topic)
    if (!entry) return
    let payload = data
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch {
        /* keep string */
      }
    }
    for (const h of entry.handlers) h({ topic, event, data: payload })
  }

  onCentrifugo(text) {
    for (const line of String(text).split('\n')) {
      if (!line) continue
      if (line === '{}') {
        this.ws?.send('{}') // server ping -> pong
        continue
      }
      let m
      try {
        m = JSON.parse(line)
      } catch {
        continue
      }
      if (m.connect) {
        this.backoff = 1000
        this.setStatus('connected')
        // Guest tokens expire (ttl ~45min). Reconnect with a fresh one shortly before.
        if (m.connect.expires && m.connect.ttl) {
          clearTimeout(this.refreshTimer)
          this.refreshTimer = setTimeout(() => this.ws?.close(), Math.max(30, m.connect.ttl - 90) * 1000)
        }
      } else if (m.error && m.id) {
        console.warn('[realtime] command error', m.error)
        if (m.error.code === 109 || m.error.code === 3500) this.ws?.close() // token expired / auth
      } else if (m.push?.pub) {
        const d = m.push.pub.data || {}
        this.dispatch(m.push.channel, d.event || m.push.pub.tags?.event, d.data)
      } else if (m.push?.disconnect) {
        this.ws?.close()
      }
    }
  }

  onPusher(text) {
    let m
    try {
      m = JSON.parse(text)
    } catch {
      return
    }
    if (m.event === 'pusher:connection_established') {
      this.backoff = 1000
      this.setStatus('connected')
    } else if (m.event === 'pusher:ping') {
      this.raw({ event: 'pusher:pong', data: {} })
    } else if (m.event === 'pusher:error') {
      console.warn('[realtime] pusher error', m.data)
    } else if (m.channel && !m.event.startsWith('pusher')) {
      this.dispatch(m.channel, m.event, m.data)
    }
  }
}

export const realtime = new Realtime()
