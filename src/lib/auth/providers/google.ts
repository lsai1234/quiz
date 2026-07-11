/** Google — OpenID Connect authorization-code flow. */
import { decodeJwtPayload, redirectUri } from './common'
import type { OAuthProvider } from './types'

export const google: OAuthProvider = {
  id: 'google',
  label: 'Google',
  callbackMethods: ['GET'],
  configured: () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),

  authUrl({ origin, state }) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(origin, 'google'),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  },

  async exchange({ origin, code }) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri(origin, 'google'),
      }),
    })
    if (!res.ok) {
      console.error('[auth/google] token exchange failed:', res.status, await res.text())
      return null
    }
    const { id_token: idToken } = (await res.json()) as { id_token?: string }
    if (!idToken) return null
    const payload = decodeJwtPayload<{
      sub?: string
      email?: string
      email_verified?: boolean | string
      name?: string
      picture?: string
    }>(idToken)
    if (!payload?.sub || !payload.email) return null
    return {
      provider: 'google',
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      name: payload.name,
      picture: payload.picture,
    }
  },
}
