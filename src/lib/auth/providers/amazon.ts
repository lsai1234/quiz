/**
 * Login with Amazon — OAuth 2.0. Free to set up (a Security Profile in the
 * Amazon developer console), and the one provider on this list where the
 * account someone already has is a *shopping* account.
 *
 * Env: AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET.
 */
import { redirectUri } from './common'
import type { OAuthProvider } from './types'

export const amazon: OAuthProvider = {
  id: 'amazon',
  label: 'Amazon',
  callbackMethods: ['GET'],
  configured: () => !!(process.env.AMAZON_CLIENT_ID && process.env.AMAZON_CLIENT_SECRET),

  authUrl({ origin, state }) {
    const params = new URLSearchParams({
      client_id: process.env.AMAZON_CLIENT_ID!,
      redirect_uri: redirectUri(origin, 'amazon'),
      response_type: 'code',
      scope: 'profile',
      state,
    })
    return `https://www.amazon.com/ap/oa?${params}`
  },

  async exchange({ origin, code }) {
    const tokenRes = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.AMAZON_CLIENT_ID!,
        client_secret: process.env.AMAZON_CLIENT_SECRET!,
        redirect_uri: redirectUri(origin, 'amazon'),
      }),
    })
    if (!tokenRes.ok) {
      console.error('[auth/amazon] token exchange failed:', tokenRes.status, await tokenRes.text())
      return null
    }
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string }
    if (!accessToken) return null

    const meRes = await fetch('https://api.amazon.com/user/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!meRes.ok) return null
    const me = (await meRes.json()) as { user_id?: string; name?: string; email?: string }
    if (!me.user_id) return null
    return {
      provider: 'amazon',
      sub: me.user_id,
      email: me.email ?? null,
      // Amazon only returns the address the account signs in with, which it has
      // already confirmed.
      emailVerified: !!me.email,
      name: me.name,
      picture: null,
    }
  },
}
