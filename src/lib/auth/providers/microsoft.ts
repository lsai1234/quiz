/**
 * Microsoft — OpenID Connect against the v2.0 `common` endpoint, so an Outlook,
 * Hotmail or Live address signs in alongside a work or school account. Free:
 * an app registration in Entra ID costs nothing.
 *
 * Env: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET.
 */
import { decodeJwtPayload, redirectUri } from './common'
import type { OAuthProvider } from './types'

/** The well-known tenant every personal Microsoft account belongs to. */
const CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad'

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0'

interface MicrosoftClaims {
  sub?: string
  oid?: string
  tid?: string
  email?: string
  preferred_username?: string
  name?: string
  /** "Email domain owner verified" — present only when the optional claim is on. */
  xms_edov?: boolean | string
}

/**
 * Whether Microsoft's word on this address is worth linking an existing account
 * by, which is the only question that matters here: `upsertOAuthUser` merges
 * into a matching account when we say verified, and merging on an unverified
 * address is how someone else's account gets taken over.
 *
 * A personal Microsoft account's address is one Microsoft itself owns or has
 * confirmed. A work or school tenant is different — an admin can type any
 * address into a user's mail field, including a Gmail one they don't own — so a
 * tenant address counts only when Microsoft explicitly says the domain is
 * verified via `xms_edov`.
 */
export function microsoftEmailVerified(claims: MicrosoftClaims): boolean {
  if (!claims.email && !claims.preferred_username) return false
  if (claims.tid === CONSUMER_TENANT) return true
  return claims.xms_edov === true || claims.xms_edov === 'true'
}

export const microsoft: OAuthProvider = {
  id: 'microsoft',
  label: 'Microsoft',
  callbackMethods: ['GET'],
  configured: () => !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),

  authUrl({ origin, state }) {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      redirect_uri: redirectUri(origin, 'microsoft'),
      response_type: 'code',
      response_mode: 'query',
      scope: 'openid email profile',
      state,
    })
    return `${AUTHORITY}/authorize?${params}`
  },

  async exchange({ origin, code }) {
    const res = await fetch(`${AUTHORITY}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri(origin, 'microsoft'),
      }),
    })
    if (!res.ok) {
      console.error('[auth/microsoft] token exchange failed:', res.status, await res.text())
      return null
    }
    const { id_token: idToken } = (await res.json()) as { id_token?: string }
    if (!idToken) return null
    const claims = decodeJwtPayload<MicrosoftClaims>(idToken)
    const sub = claims?.sub ?? claims?.oid
    if (!claims || !sub) return null

    // `preferred_username` is the address people actually recognise; `email` is
    // only present when the account has one on file.
    const email = claims.email ?? claims.preferred_username ?? null
    return {
      provider: 'microsoft',
      sub,
      email,
      emailVerified: microsoftEmailVerified(claims),
      name: claims.name,
      // Microsoft's photo needs a Graph call and a mailbox licence, so accounts
      // arrive without one rather than with a broken URL.
      picture: null,
    }
  },
}
