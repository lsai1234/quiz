/**
 * The design tokens, frozen as literals, for the one renderer that cannot read
 * them.
 *
 * ── Why this file is allowed to exist ───────────────────────────────────────
 * `DESIGN.md` says every design value comes from a token and no component may
 * carry a hex literal. That rule holds because everything rendering in a browser
 * can read `tokens.css`. The share card does not render in a browser: it is
 * rasterised by Satori (`next/og`), which resolves no custom properties, no
 * `color-mix()` and no stylesheet at all. Values have to arrive as literals.
 *
 * The failure mode this file is designed against is a card component quietly
 * accumulating its own palette — the "39 file-local copies of the accent
 * colour" that `DESIGN.md` was written to end. So the literals live here, once,
 * and `TOKEN_SOURCE` records which token each one was copied from.
 * `__tests__/palette-sync.test.ts` reads `src/app/tokens.css` and asserts every
 * pair still agrees. Move a token and that test fails naming the value that
 * drifted; it cannot drift silently.
 *
 * ── The rules ───────────────────────────────────────────────────────────────
 * 1. Nothing outside `src/lib/share-card/` may import this file. Everything that
 *    renders in a browser reads the tokens directly.
 * 2. Every entry needs a `TOKEN_SOURCE` mapping. A value with no token behind it
 *    does not belong here — add the token first.
 * 3. Composites (`color-mix`, gradients) are recomputed from these primitives by
 *    `mix()` below rather than copied, so there is one place a tint alpha lives.
 */

/**
 * How much bigger the card is than the app.
 *
 * The card renders at 1080px wide and is viewed full-screen on a phone whose CSS
 * viewport is ~360px — exactly 3×. So a token scaled by 3 lands at the same
 * apparent size on the card as it does in the app, which is what makes the card
 * look like the product rather than like a poster about it.
 *
 * This is a coordinate conversion, not a new type scale. When something needs to
 * be bigger on the card than in the app, step UP the token (`--text-title` where
 * the app uses `--text-body`) rather than multiplying by a second factor — that
 * is how a parallel scale gets invented one call site at a time.
 */
export const CARD_SCALE = 3

/** A token length (px) in card pixels. */
export function px(token: number): number {
  return token * CARD_SCALE
}

export const SHARE_PALETTE = {
  // ── Ground ────────────────────────────────────────────────────────────────
  groundBase: '#07070a',
  bloomAccent: '#00d4ff',
  bloomViolet: '#7c5cff',
  bloomTeal: '#00ffc8',
  bloom1Alpha: 0.12,
  bloom2Alpha: 0.05,
  bloom3Alpha: 0.05,
  grainOpacity: 0.035,

  // ── Elevation ─────────────────────────────────────────────────────────────
  // Kept as rgba strings rather than {hex, alpha} pairs because that is the
  // form tokens.css states them in, which is what keeps the sync test a
  // string comparison rather than a reimplementation of CSS colour parsing.
  surface1: 'rgba(255, 255, 255, 0.05)',
  surface2: 'rgba(255, 255, 255, 0.08)',
  surface3: 'rgba(255, 255, 255, 0.11)',
  surfaceSolid: '#16181d',

  // ── Specular ──────────────────────────────────────────────────────────────
  // The invariant from DESIGN.md travels to the card intact: the falloff equals
  // the tightest padding, so text begins where the highlight has finished. The
  // card carries 11px-equivalent copy over the brightest part of the mesh, which
  // is precisely the case that equality exists to protect.
  specularDepth: 12,
  specularStrength: 0.14,
  specularLine: 'rgba(255, 255, 255, 0.28)',

  // ── Edges ─────────────────────────────────────────────────────────────────
  edge: 'rgba(255, 255, 255, 0.09)',
  edgeStrong: 'rgba(255, 255, 255, 0.18)',
  edgeTop: 'rgba(255, 255, 255, 0.16)',

  // ── Ink ───────────────────────────────────────────────────────────────────
  ink1: '#f4f6fb',
  ink2: '#c3c8d2',
  ink3: '#a2a8b4',
  inkOnAccent: '#07070a',

  // ── Accent and tone ───────────────────────────────────────────────────────
  accent: '#00d4ff',
  accentBright: '#5ce4ff',
  accentDeep: '#00a8d4',
  tonePositive: '#3ddc97',
  toneAttention: '#ffc857',
  toneCritical: '#ff8891',
  toneInfo: '#7dd3fc',

  // ── Radius ────────────────────────────────────────────────────────────────
  radiusPill: 9999,
  radiusChip: 10,
  radiusRow: 14,
  radiusCard: 18,
  radiusSheet: 26,

  // ── Space ─────────────────────────────────────────────────────────────────
  space1: 4,
  space2: 8,
  space3: 12,
  space4: 16,
  space5: 20,
  space6: 24,
  space8: 32,
  gutter: 20,

  // ── Type ──────────────────────────────────────────────────────────────────
  textMicro: 10,
  textMeta: 11,
  textBodySm: 12,
  textBody: 14,
  textLead: 16,
  textTitle: 19,
  textDisplay: 26,

  leadingTight: 1.08,
  leadingSnug: 1.35,
  leadingLoose: 1.6,

  trackingDisplay: -0.03,
  trackingTitle: -0.015,
  trackingEyebrow: 0.16,

  weightBody: 500,
  weightStrong: 700,
  // `--weight-display` is 900, but Space Grotesk tops out at 700 and the card
  // has no browser to synthesise the difference. 700 is the real weight of the
  // vendored face; see fonts.ts.
  weightDisplay: 700,
} as const

