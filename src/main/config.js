// Build-time configuration. Official builds inject these through GitHub Actions
// secrets (MAIN_VITE_* variables are inlined by electron-vite). Self-builders can
// leave them empty and use "Bring your own Kick app" in Settings instead.
export const BUILT_IN_CLIENT_ID = import.meta.env.MAIN_VITE_KICK_CLIENT_ID || ''
export const BUILT_IN_AUTH_PROXY = (import.meta.env.MAIN_VITE_AUTH_PROXY || '').replace(/\/+$/, '')

export const OAUTH_PORT = 53682
export const OAUTH_REDIRECT = `http://localhost:${OAUTH_PORT}/callback`
export const OVERLAY_PORT = 4848

export const SCOPES = [
  'user:read',
  'channel:read',
  'channel:write',
  'chat:write',
  'moderation:ban',
  'moderation:chat_message:manage',
  'kicks:read'
]

export const KICK_ID = 'https://id.kick.com'
export const KICK_API = 'https://api.kick.com/public'
