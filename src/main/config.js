// Default ("official") login: Kixo's Kick app + the hosted token-exchange
// service on kixo.app, which holds the client secret. The client id is public.
// Builds can override both with MAIN_VITE_* env vars (inlined by electron-vite).
export const BUILT_IN_CLIENT_ID = import.meta.env.MAIN_VITE_KICK_CLIENT_ID || '01M40WV7G0F7W7M7C6FNJ265KS'
export const BUILT_IN_AUTH_PROXY = (import.meta.env.MAIN_VITE_AUTH_PROXY || 'https://kixo.app/auth').replace(/\/+$/, '')
// Kick redirects here; the page hands the code to our localhost listener.
export const BUILT_IN_REDIRECT = import.meta.env.MAIN_VITE_AUTH_REDIRECT || 'https://kixo.app/auth/callback'

export const OAUTH_PORT = 53682
// Redirect for "Bring your own Kick app" (registered by the user on their app)
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
