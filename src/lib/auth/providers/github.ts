/**
 * GitHub — OAuth 2.0. Free, instant to register, no review.
 *
 * The wrinkle is the email: GitHub's user endpoint returns whatever address the
 * profile shows publicly, which is often none at all, so the primary verified
 * address is fetched separately and nothing else is trusted for linking.
 *
 * Env: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET.
 */
import { redirectUri } from './common'
import type { OAuthProvider } from './types'

const API = 'https://api.github.com'
/** GitHub rejects API calls without one. */
const UA = 'getchrgd-auth'

export const github: OAuthProvider = {
  id: 'github',
  label: 'GitHub',
  callbackMethods: ['GET'],
  configured: () => !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),

  authUrl({ origin, state }) {
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID!,
      redirect_uri: redirectUri(origin, 'github'),
      scope: 'read:user user:email',
      state,
    })
    return `https://github.com/login/oauth/authorize?${params}`
  },

  async exchange({ origin, code }) {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri(origin, 'github'),
      }),
    })
    if (!tokenRes.ok) {
      console.error('[auth/github] token exchange failed:', tokenRes.status, await tokenRes.text())
      return null
    }
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string }
    if (!accessToken) return null

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': UA,
    }
    const meRes = await fetch(`${API}/user`, { headers })
    if (!meRes.ok) return null
    const me = (await meRes.json()) as {
      id?: number
      login?: string
      name?: string | null
      avatar_url?: string | null
    }
    if (!me.id) return null

    // The address on the profile is whatever the user chose to publish, and may
    // be unverified or absent; the primary verified one is the only address
    // this account may be linked by.
    let email: string | null = null
    let emailVerified = false
    const emailsRes = await fetch(`${API}/user/emails`, { headers })
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as { email?: string; primary?: boolean; verified?: boolean }[]
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified)
      if (primary?.email) {
        email = primary.email
        emailVerified = true
      }
    }

    return {
      provider: 'github',
      sub: String(me.id),
      email,
      emailVerified,
      name: me.name ?? me.login,
      picture: me.avatar_url ?? null,
    }
  },
}
