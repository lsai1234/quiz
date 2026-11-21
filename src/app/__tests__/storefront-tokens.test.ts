import { readFileSync } from 'fs'

/**
 * The storefront's token set: on brand, readable, and kept off the hubs.
 *
 * `storefront.css` and `tokens.css` both declare their tokens on `:root`, and
 * the storefront file is imported second. So any name the two share takes the
 * storefront's value EVERYWHERE — which is exactly how a redesign of the shop
 * once moved the Founders Hub's gutter and glow without touching a hub file.
 * The first assertion holds the overlap to the names that are meant to be
 * shared.
 *
 * The rest read the values from the file itself rather than a copy of them, so
 * the test cannot pass while the stylesheet drifts.
 */

const STOREFRONT = readFileSync('src/app/storefront.css', 'utf8')
const HUB_TOKENS = readFileSync('src/app/tokens.css', 'utf8')

/** Every custom property a stylesheet declares on `:root`, in any block. */
function rootNames(css: string): Set<string> {
  const names = new Set<string>()
  const blocks = css.match(/:root\s*\{[^}]*\}/g) ?? []
  for (const block of blocks) {
    for (const m of block.matchAll(/(--[\w-]+)\s*:/g)) names.add(m[1])
  }
  return names
}

function value(name: string): string {
  const match = STOREFRONT.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'))
  if (!match) throw new Error(`${name} not found in storefront.css`)
  return match[1].trim()
}

type RGB = [number, number, number]

function rgb(name: string): RGB {
  const m = value(name).match(/#([0-9a-fA-F]{6})/)
  if (!m) throw new Error(`${name} is not a hex colour: ${value(name)}`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: string, b: string): number {
  const la = luminance(rgb(a))
  const lb = luminance(rgb(b))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('storefront tokens', () => {
  it('shares only --accent and the space scale with the hub tokens', () => {
    const hub = rootNames(HUB_TOKENS)
    const shared = [...rootNames(STOREFRONT)].filter((n) => hub.has(n)).sort()
    const allowed = shared.filter((n) => n === '--accent' || /^--space-\d+$/.test(n))
    expect(shared).toEqual(allowed)
  })

  it('uses the brand cyan exactly', () => {
    expect(value('--accent').toUpperCase()).toBe('#00D4FF')
  })

  it('keeps every text pair it uses at AA', () => {
    const pairs: Array<[string, string]> = [
      ['--text', '--bg'],
      ['--text', '--surface'],
      ['--text-2', '--surface-hi'],
      ['--text-dim', '--bg'],
      ['--text-dim', '--surface'],
      ['--text-dim', '--surface-mid'],
      ['--text-dim', '--surface-hi'],
      ['--accent', '--bg'],
      ['--accent-ink', '--accent'],
      ['--accent-ink', '--accent-hi'],
      ['--accent-ink', '--accent-lo'],
      ['--danger', '--surface'],
    ]
    for (const [fg, bg] of pairs) {
      expect({ pair: `${fg} on ${bg}`, ratio: contrast(fg, bg) >= 4.5 }).toEqual({ pair: `${fg} on ${bg}`, ratio: true })
    }
  })
})
