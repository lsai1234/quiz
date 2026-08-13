/**
 * LinkedIn — "Sign In with LinkedIn using OpenID Connect". Free, though the
 * product has to be added to the app in the LinkedIn developer portal before
 * the `openid` scopes are granted.
 *
 * Env: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET.
 */
import { decodeJwtPayload, redirectUri } from './common'
import type { OAuthProvider } from './types'

export const linkedin: OAuthProvider = {
  id: 'linkedin',
  label: 'LinkedIn',
  callbackMethods: ['GET'],
  configured: () => !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),

  authUrl({ origin, state }) {
    const params = new URLSearchParams({
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      redirect_uri: redirectUri(origin, 'linkedin'),
      response_type: 'code',
      scope: 'openid profile email',
      state,
    })
    return `https://www.linkedin.com/oauth/v2/authorization?${params}`
  },

  async exchange({ origin, code }) {
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
        redirect_uri: redirectUri(origin, 'linkedin'),
      }),
    })
    if (!res.ok) {
      console.error('[auth/linkedin] token exchange failed:', res.status, await res.text())
      return null
    }
    const { id_token: idToken } = (await res.json()) as { id_token?: string }
    if (!idToken) return null
    const claims = decodeJwtPayload<{
      sub?: string
      email?: string
      email_verified?: boolean | string
      name?: string
      picture?: string
    }>(idToken)
    if (!claims?.sub) return null
    return {
      provider: 'linkedin',
      sub: claims.sub,
      email: claims.email ?? null,
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
      name: claims.name,
      picture: claims.picture ?? null,
    }
  },
}
