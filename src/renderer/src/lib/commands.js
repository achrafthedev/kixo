// Kick-style chat commands typed in the input ("/vip name", "/timeout name 10").
// Ban/timeout/unban use the official API; VIP/OG/mod use the optional kick.com
// session (Kick's public API has no role endpoints yet).
import { banUser, getChatters, timeoutUser, unbanUser } from './chat.js'
import { store, toast } from './store.js'

const k = window.kixo

export const COMMANDS = [
  { name: 'vip', args: '<username>', desc: 'Give VIP', role: 'vip', add: true, web: true },
  { name: 'unvip', args: '<username>', desc: 'Remove VIP', role: 'vip', add: false, web: true },
  { name: 'og', args: '<username>', desc: 'Give OG', role: 'og', add: true, web: true },
  { name: 'unog', args: '<username>', desc: 'Remove OG', role: 'og', add: false, web: true },
  { name: 'mod', args: '<username>', desc: 'Make moderator', role: 'moderator', add: true, web: true },
  { name: 'unmod', args: '<username>', desc: 'Remove moderator', role: 'moderator', add: false, web: true },
  { name: 'ban', args: '<username> [reason]', desc: 'Ban permanently' },
  { name: 'unban', args: '<username>', desc: 'Unban' },
  { name: 'timeout', args: '<username> <minutes> [reason]', desc: 'Time out (minutes)' },
  { name: 'user', args: '<username>', desc: 'Open user card' },
  { name: 'help', args: '', desc: 'List commands' }
]

const findCommand = (name) => COMMANDS.find((c) => c.name === name.toLowerCase())

async function resolveUser(slug, username) {
  const name = username.replace(/^@/, '')
  const known = getChatters(slug).find((c) => c.username.toLowerCase() === name.toLowerCase())
  if (known?.id) return { id: known.id, username: known.username }
  const card = await k.kick.userCard(slug, name)
  if (!card?.id) throw new Error(`User "${name}" not found.`)
  return { id: card.id, username: card.username }
}

// Returns true when the text was a command (handled, or rejected with a toast).
export async function runCommand(slug, text) {
  const m = text.trim().match(/^\/(\w+)(?:\s+(.*))?$/)
  if (!m) return false
  const cmd = findCommand(m[1])
  if (!cmd) {
    toast(`Unknown command /${m[1]}. Type /help`, 'error')
    return true
  }
  const parts = (m[2] || '').trim().split(/\s+/).filter(Boolean)
  const target = parts[0]?.replace(/^@/, '')
  if (cmd.args.startsWith('<username>') && !target) {
    toast(`Usage: /${cmd.name} ${cmd.args}`, 'error')
    return true
  }
  try {
    if (cmd.name === 'help') {
      toast(COMMANDS.filter((c) => c.name !== 'help').map((c) => `/${c.name}`).join('  '), 'info')
    } else if (cmd.name === 'user') {
      store.set({ modal: { type: 'user', slug, user: { username: target } } })
    } else if (cmd.web) {
      await k.kickweb.setRole({ slug, role: cmd.role, username: target, add: cmd.add })
      toast(`${cmd.desc}: ${target}`, 'ok')
    } else if (cmd.name === 'timeout') {
      const minutes = Number(parts[1])
      if (!Number.isFinite(minutes) || minutes < 1) {
        toast('Usage: /timeout <username> <minutes> [reason]', 'error')
        return true
      }
      await timeoutUser(slug, await resolveUser(slug, target), Math.min(Math.round(minutes), 10080))
    } else if (cmd.name === 'ban') {
      await banUser(slug, await resolveUser(slug, target), parts.slice(1).join(' ') || undefined)
    } else if (cmd.name === 'unban') {
      await unbanUser(slug, await resolveUser(slug, target))
    }
  } catch (e) {
    toast(e.message, 'error')
    if (cmd.web && /Connect your kick\.com|expired/.test(e.message)) store.set({ modal: { type: 'settings', section: 'account' } })
  }
  return true
}

// Autocomplete entries for "/…" in the input.
export function commandSuggestions(word) {
  const q = word.slice(1).toLowerCase()
  return COMMANDS.filter((c) => c.name.startsWith(q)).map((c) => ({
    kind: 'command',
    label: `/${c.name}`,
    insert: `/${c.name}`,
    hint: `${c.args} — ${c.desc}`
  }))
}
