import { readFileSync } from 'fs'
import { SHARE_PALETTE, TOKEN_SOURCE, TOKEN_EXCEPTIONS, mix, FILL_ACCENT, px, CARD_SCALE } from '../palette'

/**
 * The card's palette has to stay the app's palette.
 *
 * `palette.ts` exists because Satori resolves no custom properties — the share
 * card is the one renderer in the codebase that cannot read `tokens.css`. That
 * makes it the one place where the design system can drift without anything
 * going red: move `--accent`, and every screen follows while the card keeps
 * shipping last season's cyan to Instagram. Nobody notices, because nobody
 * A/B-compares a story against a webpage.
 *
 * So this walks `TOKEN_SOURCE` and asserts each literal still equals the token
 * it was copied from, reading the stylesheet rather than a second copy of the
 * numbers — a test carrying its own palette passes forever while the source
 * drifts, which is the failure it is here to prevent.
 */

const CSS = readFileSync('src/app/tokens.css', 'utf8')

function decl(name: string): string {
  const match = CSS.match(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, 'm'))
  if (!match) throw new Error(`--${name} not found in tokens.css`)
  return match[1].trim()
}

/** A token value in the same shape as the literal it is compared against. */
function normalise(value: string, against: string | number): string | number {
  if (typeof against !== 'number') return value
  const numeric = value.match(/^(-?[\d.]+)(px|em)?$/)
  if (!numeric) throw new Error(`expected a number-like token, got "${value}"`)
  return parseFloat(numeric[1])
}

describe('share card palette', () => {
  const keys = Object.keys(TOKEN_SOURCE) as Array<keyof typeof SHARE_PALETTE>

  it('covers every value in the palette', () => {
    expect(keys.sort()).toEqual(Object.keys(SHARE_PALETTE).sort())
  })

  it.each(keys)('%s matches its token', (key) => {
    const expected = TOKEN_EXCEPTIONS[key]
      ? TOKEN_EXCEPTIONS[key]!.token
      : normalise(decl(TOKEN_SOURCE[key]), SHARE_PALETTE[key])

    if (TOKEN_EXCEPTIONS[key]) {
      // A documented divergence: assert the token still says what the exception
      // claims it says, and that the palette still differs from it. If they ever
      // converge the exception is stale and should be deleted.
      expect(normalise(decl(TOKEN_SOURCE[key]), expected)).toEqual(expected)
      expect(SHARE_PALETTE[key]).not.toEqual(expected)
      return
    }

    expect(SHARE_PALETTE[key]).toEqual(expected)
  })

  it('every exception names a real palette key', () => {
    for (const key of Object.keys(TOKEN_EXCEPTIONS)) {
      expect(SHARE_PALETTE).toHaveProperty(key)
      expect(TOKEN_EXCEPTIONS[key as keyof typeof SHARE_PALETTE]!.reason.length).toBeGreaterThan(20)
    }
  })

  it('holds the specular invariant', () => {
    // DESIGN.md's one load-bearing rule: the highlight finishes exactly where
    // the text begins. It travels to the card intact or the card's small copy
    // sits inside the brightest band on the surface.
    expect(SHARE_PALETTE.specularDepth).toBe(SHARE_PALETTE.space3)
  })

  it('keeps the ground under its cap', () => {
    // The brightest point the ground reaches is the two overlapping blooms; the
    // ink tiers are solved against that number.
    expect(SHARE_PALETTE.bloom1Alpha + SHARE_PALETTE.bloom2Alpha).toBeLessThanOrEqual(0.17)
  })

  it('mixes tints at the three system strengths', () => {
    expect(mix(SHARE_PALETTE.accent, 'fill')).toBe('rgba(0, 212, 255, 0.12)')
    expect(mix(SHARE_PALETTE.accent, 'line')).toBe('rgba(0, 212, 255, 0.35)')
    expect(mix(SHARE_PALETTE.tonePositive, 'glow')).toBe('rgba(61, 220, 151, 0.45)')
  })

  it('builds the accent fill from the same three stops as the token', () => {
    const token = decl('fill-accent')
    for (const stop of ['accent-bright', 'accent', 'accent-deep'] as const) {
      expect(token).toContain(`var(--${stop})`)
    }
    expect(FILL_ACCENT).toContain(SHARE_PALETTE.accentBright)
    expect(FILL_ACCENT).toContain(SHARE_PALETTE.accentDeep)
  })

  it('scales app pixels to card pixels', () => {
    // 1080px of card over a 360px phone viewport. If this stops being 3 the card
    // stops looking like the app at the size people actually see it.
    expect(CARD_SCALE).toBe(3)
    expect(px(SHARE_PALETTE.space4)).toBe(48)
  })
})
