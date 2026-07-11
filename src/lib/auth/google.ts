/**
 * Google OAuth (OpenID Connect) for customer sign-in — hand-rolled
 * authorization-code flow, no auth library.
 *
 * Env-gated: set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET to enable; the hub
 * hides the button when unconfigured (mock-first — email+password always
 * works). The redirect URI is `<origin>/api/auth/google/callback`; register it
 * in the Google Cloud console. Behind a proxy/custom domain set APP_URL so the
 * server derives the same origin Google was told about.
 *
 * The ID token's payload is read without signature verification, which the
 * OIDC spec permits when the token arrives directly from Google's token
 * endpoint over TLS (we never accept ID tokens from the browser).
 */

/** CSRF state cookie shared by the start + callback routes. */
export const GOOGLE_STATE_COOKIE = 'google_oauth_state'

export interface GoogleProfile {
  sub: string
  email: string
  name?: string
  picture?: string
  emailVerified: boolean
}

export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

/** The origin OAuth redirects are built against (APP_URL overrides the request's). */
export function resolveOrigin(requestUrl: string): string {
  const configured = process.env.APP_URL
  if (configured) return configured.replace(/\/$/, '')
  return new URL(requestUrl).origin
}

function redirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`
}

export function googleAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

/** Exchange the callback `code` for the user's Google profile, or null on failure. */
export async function exchangeGoogleCode(origin: string, code: string): Promise<GoogleProfile | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(origin),
    }),
  })
  if (!res.ok) {
    console.error('[auth/google] token exchange failed:', res.status, await res.text())
    return null
  }

  const { id_token: idToken } = (await res.json()) as { id_token?: string }
  if (!idToken) return null

  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')) as {
      sub?: string
      email?: string
      email_verified?: boolean
      name?: string
      picture?: string
    }
    if (!payload.sub || !payload.email) return null
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      emailVerified: payload.email_verified === true,
    }
  } catch {
    return null
  }
}
