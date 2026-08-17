import type { ShareCardPayload, ShareLineupEntry, ShareCoverageEntry } from './types'
import { headlineSize, px, SHARE_PALETTE as P } from './palette'

/**
 * The card's formats, and the layout decisions each one implies.
 *
 * Kept as data and a pure function rather than as conditionals inside the
 * renderer, for two reasons. The renderer runs inside Satori, where a mistake
 * surfaces as a wrong-looking PNG rather than as an exception — so the parts
 * that can be checked by a test should not be tangled with the parts that can
 * only be checked by eye. And every "does this format show the meter?" branch
 * left in JSX is a branch that gets answered differently the third time it is
 * asked.
 *
 * So: this file decides *what appears*, the component decides *how it looks*.
 */

export type ShareFormat = 'story' | 'square' | 'og'

export interface FormatSpec {
  width: number
  height: number
  /** Lineup rows this format has room for; the rest become an overflow line. */
  lineupRows: number
  /** Whether a row carries its reason, or just the slot and the product. */
  showReasons: boolean
  /** The code chip in the footer. Redundant where the link itself carries it. */
  showCode: boolean
  /** The "+n more in your stack" line. */
  showOverflow: boolean
  /** Coverage bars have to be legible to earn their space. */
  showCoverage: boolean
  showFocusAreas: boolean
  showFitMeter: boolean
  /** The tier chip — "Complete", "Essentials". */
  showTier: boolean
  showFooter: boolean
}

export const FORMATS: Record<ShareFormat, FormatSpec> = {
  /**
   * The primary asset. 1080 × 1920 is the Instagram/TikTok story frame, and
   * three times a 360px phone viewport — see `CARD_SCALE` — so the card renders
   * at the same apparent size as the app it came from.
   */
  story: {
    width: 1080,
    height: 1920,
    // Six was the plan; four is what fits once the header, the fit ring and the
    // coverage bars have taken their share of 1920px — measured by rendering it,
    // not by arithmetic. Rows five and six landed on top of the coverage bars,
    // because Satori draws an overflowing child over its siblings rather than
    // clipping it. A denser card is not worth a broken one, and the overflow
    // line says "+3 more in your stack" either way.
    lineupRows: 4,
    showReasons: true,
    showCode: true,
    showOverflow: true,
    showCoverage: true,
    showFocusAreas: true,
    showFitMeter: true,
    showTier: true,
    showFooter: true,
  },

  /**
   * Feed and carousel. Same width as the story for 56% of the height, so most of
   * what the story carries has to go — and rendering it decided which. The
   * coverage bars go first: four labelled bars are the least legible thing on
   * the card in a feed. The focus chips go second, because the archetype chip
   * directly above them is already saying what this stack is for, and two rows
   * making the same point is what was pushing the lineup off the frame.
   *
   * What is left is the headline, the archetype, the fit ring and two products —
   * which is the right card for a slide sitting next to an influencer's photo.
   */
  square: {
    width: 1080,
    height: 1080,
    lineupRows: 2,
    showReasons: true,
    showCode: true,
    // No "+n more". 1080px is tight enough that the line costs a whole product
    // row, and on a teaser card two products with their reasons say more than
    // one product and a count.
    showOverflow: false,
    showCoverage: false,
    showFocusAreas: false,
    // And no fit ring. It is 121px of header — the difference between two
    // products with their reasons and one — and the ring is the story card's
    // hook, not a carousel slide's. A slide sitting next to an influencer's
    // photo is carrying the products.
    showFitMeter: false,
    showTier: true,
    showFooter: true,
  },

  /**
   * The link preview. Never downloaded — it exists so a pasted `/s/…` link
   * unfurls properly in WhatsApp, iMessage, Slack, Discord and X, where it is
   * usually rendered under 400px wide.
   *
   * Everything that survives at that size and nothing that does not. The reasons
   * go: at a third of their rendered size they are a grey texture rather than
   * words, and dropping them is what buys a third product and a footer that fits
   * inside 630px.
   */
  og: {
    width: 1200,
    height: 630,
    // Two, not three: a third row and the overflow line together run past 630px.
    lineupRows: 2,
    showReasons: false,
    showOverflow: true,
    // No code chip. This card is never downloaded — it is what a link unfurls
    // into — so the URL beside it already carries the code, and the chip only
    // collided with the footer in a 44%-wide column.
    showCode: false,
    showCoverage: false,
    showFocusAreas: false,
    showFitMeter: true,
    showTier: false,
    showFooter: true,
  },
}

