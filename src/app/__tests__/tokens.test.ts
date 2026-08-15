import { readFileSync } from 'fs'

/**
 * The token set has to stay readable on glass.
 *
 * `contrast.test.ts` checks the text palette against the flat page background,
 * which is the right check for a flat page. Glass moves the ground twice: a
 * gradient mesh lightens the page, and a translucent panel lightens it again.
 * `--color-muted` clears AA on the flat background at 4.88:1 and fails against
 * every translucent panel — 4.10:1 at 3% white, 3.45:1 at 9% — and it is the
 * app's largest tier of copy, set at 10 and 11px.
 *
 * That failure is silent: the flat-background test stays green the whole time.
 * So these assertions composite the way the browser will, and they run against
 * the token file rather than a copy of the numbers, because a test carrying its
 * own palette passes forever while the stylesheet drifts.
 *
 * Two caps come out of the maths and are asserted directly, because breaking
 * either one puts the quiet tier back under AA:
 *   - the mesh may not exceed 6%
 *   - a glass surface carrying text may not exceed 8% white
 */

const CSS = readFileSync('src/app/tokens.css', 'utf8')

function decl(name: string): string {
  const match = CSS.match(new RegExp(`--${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`--${name} not found in tokens.css`)
  return match[1].trim()
}

type RGB = [number, number, number]

function hex(name: string): RGB {
  const value = decl(name)
  const match = value.match(/#([0-9a-fA-F]{6})/)
  if (!match) throw new Error(`--${name} is not a hex colour: ${value}`)
  const h = match[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
}

/** The white alpha of a `--surface-*` token. */
function surfaceAlpha(name: string): number {
  const value = decl(name)
  const match = value.match(/rgba\(\s*255,\s*255,\s*255,\s*([\d.]+)\s*\)/)
  if (!match) throw new Error(`--${name} is not an rgba white: ${value}`)
  return Number(match[1])
}

/** The percentage of a `color-mix(in srgb, C N%, transparent)` token. */
function mixPercent(name: string): number {
  const value = decl(name)
  const match = value.match(/color-mix\(in srgb,\s*[^\s]+\s+([\d.]+)%/)
  if (!match) throw new Error(`--${name} is not a color-mix: ${value}`)
  return Number(match[1])
}

/** The colour a `color-mix(in srgb, C N%, transparent)` token tints with. */
function mixColor(name: string): RGB {
  const value = decl(name)
  const match = value.match(/#([0-9a-fA-F]{6})/)
  if (!match) throw new Error(`--${name} does not tint with a hex colour: ${value}`)
  const h = match[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Source-over compositing — `colour` at `alpha` painted on `under`. */
function over(colour: RGB, alpha: number, under: RGB): RGB {
  return under.map((c, i) => alpha * colour[i] + (1 - alpha) * c) as RGB
}

const BASE = hex('ground-base')
const WHITE: RGB = [255, 255, 255]

/**
 * The brightest point of the mesh — where contrast is worst, and so the only
 * point worth testing. Compositing all three blooms would be optimistic; they
 * are positioned not to overlap at full strength.
 */
const BRIGHTEST_GROUND = (() => {
  const tints = ['ground-tint-a', 'ground-tint-b', 'ground-tint-c']
  return tints
    .map((t) => over(mixColor(t), mixPercent(t) / 100, BASE))
    .reduce((brightest, g) => (luminance(g) > luminance(brightest) ? g : brightest))
})()

/** Surfaces that may carry text, deepest last. `--surface-press` is excluded by design. */
const TEXT_SURFACES = ['surface-1', 'surface-2', 'surface-3'] as const

describe('the ground', () => {
  it.each(['ground-tint-a', 'ground-tint-b', 'ground-tint-c'])(
    '%s stays under the 6%% mesh cap',
    (tint) => {
      // Every point of extra mesh raises the floor under the quiet text tier.
      // Past 6% it cannot be lifted far enough without colliding with --ink-2.
      expect(mixPercent(tint)).toBeLessThanOrEqual(6)
    },
  )
})

describe('the elevation scale', () => {
  it.each(TEXT_SURFACES)('%s stays under the 8%% glass cap', (surface) => {
    expect(surfaceAlpha(surface)).toBeLessThanOrEqual(0.08)
  })

  it('gets lighter with height, so the planes stay distinguishable', () => {
    const alphas = TEXT_SURFACES.map(surfaceAlpha)
    expect(alphas).toEqual([...alphas].sort((a, b) => a - b))
    expect(new Set(alphas).size).toBe(alphas.length)
  })

  it('keeps the press state above the surfaces it sits on', () => {
    // It is allowed past the cap precisely because nothing rests there to read.
    expect(surfaceAlpha('surface-press')).toBeGreaterThan(surfaceAlpha('surface-3'))
  })

  it('matches the opaque fallback to the glass it stands in for', () => {
    // Rows in a scrolling list can't afford a backdrop filter, so they use
    // --surface-solid. If it doesn't sit at the same visual weight as the glass
    // beside it, the ban on blurring lists becomes visible.
    const glass = over(WHITE, surfaceAlpha('surface-2'), BRIGHTEST_GROUND)
    const solid = hex('surface-solid')
    expect(Math.abs(luminance(glass) - luminance(solid))).toBeLessThan(0.01)
  })
})

describe('the ink tiers', () => {
  it('keeps the tiers ordered, so the hierarchy still reads', () => {
    expect(luminance(hex('ink-1'))).toBeGreaterThan(luminance(hex('ink-2')))
    expect(luminance(hex('ink-2'))).toBeGreaterThan(luminance(hex('ink-3')))
  })

  const cases = TEXT_SURFACES.flatMap((surface) =>
    (['ink-1', 'ink-2', 'ink-3'] as const).map((ink) => [ink, surface] as const),
  )

  it.each(cases)('%s clears AA on %s over the brightest ground', (ink, surface) => {
    const plane = over(WHITE, surfaceAlpha(surface), BRIGHTEST_GROUND)
    expect(contrast(hex(ink), plane)).toBeGreaterThanOrEqual(4.5)
  })

  it('clears AA on the opaque surfaces too', () => {
    for (const surface of ['surface-solid', 'surface-input'] as const) {
      expect(contrast(hex('ink-3'), hex(surface))).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('the tones', () => {
  const tones = ['accent', 'tone-positive', 'tone-attention', 'tone-critical', 'tone-info'] as const

  it.each(tones)('%s stays readable as text on the deepest glass', (tone) => {
    // These carry words, not just decoration: prices, status labels, amounts.
    const plane = over(WHITE, surfaceAlpha('surface-3'), BRIGHTEST_GROUND)
    expect(contrast(hex(tone), plane)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(tones)('reads a label on a solid %s fill', (tone) => {
    expect(contrast(hex('ink-on-accent'), hex(tone))).toBeGreaterThanOrEqual(4.5)
  })

  it('uses one alpha per intent rather than one per call site', () => {
    // Sixteen different percentages are in use across the hubs today, doing the
    // work of three. Locking them here is what stops a seventeenth appearing.
    for (const role of ['accent', 'positive', 'attention', 'critical', 'info']) {
      expect(mixPercent(`${role}-fill`)).toBe(12)
      expect(mixPercent(`${role}-line`)).toBe(35)
      expect(mixPercent(`${role}-glow`)).toBe(45)
    }
  })
})

describe('the token file', () => {
  it('does not redefine anything globals.css already owns', () => {
    // The whole claim of this pass is that it changes no pixels, which holds
    // only while the two files share no names.
    const globals = readFileSync('src/app/globals.css', 'utf8')
    const names = (source: string) =>
      new Set((source.match(/^\s*(--[a-z0-9-]+):/gim) ?? []).map((d) => d.trim().replace(':', '')))

    const overlap = [...names(CSS)].filter((n) => names(globals).has(n))
    expect(overlap).toEqual([])
  })
})
