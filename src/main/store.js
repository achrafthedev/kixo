import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Tiny JSON persistence. Plain data lives in kixo.json; secrets (tokens, BYO
// client secret) are encrypted with the OS keychain via safeStorage.
const dir = () => app.getPath('userData')
const file = (name) => join(dir(), name)

function readJson(name, fallback) {
  try {
    return JSON.parse(readFileSync(file(name), 'utf8'))
  } catch {
    return fallback
  }
}

function writeAtomic(name, data) {
  if (!existsSync(dir())) mkdirSync(dir(), { recursive: true })
  const tmp = file(name + '.tmp')
  writeFileSync(tmp, data)
  renameSync(tmp, file(name))
}

let state = null
let writeTimer = null

export function getState() {
  if (!state) state = readJson('kixo.json', {})
  return state
}

export function setState(patch) {
  state = { ...getState(), ...patch }
  clearTimeout(writeTimer)
  writeTimer = setTimeout(flushState, 250)
  return state
}

export function flushState() {
  clearTimeout(writeTimer)
  if (state) writeAtomic('kixo.json', JSON.stringify(state, null, 2))
}

export function getSecrets() {
  try {
    const raw = readFileSync(file('secrets.bin'))
    const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8')
    return JSON.parse(text)
  } catch {
    return {}
  }
}

export function setSecrets(patch) {
  const next = { ...getSecrets(), ...patch }
  for (const k of Object.keys(next)) if (next[k] == null) delete next[k]
  const text = JSON.stringify(next)
  writeAtomic('secrets.bin', safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text))
  return next
}
