/**
 * Shared OAuth plumbing for every provider (Google, Apple, Facebook, X).
 *
 * The per-provider modules only describe *their* endpoints and how to read a
 * profile out; state/PKCE cookies, the redirect URI, origin resolution and
 * JWT-payload decoding are all here. Server-only.
 */
import crypto from 'crypto'

/** Cookie names for the short-lived CSRF state, PKCE verifier and return path. */
export const STATE_COOKIE = 'oauth_state'
export const VERIFIER_COOKIE = 'oauth_verifier'
export const RETURN_COOKIE = 'oauth_return'

/** The origin OAuth redirects are built against (APP_URL overrides the request's). */
export function resolveOrigin(requestUrl: string): string {
  const configured = process.env.APP_URL
  if (configured) return configured.replace(/\/$/, '')
  return new URL(requestUrl).origin
}

/** `<origin>/api/auth/<provider>/callback` — register this in each console. */
export function redirectUri(origin: string, providerId: string): string {
  return `${origin}/api/auth/${providerId}/callback`
}

/** Read a JWT payload without verifying the signature (safe for tokens fetched
 *  directly from the provider's token endpoint over TLS — never from the browser). */
export function decodeJwtPayload<T = Record<string, unknown>>(jwt: string): T | null {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

export function randomToken(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

/** PKCE (RFC 7636) S256 pair for providers that require it (X). */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/** Only allow same-site relative return paths (blocks open-redirects). */
export function safeReturnPath(raw: string | null | undefined, fallback = '/myhub'): string {
  if (!raw) return fallback
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  return fallback
}