export type SharePalette = typeof SHARE_PALETTE

/**
 * Which token in `src/app/tokens.css` each literal above was copied from.
 * `palette-sync.test.ts` walks this map; a key added to `SHARE_PALETTE` without
 * an entry here fails to typecheck.
 */
export const TOKEN_SOURCE: Record<keyof SharePalette, string> = {
  groundBase: 'ground-base',
  bloomAccent: 'bloom-accent',
  bloomViolet: 'bloom-violet',
  bloomTeal: 'bloom-teal',
  bloom1Alpha: 'bloom-1-alpha',
  bloom2Alpha: 'bloom-2-alpha',
  bloom3Alpha: 'bloom-3-alpha',
  grainOpacity: 'grain-opacity',

  surface1: 'surface-1',
  surface2: 'surface-2',
  surface3: 'surface-3',
  surfaceSolid: 'surface-solid',

  specularDepth: 'specular-depth',
  specularStrength: 'specular-strength',
  specularLine: 'specular-line',

  edge: 'edge',
  edgeStrong: 'edge-strong',
  edgeTop: 'edge-top',

  ink1: 'ink-1',
  ink2: 'ink-2',
  ink3: 'ink-3',
  inkOnAccent: 'ink-on-accent',

  accent: 'accent',
  accentBright: 'accent-bright',
  accentDeep: 'accent-deep',
  tonePositive: 'tone-positive',
  toneAttention: 'tone-attention',
  toneCritical: 'tone-critical',
  toneInfo: 'tone-info',

  radiusPill: 'radius-pill',
  radiusChip: 'radius-chip',
  radiusRow: 'radius-row',
  radiusCard: 'radius-card',
  radiusSheet: 'radius-sheet',

  space1: 'space-1',
  space2: 'space-2',
  space3: 'space-3',
  space4: 'space-4',
  space5: 'space-5',
  space6: 'space-6',
  space8: 'space-8',
  gutter: 'gutter',

  textMicro: 'text-micro',
  textMeta: 'text-meta',
  textBodySm: 'text-body-sm',
  textBody: 'text-body',
  textLead: 'text-lead',
  textTitle: 'text-title',
  textDisplay: 'text-display',

  leadingTight: 'leading-tight',
  leadingSnug: 'leading-snug',
  leadingLoose: 'leading-loose',

  trackingDisplay: 'tracking-display',
  trackingTitle: 'tracking-title',
  trackingEyebrow: 'tracking-eyebrow',

  weightBody: 'weight-body',
  weightStrong: 'weight-strong',
  weightDisplay: 'weight-display',
}

/**
 * `--weight-display` is the one deliberate divergence: the token says 900 and
 * the card renders 700, because that is the heaviest weight Space Grotesk has
 * and Satori will not synthesise one. Recorded here so the sync test can assert
 * the exception rather than skip the key — an untested exception is how the next
 * divergence gets added without anyone noticing.
 */
export const TOKEN_EXCEPTIONS: Partial<Record<keyof SharePalette, { token: number | string; reason: string }>> = {
  weightDisplay: {
    token: 900,
    reason: 'Space Grotesk has no weight above 700 and Satori does not synthesise one.',
  },
}

/** The three tint strengths from DESIGN.md. There are three, and adding a
 *  fourth is the failure mode the token set exists to prevent. */
export const TINT = { fill: 0.12, line: 0.35, glow: 0.45 } as const

/**
 * A tone at one of the three tint strengths — the card's `color-mix()`.
 *
 * `color-mix(in srgb, <c> N%, transparent)` is a straight alpha multiply, so
 * this is the same result the browser computes for `--accent-fill` and friends,
 * expressed as an rgba string Satori accepts.
 */
export function mix(hex: string, strength: keyof typeof TINT): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${TINT[strength]})`
}

/** The accent gradient (`--fill-accent`), as a Satori-safe CSS string. */
export const FILL_ACCENT = `linear-gradient(180deg, ${SHARE_PALETTE.accentBright} 0%, ${SHARE_PALETTE.accent} 52%, ${SHARE_PALETTE.accentDeep} 100%)`
