import { randomBytes } from 'crypto'

/**
 * Share-link tokens.
 *
 * A share token ends up in three places with very different demands: a URL
 * someone pastes, a chip printed on the card itself, and — for a competition
 * entry — something a person may read off their own screenshot and type back in.
 * That last one is what rules out base64url and plain hex.
 *
 * ── The alphabet ────────────────────────────────────────────────────────────
 * Crockford base32: digits plus uppercase letters, minus I, L, O and U. I/L/1
 * and O/0 are the pairs people mistype from a screen; U is excluded by Crockford
 * to avoid accidental obscenities, which matters when the token is printed on
 * something posted publicly. Decoding is forgiving — `normaliseToken` maps the
 * confusable characters back — so someone typing O for 0 still lands on the
 * right card.
 *
 * ── The length ──────────────────────────────────────────────────────────────
 * Ten characters is 32^10 ≈ 1.1 × 10^15. The blueprint originally proposed six,
 * which is a fine anti-collision length and a poor anti-enumeration one: at
 * 32^6 ≈ 10^9 a scraper walking the space finds real cards, and the payload can
 * carry an opt-in first name. Ten makes enumeration pointless while still being
 * readable in two groups of five.
 *
 * Tokens are drawn from a CSPRNG, not from a counter or a timestamp — a
 * guessable token is an enumerable one however long it is.
 */

/** Crockford base32, minus I, L, O and U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const TOKEN_LENGTH = 10

/** Confusable characters, mapped to what the person meant. */
const CONFUSABLE: Record<string, string> = {
  I: '1', L: '1', O: '0', U: 'V',
}

/**
 * A fresh token.
 *
 * Bytes are rejected rather than reduced modulo 32. `byte % 32` would make the
 * first eight symbols of the alphabet very slightly likelier than the rest —
 * harmless here, but modulo bias in a random-identifier generator is a habit
 * worth not having, and rejection costs nothing at this size.
 */
export function generateShareToken(length = TOKEN_LENGTH): string {
  let out = ''
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= 256 - (256 % ALPHABET.length)) continue
      out += ALPHABET[byte % ALPHABET.length]
      if (out.length === length) break
    }
  }
  return out
}

/**
 * A token as typed, in the form it is stored in.
 *
 * Uppercases, drops the separators people add when reading a code aloud
 * (spaces and hyphens), and folds the confusable characters. Returns null when
 * what is left is not a token, so callers get one check rather than a length
 * test and an alphabet test at every call site.
 */
export function normaliseToken(input: string, length = TOKEN_LENGTH): string | null {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[ILOU]/g, (c) => CONFUSABLE[c])

  if (cleaned.length !== length) return null
  for (const c of cleaned) if (!ALPHABET.includes(c)) return null
  return cleaned
}

/** Whether a string is already a well-formed token. */
export function isShareToken(input: string, length = TOKEN_LENGTH): boolean {
  return input.length === length && normaliseToken(input, length) === input
}
