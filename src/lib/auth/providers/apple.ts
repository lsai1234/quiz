/**
 * Sign in with Apple — OpenID Connect, with Apple's two quirks:
 *   1. the client secret is a short-lived ES256-signed JWT (built here from the
 *      .p8 key, no external JWT library);
 *   2. the callback is an HTTP POST (`response_mode=form_post`), and the user's
 *      name arrives only on the *first* authorization, in the `user` field.
 *
 * Requires a paid Apple Developer account and works only over HTTPS (your live
 * domain, not localhost). Env: APPLE_CLIENT_ID (Services ID), APPLE_TEAM_ID,
 * APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8 contents).
 */
import crypto from 'crypto'
import { decodeJwtPayload, redirectUri } from './common'
import type { OAuthProvider } from './types'

function applePrivateKey(): crypto.KeyObject {
  const pem = (process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  return crypto.createPrivateKey(pem)
}

/** Build the ES256 client-secret JWT Apple's token endpoint requires. */
function clientSecret(): string {
  const header = { alg: 'ES256', kid: process.env.APPLE_KEY_ID, typ: 'JWT' }
  const nowSec = Math.floor(Date.now() / 1000)
  const payload = {
    iss: process.env.APPLE_TEAM_ID,
    iat: nowSec,
    exp: nowSec + 60 * 30, // 30 min — well under Apple's 6-month max
    aud: 'https://appleid.apple.com',
    sub: process.env.APPLE_CLIENT_ID,
  }
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const signingInput = `${b64(header)}.${b64(payload)}`
  // ES256 = ECDSA P-256 + SHA-256; JWT needs the raw R||S signature encoding.
  const signature = crypto
    .sign('sha256', Buffer.from(signingInput), { key: applePrivateKey(), dsaEncoding: 'ieee-p1363' })
    .toString('base64url')
  return `${signingInput}.${signature}`
}

export const apple: OAuthProvider = {
  id: 'apple',
  label: 'Apple',
  callbackMethods: ['GET', 'POST'],
  configured: () =>
    !!(
      process.env.APPLE_CLIENT_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY
    ),

  authUrl({ origin, state }) {
    const params = new URLSearchParams({
      client_id: process.env.APPLE_CLIENT_ID!,
      redirect_uri: redirectUri(origin, 'apple'),
      response_type: 'code',
      scope: 'name email',
      response_mode: 'form_post',
      state,
    })
    return `https://appleid.apple.com/auth/authorize?${params}`
  },

  async exchange({ origin, code, form }) {
    const res = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.APPLE_CLIENT_ID!,
        client_secret: clientSecret(),
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri(origin, 'apple'),
      }),
    })
    if (!res.ok) {
      console.error('[auth/apple] token exchange failed:', res.status, await res.text())
      return null
    }
    const { id_token: idToken } = (await res.json()) as { id_token?: string }
    if (!idToken) return null
    const payload = decodeJwtPayload<{
      sub?: string
      email?: string
      email_verified?: boolean | string
    }>(idToken)
    if (!payload?.sub) return null

    // Apple sends the name only on the first authorization, in `user` (JSON).
    let name: string | undefined
    if (form?.user) {
      try {
        const parsed = JSON.parse(form.user) as { name?: { firstName?: string; lastName?: string } }
        name = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(' ') || undefined
      } catch {
        /* ignore malformed user field */
      }
    }
    return {
      provider: 'apple',
      sub: payload.sub,
      email: payload.email ?? null,
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      name,
      picture: null,
    }
  },
}
