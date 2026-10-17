import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { OVERLAY_PORT } from './config.js'

// Local OBS browser-source server. The renderer forwards already-parsed chat
// messages over IPC; we fan them out to overlay pages over Server-Sent Events.
const clients = new Map() // slug -> Set<res>
let onWatch = () => {}

const overlayDir = () =>
  app.isPackaged ? join(process.resourcesPath, 'overlay') : join(app.getAppPath(), 'resources', 'overlay')

export function startOverlayServer(watchCallback) {
  onWatch = watchCallback
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${OVERLAY_PORT}`)
    const slug = (url.searchParams.get('channel') || '').toLowerCase()
    if (url.pathname === '/' || url.pathname === '/overlay') {
      try {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        return res.end(readFileSync(join(overlayDir(), 'index.html')))
      } catch (e) {
        return res.writeHead(500).end(String(e))
      }
    }
    if (url.pathname === '/events' && slug) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      })
      res.write('retry: 2000\n\n')
      if (!clients.has(slug)) clients.set(slug, new Set())
      clients.get(slug).add(res)
      onWatch(slug)
      const ping = setInterval(() => res.write(': ping\n\n'), 20000)
      req.on('close', () => {
        clearInterval(ping)
        clients.get(slug)?.delete(res)
      })
      return
    }
    res.writeHead(404).end()
  })
  server.on('error', (e) => console.warn('[overlay] server error', e.message))
  server.listen(OVERLAY_PORT, '127.0.0.1')
  return server
}

export function pushOverlay(slug, event) {
  const set = clients.get(slug)
  if (!set?.size) return
  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const res of set) res.write(data)
}

export const watchedSlugs = () => [...clients.entries()].filter(([, s]) => s.size).map(([k]) => k)
