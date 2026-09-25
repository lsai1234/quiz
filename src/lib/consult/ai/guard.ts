/**
 * The guardrails pack (build V5): the checks every piece of free text and
 * every AI output passes, on both sides of the network.
 *
 *   Front door   length cap, cleaned text, rate limits (routes), moderation
 *                (server), and the medical screen below — before anything is
 *                sent anywhere.
 *   Prompts      one narrow job each; the person's words are data, never
 *                instructions (see `copy.ts` / `understand.ts`).
 *   Outputs      schema, length, known values only, banned-word filter
 *                (`isClean`), scripted fallback on any failure.
 *
 * ── The medical screen ──────────────────────────────────────────────────────
 * "Tell Amp more" is free text, and people will type health details into a
 * free-text box. Those are special category data, the consult's consent
 * wording promises they are never sent to AI, and the circuit check is the one
 * place built to handle them. So text that looks medical is stopped in the
 * browser, before any request, and the person is pointed at the circuit check
 * (or a GP or pharmacist for a question). Deliberately broad: a false alarm
 * costs one re-worded sentence; a miss sends someone's prescription to a model.
 */

export const MAX_TEXT = 280

/** Health terms that keep text on the device. Matched on word starts, case-insensitive. */
const MEDICAL = [
  /\bpregnan/i, /\bbreast ?feed/i, /\btrying for a baby/i, /\bivf\b/i,
  /\bmedic(ation|ine)/i, /\bprescri/i, /\btablets?\b/i, /\bpills?\b/i, /\bdoctor\b/i, /\bgp\b/i,
  /\bwarfarin/i, /\bapixaban/i, /\brivaroxaban/i, /\bblood thinn/i, /\bstatin/i, /\binsulin/i, /\bmetformin/i,
  /\bantidepress/i, /\bssri/i, /\bsertraline/i, /\bcitalopram/i, /\bfluoxetine/i, /\bthyroxine/i, /\blevothyrox/i,
  /\bcontracept/i, /\bthe pill\b/i, /\bhrt\b/i,
  /\bdiabet/i, /\bkidney/i, /\bliver\b/i, /\bheart (condition|disease|problem|attack)/i, /\bblood pressure/i, /\bhypertens/i,
  /\bcancer/i, /\bchemo/i, /\bepilep/i, /\bseizure/i, /\bstroke\b/i, /\bsurgery/i, /\boperation\b/i,
  /\bdepress(ion|ed)\b/i, /\banxiety disorder/i, /\bbipolar/i, /\bschizo/i, /\beating disorder/i, /\banorexi/i, /\bbulimi/i,
  /\ballerg/i, /\bcoeliac/i, /\bcrohn/i, /\bcolitis/i, /\bibs\b/i, /\bdiagnos/i, /\bcondition\b/i,
]

export function looksMedical(text: string): boolean {
  return MEDICAL.some((re) => re.test(text))
}

/** Plain, single-spaced text: no markup, no control characters, capped. */
export function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT)
}

export type TextVerdict =
  | { ok: true; text: string }
  | { ok: false; reason: 'empty' | 'too-long' | 'medical' }

/** The browser's check, before a request is made. */
export function screenText(raw: string): TextVerdict {
  if (raw.trim().length > MAX_TEXT) return { ok: false, reason: 'too-long' }
  const text = cleanText(raw)
  if (!text) return { ok: false, reason: 'empty' }
  if (looksMedical(text)) return { ok: false, reason: 'medical' }
  return { ok: true, text }
}

/** What Amp says when a piece of text is held back. Calm, and pointing somewhere useful. */
export const HELD_BACK: Record<'too-long' | 'medical', string> = {
  'too-long': `That's a lot — can you say it in ${MAX_TEXT} characters or fewer?`,
  medical:
    'That sounds like health information, so I haven’t sent it anywhere. The circuit check at the end is where that goes — and for a question about a condition or medicine, your GP or pharmacist is the right person.',
}

/**
 * A crude per-instance rate limit for the AI routes. A spend guard, not a
 * security control: on serverless each instance keeps its own count.
 */
export function rateLimiter(limit: number, windowMs: number) {
  const bucket = { count: 0, resetAt: 0 }
  return (): boolean => {
    const now = Date.now()
    if (now > bucket.resetAt) {
      bucket.count = 0
      bucket.resetAt = now + windowMs
    }
    bucket.count++
    return bucket.count > limit
  }
}
