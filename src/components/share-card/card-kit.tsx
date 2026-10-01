import { FONT_DISPLAY, FONT_MONO } from '@/lib/share-card/fonts'
import { GRAIN_DATA_URI, GRAIN_TILE_PX } from '@/lib/share-card/grain'

/**
 * The pieces both card templates are set from.
 *
 * The story poster and the giveaway card are different compositions in the same
 * two faces, the same ink and the same grain. These are the parts that must not
 * drift between them, so they live once.
 */

export const display = (size: number, weight: 400 | 600 | 800, color: string, tracking = -0.022) => ({
  fontFamily: FONT_DISPLAY,
  fontSize: size,
  fontWeight: weight,
  letterSpacing: `${tracking}em`,
  color,
})

export const mono = (size: number, weight: 400 | 500 | 600, color: string, tracking: number) => ({
  fontFamily: FONT_MONO,
  fontSize: size,
  fontWeight: weight,
  letterSpacing: `${tracking}em`,
  color,
})

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * The width of a line of Big Shoulders, in ems, estimated.
 *
 * Satori has no measuring pass to borrow, and a table accurate to a few percent
 * is enough when the result is clamped anyway. `I`, `1` and the like are half
 * the width of everything else in a condensed face, which is most of the error
 * a flat average would make.
 */
const NARROW = new Set(['I', 'J', 'L', '1', 'İ', '.', ',', ':', ';', "'", '’', '!', '|', ' ', '-'])
const WIDE = new Set(['M', 'W', 'Q', '@', '&'])

export function widthEm(text: string): number {
  let em = 0
  for (const ch of text.toUpperCase()) {
    em += NARROW.has(ch) ? 0.24 : WIDE.has(ch) ? 0.58 : 0.46
  }
  return em
}

/** The bolt, at rail size. */
export function Bolt({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M14 2 L6.5 13.4 H11 L9.5 22 L17.5 10.6 H13 Z" fill={color} />
    </svg>
  )
}

/** Grain, over everything. Last child, since Satori paints in tree order. */
export function Grain({ w, h }: { w: number; h: number }) {
  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        top: 0, left: 0, width: w, height: h,
        backgroundImage: `url(${GRAIN_DATA_URI})`,
        backgroundRepeat: 'repeat',
        backgroundSize: `${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px`,
        opacity: 0.07,
        mixBlendMode: 'overlay',
      }}
    />
  )
}
