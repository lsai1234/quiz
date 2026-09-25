import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * The consult's token set has to stay readable, and has to stay the only place
 * design values live (builds S1 and S3).
 *
 * Read from `consult.css` itself rather than a copy of the numbers — a test
 * carrying its own palette passes forever while the stylesheet drifts.
 */

const CSS = readFileSync('src/app/consult.css', 'utf8')

function decl(name: string): string {
  const match = CSS.match(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, 'm'))
  if (!match) throw new Error(`--${name} not found in consult.css`)
  return match[1].trim()
}

type RGB = [number, number, number]

function hex(name: string): RGB {
  const value = decl(name)
  const m = value.match(/^#([0-9a-fA-F]{6})$/)
  if (!m) throw new Error(`--${name} is not a hex colour: ${value}`)
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as RGB
}

function rgba(name: string): [RGB, number] {
  const m = decl(name).match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/)
  if (!m) throw new Error(`--${name} is not an rgba(): ${decl(name)}`)
  return [[+m[1], +m[2], +m[3]], +m[4]]
}

function over([top, alpha]: [RGB, number], base: RGB): RGB {
  return top.map((c, i) => Math.round(c * alpha + base[i] * (1 - alpha))) as RGB
}

function luminance(rgb: RGB): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const ground = hex('amp-ground')
const glass = over(rgba('amp-glass'), ground)
const raised = over(rgba('amp-glass-raised'), glass)
/** Every plane text sits on: the ground, a glass panel, a card raised on it. */
const PLANES: [string, RGB][] = [
  ['ground', ground],
  ['glass', glass],
  ['raised glass', raised],
  ['solid glass', hex('amp-glass-solid')],
]

describe('the consult palette', () => {
  it('matches the build plan swatches', () => {
    expect(decl('amp-ground')).toBe('#05090b')
    expect(decl('amp-volt')).toBe('#3fdcff')
    expect(decl('amp-calm')).toBe('#a6f0ff')
    expect(decl('amp-ink')).toBe('#e7f3f6')
    expect(decl('amp-sun')).toBe('#ffc45a')
    expect(decl('amp-caution')).toBe('#ffb547')
    expect(decl('amp-go')).toBe('#5fd68f')
    expect(rgba('amp-glass')[1]).toBeCloseTo(0.62)
    expect(decl('amp-glass-blur')).toBe('14px')
  })

  describe.each(PLANES)('on %s', (_plane, surface) => {
    it.each(['amp-ink', 'amp-ink-2', 'amp-ink-3'])('%s clears AA', (ink) => {
      expect(contrast(hex(ink), surface)).toBeGreaterThanOrEqual(4.5)
    })

    it.each(['amp-volt', 'amp-calm', 'amp-sun', 'amp-caution', 'amp-go'])(
      '%s clears AA, so it can carry a label as well as a fill',
      (tone) => {
        expect(contrast(hex(tone), surface)).toBeGreaterThanOrEqual(4.5)
      },
    )
  })

  it.each(['amp-volt', 'amp-calm', 'amp-go', 'amp-sun'])(
    'keeps text on a %s fill readable',
    (fill) => {
      expect(contrast(hex('amp-ink-on-accent'), hex(fill))).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('keeps the three ink tiers distinct, so the hierarchy still reads', () => {
    expect(luminance(hex('amp-ink'))).toBeGreaterThan(luminance(hex('amp-ink-2')))
    expect(luminance(hex('amp-ink-2'))).toBeGreaterThan(luminance(hex('amp-ink-3')))
  })

  it('uses three tint strengths and no fourth', () => {
    const alphas = new Set(
      [...CSS.matchAll(/--amp-[a-z]+-(fill|line|glow):\s*rgba\([^)]*,\s*([\d.]+)\)/g)].map((m) => `${m[1]}:${m[2]}`),
    )
    expect([...alphas].sort()).toEqual(['fill:0.12', 'glow:0.45', 'line:0.35'])
  })

  it('softens the accent role in the circuit check', () => {
    const calm = CSS.match(/\.amp-consult\[data-mode='calm'\]\s*\{([^}]*)\}/)
    expect(calm?.[1]).toMatch(/--amp-accent:\s*var\(--amp-calm\)/)
  })

  it('lifts every target to at least 64px in comfort mode', () => {
    const comfort = CSS.match(/\.amp-consult\[data-comfort='true'\]\s*\{([^}]*)\}/)
    expect(comfort?.[1]).toMatch(/--amp-target:\s*64px/)
  })
})

/* ── The consult components consume tokens and nothing else ────────────────── */

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__') out.push(...walk(path))
    } else if (/\.tsx?$/.test(entry)) {
      out.push(path)
    }
  }
  return out
}

/** Comment blocks are prose about the values and cite them constantly. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const FILES = walk('src/components/consult')

describe('the consult components', () => {
  it('exist, so the assertions below mean something', () => {
    expect(FILES.length).toBeGreaterThan(0)
  })

  it.each(FILES)('%s declares no colour of its own', (file) => {
    const source = code(readFileSync(file, 'utf8'))
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(source).not.toMatch(/\brgba?\(/)
    expect(source).not.toMatch(/\b(?:hsl|oklch|color-mix)\(/)
  })

  it.each(FILES)('%s takes its timing from the motion presets', (file) => {
    const source = code(readFileSync(file, 'utf8'))
    expect(source).not.toMatch(/cubic-bezier\(/)
    // A duration is a number, `ms` or `s`, then the end of the value. Keyed on
    // what follows so an SVG path's `s` command (`20s-7`) is not mistaken for one.
    expect(source).not.toMatch(/(?<![\w.])\d+(?:\.\d+)?m?s(?=[\s'"`,;)])/)
    expect(source).not.toMatch(/\bduration-\d/)
    expect(source).not.toMatch(/\bease-(?:linear|in|out|in-out)\b/)
  })

  it.each(FILES)('%s uses no Tailwind colour, type or radius utility', (file) => {
    const source = code(readFileSync(file, 'utf8')).replace(/var\(--[a-z0-9-]+\)/g, 'TOKEN')
    const banned: [RegExp, string][] = [
      [/\bbg-(?:white|black|gray|slate|zinc|neutral|cyan|sky|blue|red|green|amber|yellow)\b/, 'background colour utility'],
      [/\btext-(?:white|black|gray|slate|zinc|cyan|sky|red|green|amber|xs|sm|base|lg|xl|\dxl)\b/, 'text utility'],
      [/\brounded(?:-(?:sm|md|lg|xl|\dxl|full))?\b(?!-)/, 'radius utility'],
      [/\bshadow-(?:sm|md|lg|xl|\dxl)\b/, 'shadow utility'],
    ]
    for (const [pattern, what] of banned) {
      expect({ file, what, matched: pattern.exec(source)?.[0] ?? null }).toEqual({ file, what, matched: null })
    }
  })
})