export function isShareFormat(value: string): value is ShareFormat {
  return value in FORMATS
}

/** How many focus chips fit on a row before they wrap into a second one. */
const MAX_FOCUS_AREAS = 3

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
  focusAreas: ShareCardPayload['focusAreas']
  fit: { score: number; label: string } | null
  lineup: ShareLineupEntry[]
  /** Products the format had no room for. 0 when the whole lineup fits. */
  overflow: number
  coverage: ShareCoverageEntry[]
  tier: string | null
  code: string | null
  footer: string
}

/** Tier chips read as the customer's choice, not as the internal enum. */
const TIER_LABEL: Record<string, string> = {
  essentials: 'Essentials',
  performance: 'Balanced',
  complete: 'Complete',
}

/**
 * How many lineup rows are left once everything else has taken its space.
 *
 * The card is a fixed frame and almost nothing in it is a fixed height: a long
 * stack name wraps to two lines, three long focus labels wrap to two chip rows,
 * and a card with no AI identity has no archetype chip, no fit ring and no focus
 * chips at all. A constant row count is therefore wrong in both directions — the
 * first renders overflowed the frame on the longest persona and left a third of
 * the card empty on the one with no identity.
 *
 * Satori offers no measurement pass, so this is a budget rather than a
 * measurement: block heights in card pixels, calibrated against real renders and
 * checked by `format.test.ts`. Being off by one only ever costs or gains a row
 * that the overflow line already accounts for — which is the property that makes
 * an estimate acceptable here at all.
 */

/** Space Grotesk Bold's effective advance at display sizes, from real renders. */
const DISPLAY_ADVANCE = 0.54
/** Inter SemiBold's, at chip sizes. */
const CHIP_ADVANCE = 0.5

/**
 * Block heights, in card pixels, measured off real renders rather than derived
 * from the tokens — a line box is not its font size, and the difference
 * compounds across eight blocks. `format.test.ts` pins the counts these produce
 * for the six personas, so a change here that quietly moves a row count fails.
 */
const H = {
  headlineLine: 112,
  /** The archetype chip beside the fit ring — the ring sets the height. */
  fitRow: 121,
  /** The same row with no ring in it: the chip alone. */
  chipOnlyRow: 76,
  chipRow: 88,
  eyebrowRow: 28,
  sectionLabel: 24,
  coverageBars: 40,
  footer: 112,
  overflowLine: 30,
  /** A lineup row with its reason, plus the gap beneath it. */
  lineupRow: 178,
  /** A row without its reason (the OG layout). */
  compactRow: 150,
}

function headlineLines(name: string, availableWidth: number): number {
  const size = headlineSize(name, availableWidth)
  const perLine = Math.max(1, availableWidth / (size * DISPLAY_ADVANCE))
  return Math.max(1, Math.ceil(name.trim().length / perLine))
}

function focusChipRows(labels: string[], availableWidth: number): number {
  const chipPad = px(P.space4) * 2
  const gap = px(P.space2)
  const charWidth = px(P.textBodySm) * CHIP_ADVANCE

  let rows = 1
  let used = 0
  for (const label of labels) {
    const w = label.length * charWidth + chipPad
    if (used > 0 && used + gap + w > availableWidth) {
      rows += 1
      used = w
    } else {
      used += (used > 0 ? gap : 0) + w
    }
  }
  return rows
}

