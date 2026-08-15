import { readFileSync } from 'fs'

/**
 * The token set has to stay readable on glass.
 *
 * `contrast.test.ts` checks the text palette against the flat page background,
 * which is the right check for a flat page. This design is not a flat page: a
 * lit ground raises the floor under everything, a translucent surface raises it
 * again, and a specular highlight raises it a third time. The old `--color-muted`
 * clears AA at 4.88:1 on the flat background and measures 4.10:1 once composited
 * — and it is the app's largest tier of copy, set at 10 and 11px.
 *
 * That failure is silent: the flat-background test stays green throughout. So
 * these assertions composite the way the browser will, and they run against the
 * token file rather than a copy of the numbers, because a test carrying its own
 * palette passes forever while the stylesheet drifts.
 *
 * ── The invariant that lets the design be as strong as it is ────────────────
 * `--specular-depth` equals the tightest card padding. Text therefore begins
 * exactly where the highlight has finished, and the plane that carries words is
 * the plain surface — which is why the blooms can run at 12% and the highlight
 * at 14% without either one being paid for in legibility. Break that equality
 * and the numbers stop meaning anything: at a 56px falloff the critical tone
 * measures 3.65:1 on the deepest plane, and nothing else in the file changes.
 */

const CSS = readFileSync('src/app/tokens.css', 'utf8')

function decl(name: string): string {
  const match = CSS.match(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, 'm'))
  if (!match) throw new Error(`--${name} not found in tokens.css`)
  return match[1].trim()
}

type RGB = [number, number, number]

