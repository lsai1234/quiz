import { readFileSync } from 'fs'

/**
 * The text colours have to be readable.
 *
 * `--color-muted` shipped at #71717a, which measures 4.12:1 against the page
 * background — under WCAG AA's 4.5:1 for normal text, and the hub used it at
 * 10 and 11px, which is the worst possible place to be under it. It's a real
 * defect rather than a pedantic one: the quietest tier of copy in the app is
 * where prices, dates and "you won't be charged" notes live.
 *
 * Reading the values out of globals.css rather than restating them here is the
 * point — a test with its own copy of the palette passes forever while the
 * stylesheet drifts.
 */

const CSS = readFileSync('src/app/globals.css', 'utf8')

function token(name: string): string {
  const match = CSS.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`--color-${name} not found in globals.css`)
  return match[1]
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('the text palette', () => {
  const bg = token('bg')

  it.each([
    ['text', 4.5],
    ['text-2', 4.5],
    ['muted', 4.5],
  ])('%s clears AA against the page background', (name, minimum) => {
    expect(contrast(token(name), bg)).toBeGreaterThanOrEqual(minimum)
  })

  it('keeps the accent readable where it carries words, not just decoration', () => {
    // Prices, CTA labels on tinted grounds, and every eyebrow use it as text.
    expect(contrast(token('accent'), bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the tiers visibly distinct, so the hierarchy still reads', () => {
    // Lifting `muted` for contrast is only safe while it stays quieter than the
    // tier above it; collapse the two and every screen flattens out.
    expect(luminance(token('text-2'))).toBeGreaterThan(luminance(token('muted')))
    expect(luminance(token('text'))).toBeGreaterThan(luminance(token('text-2')))
  })
})
