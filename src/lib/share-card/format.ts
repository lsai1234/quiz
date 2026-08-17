import type { ShareCardPayload, ShareLineupEntry } from './types'

/**
 * The card's formats, and what each one has room to say.
 *
 * Kept as data and a pure function rather than as conditionals inside the
 * renderer, for two reasons. The renderer runs inside Satori, where a mistake
 * surfaces as a wrong-looking PNG rather than as an exception — so the parts
 * that can be checked by a test should not be tangled with the parts that can
 * only be checked by eye. And every "does this format show the stats?" branch
 * left in JSX is a branch that gets answered differently the third time it is
 * asked.
 *
 * So: this file decides *what appears*, the component decides *how it looks*.
 */

export type ShareFormat = 'story' | 'square' | 'og'

export interface FormatSpec {
  width: number
  height: number
  /** Share of the card's height given to the picture. */
  imageRatio: number
  /** Items per list column. */
  lineupRows: number
  /** The big number-over-caption pairs. */
  showStats: boolean
  /** The routine-fit numeral over the image panel. */
  showFitMeter: boolean
  /** The tier, appended to the eyebrow. */
  showTier: boolean
  /** The code chip. Redundant where the link itself carries it. */
  showCode: boolean
  /** The "+n more in your stack" line. */
  showOverflow: boolean
}

export const FORMATS: Record<ShareFormat, FormatSpec> = {
  /**
   * The primary asset. 1080 × 1920 is the Instagram/TikTok story frame, and the
   * only format with room for everything: picture, two five-deep lists, both
   * stat pairs and the footer.
   */
  story: {
    width: 1080,
    height: 1920,
    imageRatio: 0.46,
    lineupRows: 5,
    showStats: true,
    showFitMeter: true,
    showTier: true,
    showCode: true,
    showOverflow: true,
  },

  /**
   * Feed and carousel — the same width as the story for 56% of the height, so
   * the picture takes a smaller share and the lists run three deep. The stats
   * stay: a number that size is most of what makes a card read as finished
   * rather than as a cropped version of the story one.
   */
  square: {
    width: 1080,
    height: 1080,
    imageRatio: 0.34,
    lineupRows: 3,
    showStats: true,
    showFitMeter: true,
    showTier: true,
    showCode: true,
    showOverflow: false,
  },

  /**
   * The link preview. Never downloaded — it exists so a pasted `/s/…` link
   * unfurls properly in WhatsApp, iMessage, Slack, Discord and X, where it is
   * usually rendered under 400px wide. Picture down the left, everything that
   * survives at that size to the right of it, and no code chip because the URL
   * beside it already carries the code.
   */
  og: {
    width: 1200,
    height: 630,
    imageRatio: 1,
    lineupRows: 3,
    showStats: false,
    showFitMeter: true,
    showTier: false,
    showCode: false,
    showOverflow: true,
  },
}

export function isShareFormat(value: string): value is ShareFormat {
  return value in FORMATS
}

/** Tier labels read as the customer's choice, not as the internal enum. */
const TIER_LABEL: Record<string, string> = {
  essentials: 'Essentials',
  performance: 'Balanced',
  complete: 'Complete',
}

/** One number-over-caption pair. */
export interface ShareStat {
  label: string
  value: string
}

/**
 * What this format actually draws, for this payload.
 *
 * Everything conditional is resolved here — including the cases where a field
 * exists but there is nothing to show (no identity, an empty lineup) — so the
 * component renders a view model and never asks a question about the data.
 */
export interface ShareCardView {
  format: ShareFormat
  spec: FormatSpec
  eyebrow: string
  stackName: string
  archetype: string | null
  fit: { score: number } | null
  lineup: ShareLineupEntry[]
  /**
   * The second column: what the stack is for.
   *
   * The focus areas when an identity was generated, and the coverage axes — the
   * customer's own goals — when one was not. Both answer the same question, and
   * this is where the card now says *why*. The first version spent a whole row
   * per product on a sentence, which is how four products came to fill a frame
   * that now carries ten data points.
   */
  builtFor: string[]
  /** Products the format had no room for. 0 when the whole lineup fits. */
  overflow: number
  stats: ShareStat[]
  /** The hero picture, when the catalogue has one. Falls back to house art. */
  heroImage: string | null
  code: string | null
  footer: string
}

export function buildShareCardView(payload: ShareCardPayload, format: ShareFormat): ShareCardView {
  const spec = FORMATS[format]

  const greeting = payload.firstName ? `${payload.firstName.toUpperCase()}’S ` : ''
  const tier = TIER_LABEL[payload.level] ?? null
  const base = payload.drinksMode ? 'CHRGD LQD' : 'CHRGD STACK'
  const eyebrow = spec.showTier && tier ? `${greeting}${base} · ${tier}` : `${greeting}${base}`

  const shown = payload.lineup.slice(0, spec.lineupRows)

  const builtFor = (
    payload.focusAreas.length > 0
      ? payload.focusAreas.map((f) => f.label)
      : payload.coverage.filter((c) => c.targeted).map((c) => c.label)
  ).slice(0, spec.lineupRows)

  // A number and a word, which is the pairing that makes the reference's stat
  // row read — two words side by side is a caption, two numbers is a table.
  //
  // Routine fit is the number rather than the product count, because it is the
  // figure that is purely this customer's and the one worth comparing with a
  // friend. It was drawn over the picture in the first pass and rendered
  // invisible there; a stat pair is where a number that size actually belongs.
  const topGoal = payload.coverage.find((c) => c.targeted)?.label ?? payload.coverage[0]?.label
  const stats: ShareStat[] = spec.showStats
    ? [
        ...(payload.fitScore !== null
          ? [{ label: 'Routine fit', value: String(payload.fitScore) }]
          : [{ label: 'Products', value: String(payload.lineup.length) }]),
        ...(topGoal ? [{ label: 'Built mainly for', value: topGoal }] : []),
      ]
    : []

  return {
    format,
    spec,
    eyebrow,
    stackName: payload.stackName,
    archetype: payload.archetype.trim() || null,
    fit: spec.showFitMeter && payload.fitScore !== null ? { score: payload.fitScore } : null,
    lineup: shown,
    builtFor,
    overflow: spec.showOverflow ? Math.max(0, payload.lineup.length - shown.length) : 0,
    stats,
    heroImage: payload.heroImage ?? null,
    code: spec.showCode ? (payload.code ?? null) : null,
    footer: 'getchrgd.co.uk',
  }
}
