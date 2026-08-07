/**
 * Parsing a pasted list of supplier SKUs.
 *
 * SKUs arrive the way people actually have them — a column copied out of a
 * spreadsheet, a comma-separated line from an email, a scribbled list — so the
 * separator is "whatever whitespace or punctuation you used". Kept out of the
 * route so it can be tested without standing up a request.
 */

/** How many SKUs one lookup will resolve. Each costs a detail fetch against a
 *  deliberately throttled transport, so a giant paste is refused up front
 *  rather than quietly taking minutes. */
export const MAX_LOOKUP_SKUS = 50

/** Split a pasted blob into unique, trimmed SKUs, in the order given. */
export function parseSkuInput(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))]
}

/** Normalise whatever the request body carried — an array or a pasted string. */
export function readSkuList(input: unknown): string[] {
  if (typeof input === 'string') return parseSkuInput(input)
  if (Array.isArray(input)) {
    return [...new Set(input.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean))]
  }
  return []
}
