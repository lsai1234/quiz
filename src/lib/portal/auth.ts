/**
 * Portal admin auth — a single shared password (mock-first). Upgrade path:
 * Shopify staff OAuth / SSO at integration time. Server-only (uses node crypto).
 */
import crypto from 'crypto'

export const PORTAL_COOKIE = 'portal_session'

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'chrgd-admin'
}

/** Opaque session token derived from the password (so the cookie isn't the password). */
export function expectedToken(): string {
  return crypto.createHash('sha256').update(`chrgd-portal:${adminPassword()}`).digest('hex')
}

export function verifyPassword(password: string): boolean {
  return typeof password === 'string' && password === adminPassword()
}

export function isAuthed(token: string | undefined | null): boolean {
  return !!token && token === expectedToken()
}
