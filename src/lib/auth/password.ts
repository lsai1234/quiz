/**
 * Password hashing for customer accounts — scrypt from node:crypto, so there's
 * no native/wasm hashing dependency. The stored string is self-describing
 * (`scrypt:N:r:p:salt:hash`, base64url), so parameters can be raised later
 * without invalidating existing hashes.
 *
 * Server-only.
 */
import crypto from 'crypto'

const SCRYPT = { N: 16384, r: 8, p: 1 }
const KEY_LENGTH = 32
const SALT_LENGTH = 16

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH)
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT)
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join(':')
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  try {
    const [scheme, N, r, p, saltPart, hashPart] = stored.split(':')
    if (scheme !== 'scrypt') return false
    const salt = Buffer.from(saltPart, 'base64url')
    const expected = Buffer.from(hashPart, 'base64url')
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    })
    return crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
