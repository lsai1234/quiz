/**
 * Discord — OAuth 2.0. Free, and the sign-up is two minutes in the developer
 * portal with no review step.
 *
 * Env: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET.
 */
import { redirectUri } from './common'
import type { OAuthProvider } from './types'

const API = 'https://discord.com/api/v10'

export const discord: OAuthProvider = {
  id: 'discord',
  label: 'Discord',
  callbackMethods: ['GET'],
  configured: () => !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),

  authUrl({ origin, state }) {
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      redirect_uri: redirectUri(origin, 'discord'),
      response_type: 'code',
      scope: 'identify email',
      state,
    })
    return `https://discord.com/oauth2/authorize?${params}`
  },

  async exchange({ origin, code }) {
    const tokenRes = await fetch(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(origin, 'discord'),
      }),
    })
    if (!tokenRes.ok) {
      console.error('[auth/discord] token exchange failed:', tokenRes.status, await tokenRes.text())
      return null
    }
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string }
    if (!accessToken) return null

    const meRes = await fetch(`${API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!meRes.ok) return null
    const me = (await meRes.json()) as {
      id?: string
      username?: string
      global_name?: string | null
      email?: string | null
      /** Discord's own flag for whether the address has been confirmed. */
      verified?: boolean
      avatar?: string | null
    }
    if (!me.id) return null
    return {
      provider: 'discord',
      sub: me.id,
      email: me.email ?? null,
      emailVerified: !!me.email && me.verified === true,
      name: me.global_name ?? me.username,
      picture: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` : null,
    }
  },
}
