/**
 * Minting a starter code. The one part of the domain that needs randomness,
 * kept on its own so `rules.ts` stays importable from the browser.
 *
 * Server-only.
 */
import crypto from 'crypto'

/**
 * Crockford-style base32, minus I, L, O and U — the same alphabet as an order
 * reference and a founder code, for the same reason: these are read off one
 * screen and typed into another, and a 0/O argument at a checkout is a wasted
 * code and an email.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * A fresh starter code.
 *
 * 8 symbols out of 32 is 40 bits. Not a password, and it does not have to be:
 * a starter is single use, dies in three weeks, does nothing until its
 * agreement is signed, and every guess costs a round trip through the same
 * rate-limited box that guards the founder codes.
 *
 * `crypto.randomBytes` rather than `Math.random`, because what sits behind a
 * correct guess is a free box.
 */
export function newStarterCode(): string {
  const bytes = crypto.randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return `PS-${out}`
}
