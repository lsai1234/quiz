/**
 * Grouping identical faults.
 *
 * An error log that lists occurrences is unreadable within a day: one broken
 * checkout on a busy evening is four hundred rows that all say the same thing,
 * and the second, rarer bug that actually needed your attention is on page nine.
 *
 * So every occurrence is reduced to a **fingerprint** — a short hash of the
 * error's *shape* rather than its text — and the hub shows one row per
 * fingerprint with a count. The whole value of the monitoring page depends on
 * this function being neither too eager nor too shy:
 *
 *   too eager  → two unrelated bugs merge, and fixing one "resolves" the other
 *   too shy    → the same bug appears once per order id, and nothing collapses
 *
 * The shape is `surface + normalised message + top application stack frame`.
 * Normalising the message is what removes the ids, amounts and timestamps that
 * make every occurrence textually unique while describing one fault; keeping the
 * top frame is what stops two different call sites throwing the same generic
 * message ("Not found", "fetch failed") from being treated as one.
 */
import type { Surface } from './types'

/**
 * Strip the parts of a message that vary between occurrences of one fault.
 *
 * Order matters: the longest, most specific patterns go first, so a UUID is
 * replaced whole rather than being shredded into `<n>`s by the number rule.
 */
export function normaliseMessage(message: string): string {
  return (
    message
      .trim()
      // UUIDs — order ids, user ids, session ids.
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
      // Stripe object ids and our own prefixed ids: cs_test_…, pi_…, sub_…, ord_…
      //
      // The prefix may itself be segmented (`cs_test_…`), hence the repeated
      // group — `\b[a-z]+_…` alone never matches the second underscore, because
      // `_` is a word character and there is no boundary before `test`.
      //
      // The lookahead requiring a digit is what keeps this from over-merging.
      // Without it the pattern also eats ordinary snake_case, and
      // "relation stock_exceptions does not exist" and "relation
      // partner_payouts does not exist" — two different bugs — collapse into one
      // group where fixing either appears to fix both. Every real id here
      // carries digits; a table name does not.
      .replace(/\b[a-z]{2,12}(?:_[a-z]{2,12})*_(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]{6,}\b/g, '<id>')
      // Long hex or base-ish blobs (hashes, tokens).
      .replace(/\b[0-9a-f]{16,}\b/gi, '<hash>')
      // URLs, keeping the origin off so localhost and production group together.
      .replace(/https?:\/\/[^\s'")]+/g, '<url>')
      // ISO timestamps.
      .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g, '<time>')
      // Quoted fragments — usually the offending value, not the fault.
      .replace(/'[^']{1,80}'/g, "'<v>'")
      .replace(/"[^"]{1,80}"/g, '"<v>"')
      // Anything left that is a bare number, including decimals and negatives.
      .replace(/-?\b\d+(\.\d+)?\b/g, '<n>')
      // Collapse the whitespace the substitutions leave behind.
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * The first stack frame that belongs to us.
 *
 * Frames inside `node_modules`, Next's own runtime and the V8 internals are
 * skipped: they are where the error surfaced, not where it came from, and they
 * are identical across unrelated bugs. Column numbers are dropped and line
 * numbers kept — a fix that shifts a file by three lines should not fork the
 * group, but a genuinely different line usually is a different fault.
 */
export function topFrame(stack: string | null | undefined): string {
  if (!stack) return ''
  const lines = stack.split('\n').slice(1)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line.startsWith('at ')) continue
    if (/node_modules|node:internal|webpack-internal|next\/dist/.test(line)) continue
    const m = line.match(/\(?([^()\s]+?):(\d+):(\d+)\)?$/)
    if (!m) continue
    // Keep the tail of the path: enough to identify the file, short enough that
    // a build-hash directory or an absolute prefix cannot fork the group.
    const file = m[1].split(/[\\/]/).slice(-2).join('/')
    return `${file}:${m[2]}`
  }
  return ''
}

/**
 * FNV-1a, run as two independent 32-bit lanes and concatenated.
 *
 * Deliberately hand-rolled rather than `crypto.createHash('sha1')`. This module
 * is reached from `instrumentation.ts`, which Next compiles for the Edge
 * runtime as well as Node, and `node:crypto` does not exist there — importing
 * it fails the build. WebCrypto's `subtle.digest` does exist but is async, and
 * making a fingerprint async would push a promise into every call site on a
 * path that must stay trivially safe.
 *
 * Two 32-bit lanes rather than one 64-bit BigInt pass because the project
 * targets ES2017, where BigInt literals are not available — and `Math.imul` is
 * the faster arithmetic anyway. The lanes differ only in their offset basis,
 * which is enough to decorrelate them for this purpose.
 *
 * A cryptographic hash was never the requirement. This is a bucket label: it
 * needs to be deterministic, fast and evenly spread. It is explicitly **not** a
 * security boundary, and nothing may start treating it as one.
 */
const FNV_PRIME_32 = 0x01000193
const LANE_A_OFFSET = 0x811c9dc5
const LANE_B_OFFSET = 0x7fffffff

function fnv1a32(input: string, offset: number): string {
  let hash = offset
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // `Math.imul` keeps the multiply in 32-bit two's complement; a plain `*`
    // would lose the low bits to float64 rounding and wreck the distribution.
    hash = Math.imul(hash, FNV_PRIME_32)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * The stable grouping key. Twelve hex characters — short enough to read out in
 * a URL, wide enough that a collision is not a realistic concern at this volume
 * (48 bits; the birthday bound is around 16 million distinct faults).
 */
export function fingerprint(input: {
  surface: Surface
  message: string
  stack?: string | null
}): string {
  const shape = [input.surface, normaliseMessage(input.message), topFrame(input.stack)].join('|')
  return `${fnv1a32(shape, LANE_A_OFFSET)}${fnv1a32(shape, LANE_B_OFFSET)}`.slice(0, 12)
}
