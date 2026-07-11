/** X / Twitter — OAuth 2.0 with PKCE. Note: X does NOT return an email, so
 *  these accounts get a synthetic placeholder address and can't be linked to a
 *  Google/Apple account by email. */
import { redirectUri } from './common'
import type { OAuthProvider } from './types'

export const twitter: OAuthProvider = {
  id: 'twitter',
  label: 'X',
  callbackMethods: ['GET'],
  usesPKCE: true,
  configured: () => !!(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET),

  authUrl({ origin, state, codeChallenge }) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.TWITTER_CLIENT_ID!,
      redirect_uri: redirectUri(origin, 'twitter'),
      scope: 'tweet.read users.read',
      state,
      code_challenge: codeChallenge ?? '',
      code_challenge_method: 'S256',
    })
    return `https://twitter.com/i/oauth2/authorize?${params}`
  },

  async exchange({ origin, code, codeVerifier }) {
    // Confidential client → HTTP Basic auth with client id:secret.
    const basic = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`,
    ).toString('base64')
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(origin, 'twitter'),
        code_verifier: codeVerifier ?? '',
      }),
    })
    if (!tokenRes.ok) {
      console.error('[auth/twitter] token exchange failed:', tokenRes.status, await tokenRes.text())
      return null
    }
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string }
    if (!accessToken) return null

    const meRes = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!meRes.ok) return null
    const { data } = (await meRes.json()) as {
      data?: { id?: string; name?: string; profile_image_url?: string }
    }
    if (!data?.id) return null
    return {
      provider: 'twitter',
      sub: data.id,
      email: null, // X does not expose email
      emailVerified: false,
      name: data.name,
      picture: data.profile_image_url ?? null,
    }
  },
}