function hex(name: string): RGB {
  const value = decl(name)
  const match = value.match(/#([0-9a-fA-F]{6})/)
  if (!match) throw new Error(`--${name} is not a hex colour: ${value}`)
  return rgbFromHex(match[1])
}

function rgbFromHex(h: string): RGB {
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
}

/** The white alpha of a `--surface-*` token. */
function surfaceAlpha(name: string): number {
  const value = decl(name)
  const match = value.match(/rgba\(\s*255,\s*255,\s*255,\s*([\d.]+)\s*\)/)
  if (!match) throw new Error(`--${name} is not an rgba white: ${value}`)
  return Number(match[1])
}

function num(name: string): number {
  const value = decl(name)
  const match = value.match(/^([\d.]+)/)
  if (!match) throw new Error(`--${name} is not a number: ${value}`)
  return Number(match[1])
}

/** The percentage of a `color-mix(in srgb, C N%, transparent)` token. */
function mixPercent(name: string): number {
  const value = decl(name)
  const match = value.match(/color-mix\(in srgb,\s*[^\s]+\s+([\d.]+)%/)
  if (!match) throw new Error(`--${name} is not a color-mix: ${value}`)
  return Number(match[1])
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

const WHITE: RGB = [255, 255, 255]

/**
 * The brightest the ground ever gets: the two blooms that overlap, stacked.
 * The third sits at the opposite end of the viewport and cannot reach them.
 */
const BRIGHTEST_GROUND = over(
  hex('bloom-violet'),
  num('bloom-2-alpha'),
  over(hex('bloom-accent'), num('bloom-1-alpha'), hex('ground-base')),
)

/** Surfaces that may carry text, deepest last. `--surface-press` is excluded by design. */
const TEXT_SURFACES = ['surface-1', 'surface-2', 'surface-3'] as const
const INKS = ['ink-1', 'ink-2', 'ink-3'] as const
const TONES = ['accent', 'tone-positive', 'tone-attention', 'tone-critical', 'tone-info'] as const

/** What text actually sits on: the surface, over the worst ground. */
function textPlane(surface: (typeof TEXT_SURFACES)[number]): RGB {
  return over(WHITE, surfaceAlpha(surface), BRIGHTEST_GROUND)
}

describe('the specular invariant', () => {
  it('finishes before the tightest padding begins', () => {
    // The whole contrast budget depends on this. `Card`'s tightest padding is
    // `--space-3`; if the highlight outlasts it, body copy is composited on top
    // of the brightest part of the surface and every number below is optimistic.
    expect(num('specular-depth')).toBeLessThanOrEqual(num('space-3'))
  })

  it('is strong enough that confining it is what saves the quiet tier', () => {
    // Stated as a test so the reason for the rule is not left as a comment. Two
    // things fail together if this one does: a highlight weak enough to be safe
    // as a wash is a highlight too weak to make the surface read as glass, and
    // the band constraint above stops being what earns the strong ground.
    const wash = over(WHITE, num('specular-strength'), textPlane('surface-3'))
    expect(contrast(hex('ink-3'), wash)).toBeLessThan(4.5)
  })
})

describe('the ground', () => {
  it('keeps the two overlapping blooms within the measured budget', () => {
    // Not a taste cap — every point of extra mesh raises the floor under the
    // quiet text tier, and `--ink-3` cannot rise much further before it collides
    // with `--ink-2` and the three-tier hierarchy collapses into two.
    expect(num('bloom-1-alpha')).toBeLessThanOrEqual(0.12)
    expect(num('bloom-2-alpha')).toBeLessThanOrEqual(0.05)
  })

  it('stays a ground rather than becoming a surface', () => {
    expect(luminance(BRIGHTEST_GROUND)).toBeLessThan(luminance(textPlane('surface-1')))
  })
})

describe('the elevation scale', () => {
  it.each(TEXT_SURFACES)('%s stays under the measured glass cap', (surface) => {
    expect(surfaceAlpha(surface)).toBeLessThanOrEqual(0.11)
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

  it('keeps the opaque fallback legible for the rows that must use it', () => {
    // Rows in a scrolling list can't afford a backdrop filter, so they use
    // `--surface-solid`. It cannot match the glass at the ground's brightest
    // point — no single opaque colour can, since the glass tracks the light
    // under it — so what is asserted is the part that matters: it sits between
    // the page and the raised planes, and text on it clears AA comfortably.
    const solid = hex('surface-solid')
    expect(luminance(solid)).toBeGreaterThan(luminance(hex('ground-base')))
    expect(contrast(hex('ink-3'), solid)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('the ink tiers', () => {
  it('keeps the tiers ordered, so the hierarchy still reads', () => {
    expect(luminance(hex('ink-1'))).toBeGreaterThan(luminance(hex('ink-2')))
    expect(luminance(hex('ink-2'))).toBeGreaterThan(luminance(hex('ink-3')))
  })

  const cases = TEXT_SURFACES.flatMap((surface) => INKS.map((ink) => [ink, surface] as const))

  it.each(cases)('%s clears AA on %s over the brightest ground', (ink, surface) => {
    expect(contrast(hex(ink), textPlane(surface))).toBeGreaterThanOrEqual(4.5)
  })

  it('clears AA on the opaque surfaces too', () => {
    for (const surface of ['surface-solid', 'surface-input'] as const) {
      expect(contrast(hex('ink-3'), hex(surface))).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('the tones', () => {
  const cases = TEXT_SURFACES.flatMap((surface) => TONES.map((tone) => [tone, surface] as const))

  it.each(cases)('%s stays readable as text on %s', (tone, surface) => {
    // These carry words, not just decoration: prices, status labels, amounts.
    expect(contrast(hex(tone), textPlane(surface))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(TONES)('reads a label on a solid %s fill', (tone) => {
    expect(contrast(hex('ink-on-accent'), hex(tone))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps both ends of every gradient fill legible, not just the middle', () => {
    // A gradient button is only as readable as its lightest and darkest stop,
    // and the stops are the one part of a fill nothing else measures.
    for (const fill of ['fill-accent', 'fill-positive', 'fill-attention', 'fill-critical', 'fill-info']) {
      const stops = decl(fill).match(/#[0-9a-fA-F]{6}/g) ?? []
      const varStops = decl(fill).match(/var\(--([a-z0-9-]+)\)/g) ?? []
      const colours = [
        ...stops.map((s) => rgbFromHex(s.slice(1))),
        ...varStops.map((v) => hex(v.slice(6, -1))),
      ]
      expect(colours.length).toBeGreaterThan(1)
      for (const colour of colours) {
        expect(contrast(hex('ink-on-accent'), colour)).toBeGreaterThanOrEqual(4.5)
      }
    }
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
    // The hubs still render on the old palette until they are migrated, which
    // holds only while the two files share no names.
    const globals = readFileSync('src/app/globals.css', 'utf8')
    const names = (source: string) =>
      new Set((source.match(/^\s*(--[a-z0-9-]+):/gim) ?? []).map((d) => d.trim().replace(':', '')))

    const overlap = [...names(CSS)].filter((n) => names(globals).has(n))
    expect(overlap).toEqual([])
  })
})
