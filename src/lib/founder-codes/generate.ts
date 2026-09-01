/**
 * Minting a founder code. The one part of the domain that needs randomness,
 * kept on its own so `codes.ts` stays importable from the browser.
 *
 * Server-only.
 */
import crypto from 'crypto'
import type { FounderCodeKind } from './types'

/**
 * Crockford-style base32, minus I, L, O and U.
 *
 * The same alphabet as an order reference, for the same reason: these get read
 * off one screen and typed into another, and a 0/O argument at the checkout of
 * a code that only lives 24 hours is a wasted code.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Prefix per kind, so a code says what it is before it is pasted anywhere. */
const PREFIX: Record<FounderCodeKind, string> = {
  free: 'FH-FREE',
  cost: 'FH-COST',
  unlock: 'FH-MIN',
}

/**
 * A fresh code.
 *
 * 8 random symbols out of a 32-symbol alphabet is 40 bits. That is not a
 * password and does not need to be: a code is single-use, dies in 24 hours, and
 * every guess costs a round trip through a rate-limited endpoint. What it has
 * to beat is somebody trying `FREE100` at the checkout, and it does.
 *
 * `crypto.randomBytes` rather than `Math.random` because the thing on the other
 * side of a correct guess is a free order.
 */
export function newFounderCode(kind: FounderCodeKind): string {
  const bytes = crypto.randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return `${PREFIX[kind]}-${out}`
}
