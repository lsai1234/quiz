/** Facebook — OAuth 2.0 (Graph API). Returns email once the app has been
 *  granted the `email` permission (needs Facebook app review in production). */
import { redirectUri } from './common'
import type { OAuthProvider } from './types'

const GRAPH = 'https://graph.facebook.com/v19.0'

export const facebook: OAuthProvider = {
  id: 'facebook',
  label: 'Facebook',
  callbackMethods: ['GET'],
  configured: () => !!(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET),

  authUrl({ origin, state }) {
    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_CLIENT_ID!,
      redirect_uri: redirectUri(origin, 'facebook'),
      response_type: 'code',
      scope: 'email,public_profile',
      state,
    })
    return `https://www.facebook.com/v19.0/dialog/oauth?${params}`
  },

  async exchange({ origin, code }) {
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({
        client_id: process.env.FACEBOOK_CLIENT_ID!,
        client_secret: process.env.FACEBOOK_CLIENT_SECRET!,
        redirect_uri: redirectUri(origin, 'facebook'),
        code,
      })}`,
    )
    if (!tokenRes.ok) {
      console.error('[auth/facebook] token exchange failed:', tokenRes.status, await tokenRes.text())
      return null
    }
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string }
    if (!accessToken) return null

    const meRes = await fetch(
      `${GRAPH}/me?${new URLSearchParams({ fields: 'id,name,email,picture.type(large)', access_token: accessToken })}`,
    )
    if (!meRes.ok) return null
    const me = (await meRes.json()) as {
      id?: string
      name?: string
      email?: string
      picture?: { data?: { url?: string } }
    }
    if (!me.id) return null
    return {
      provider: 'facebook',
      sub: me.id,
      email: me.email ?? null,
      // Facebook only returns an email it has already confirmed.
      emailVerified: !!me.email,
      name: me.name,
      picture: me.picture?.data?.url ?? null,
    }
  },
}
