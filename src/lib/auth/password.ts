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

/** The shortest password a customer account will accept. */
export const MIN_PASSWORD_LENGTH = 8

/**
 * Why a password is not acceptable, or null.
 *
 * One rule, in one place, for every route that sets one. Sign-up and reset used
 * to answer this question separately, which is how you end up with a reset that
 * refuses a password sign-up would have taken — or, worse, accepts one it
 * wouldn't.
 *
 * The upper bound is not fussiness: scrypt hashes whatever it is given, and a
 * megabyte of "password" is a free way to tie up a CPU.
 */
export function passwordProblem(password: string): string | null {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  if (password.length > 200) return 'That password is too long'
  return null
}

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