interface Budget {
  /** Rows this card can draw, at most. */
  rows: number
  /** Exposed for the test, so the calibration is inspectable rather than folded
   *  into a single number nobody can check. */
  headerHeight: number
  available: number
}

function rowBudget(
  payload: ShareCardPayload,
  spec: FormatSpec,
  format: ShareFormat,
  focusAreas: ShareCardPayload['focusAreas'],
  textWidth: number,
): Budget {
  const pad = px(P.gutter + P.space3)
  const sectionGap = px(P.space6)
  const headerGap = px(P.space3)

  const hasRing = spec.showFitMeter && payload.fitScore !== null
  const hasChipRow = payload.archetype.trim().length > 0
  const chipRows = focusAreas.length > 0
    ? focusChipRows(focusAreas.map((f) => f.label), textWidth)
    : 0

  const headerBlocks = [
    H.eyebrowRow,
    headlineLines(payload.stackName, textWidth) * H.headlineLine,
    hasRing ? H.fitRow : hasChipRow ? H.chipOnlyRow : 0,
    chipRows > 0 ? H.sectionLabel + chipRows * H.chipRow : 0,
  ].filter((h) => h > 0)

  const headerHeight =
    headerBlocks.reduce((a, b) => a + b, 0) + (headerBlocks.length - 1) * headerGap

  // "THE LINEUP" and, when there is one, the "+n more" line beneath the rows.
  const lineupChrome =
    H.sectionLabel + headerGap +
    (spec.showOverflow && payload.lineup.length > spec.lineupRows ? H.overflowLine + headerGap : 0)

  // The OG card runs the header and the lineup as two columns, so the header and
  // the footer cost the lineup nothing but their own column — charging the
  // lineup for them is what collapsed it to a single row.
  const chrome = format === 'og'
    ? pad * 2 + lineupChrome
    : pad * 2 + lineupChrome + headerHeight + H.footer +
      (spec.showCoverage ? H.sectionLabel + H.coverageBars : 0) +
      (spec.showCoverage ? 3 : 2) * sectionGap

  const available = spec.height - chrome
  const rowHeight = spec.showReasons ? H.lineupRow : H.compactRow

  return {
    rows: Math.max(1, Math.min(spec.lineupRows, Math.floor(available / rowHeight))),
    headerHeight,
    available,
  }
}

export function buildShareCardView(payload: ShareCardPayload, format: ShareFormat): ShareCardView {
  const spec = FORMATS[format]

  const greeting = payload.firstName ? `${payload.firstName.toUpperCase()}\u2019S ` : ''
  const eyebrow = payload.drinksMode ? `${greeting}CHRGD LQD PACKAGE` : `${greeting}CHRGD STACK`

  const focusAreas = spec.showFocusAreas ? payload.focusAreas.slice(0, MAX_FOCUS_AREAS) : []

  // The width the header's text actually gets — not the frame width, on the
  // two-column OG layout.
  const pad = px(P.gutter + P.space3)
  const textWidth = (format === 'og' ? spec.width * 0.44 : spec.width) - pad * 2

  const shown = payload.lineup.slice(0, rowBudget(payload, spec, format, focusAreas, textWidth).rows)

  return {
    format,
    spec,
    eyebrow,
    stackName: payload.stackName,
    archetype: payload.archetype.trim() || null,
    focusAreas,
    fit:
      spec.showFitMeter && payload.fitScore !== null
        ? { score: payload.fitScore, label: 'Routine fit' }
        : null,
    lineup: shown,
    overflow: spec.showOverflow ? Math.max(0, payload.lineup.length - shown.length) : 0,
    coverage: spec.showCoverage ? payload.coverage : [],
    tier: spec.showTier ? (TIER_LABEL[payload.level] ?? null) : null,
    code: spec.showCode ? (payload.code ?? null) : null,
    footer: 'getchrgd.co.uk',
  }
}

/** Exposed for the calibration test only. */
export const __budget = { rowBudget, headlineLines, focusChipRows, H }
