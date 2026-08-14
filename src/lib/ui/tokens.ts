/**
 * The house palette, in one place.
 *
 * Before this file, `const ACCENT = '#00D4FF'` was declared in 15 of the 19 hub
 * components (78 files repo-wide), with `GREEN` and `AMBER` alongside it in six
 * of them. Every one of those is a copy that can drift, and several already had:
 * the "review" amber is `#fbbf24` in most places and `#f59e0b` in `globals.css`.
 *
 * These are TS constants rather than CSS variables because a good deal of the
 * app composes colour at runtime — `color-mix(in srgb, ${ACCENT} 14%, transparent)`
 * and friends — which needs a value, not a `var()`. The matching CSS custom
 * properties live in `globals.css` for everything that can use them; the two are
 * kept in step by hand, and this file is the source both are derived from.
 */

/** The brand cyan. Prices, CTAs, selected states, progress. */
export const ACCENT = '#00D4FF'

/** Money coming back to the member: credits, savings, refunds, waivers. */
export const GREEN = '#34d399'

/** Needs attention — never "error". Settlements, skips, out-of-stock, exits. */
export const AMBER = '#fbbf24'

/** Genuine failure. Auth errors, failed payments. */
export const RED = '#ff6b6b'

/** How a stack line is landing. Mirrors `StatusTone` in `@/lib/feedback`. */
export const TONE = {
  /** Felt and working. */
  good: GREEN,
  /** Still building towards its effect window. */
  building: ACCENT,
  /** Works quietly in the background; not something you feel. */
  essential: '#7dd3fc',
  /** Not landing — worth a change. */
  review: AMBER,
} as const

export type ToneName = keyof typeof TONE

export function toneColor(tone: ToneName): string {
  return TONE[tone]
}

/**
 * Alpha-on-black surfaces — the technique that separates the designed screens
 * from the assembled ones.
 *
 * Opaque greys (`--color-surface-2`) put every card at the same visual weight,
 * so nothing recedes and nothing leads. A translucent white over the page
 * background does recede, and stacks: a card on a sheet on the page reads as
 * three distinct planes without three distinct greys being invented.
 */
export const GLASS = {
  /** A resting card or row. */
  surface: 'rgba(255,255,255,0.015)',
  /** Hover / pressed / a nested emphasis. */
  raised: 'rgba(255,255,255,0.04)',
  /** The default hairline border. */
  hairline: 'rgba(255,255,255,0.08)',
  /** Hairline on hover, or where a border needs to be seen rather than felt. */
  hairlineStrong: 'rgba(255,255,255,0.20)',
} as const

/**
 * A colour tinted into a surface, border or glow.
 *
 * `color-mix` in sRGB rather than oklch: the accent is a near-cyan primary, and
 * oklch interpolation towards transparent takes it visibly green on the way.
 */
export function tint(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

/** A soft coloured bloom under an elevated element, in the `DidYouKnowChip` idiom. */
export function glow(color: string, pct = 45): string {
  return `0 8px 30px -12px ${tint(color, pct)}`
}

/**
 * One radius per role, so adjacent elements stop disagreeing. The hub currently
 * mixes `rounded-lg`, `-xl`, `-2xl` and `-3xl` on elements sitting side by side.
 */
export const RADIUS = {
  /** Pills, chips, small controls. */
  pill: 9999,
  /** A row inside a card; a compact button. */
  row: 12,
  /** A card; a full-width button. */
  card: 16,
  /** The top corners of a bottom sheet; the hero. */
  sheet: 24,
} as const

/** The house easing — a soft overshoot-free settle. Used across the quiz. */
export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** Standard transition duration, in ms. Matches `duration-200` in the quiz. */
export const DURATION = 200
