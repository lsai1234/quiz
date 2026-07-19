import type { StackSlot } from './types'

/**
 * Visual identity for each stack slot: a monoline glyph (a `QuizIcon` name) and
 * a signature hue. Used to give every product a designed, colour-coded tile even
 * when the catalogue has no photo — so a stack of image-less products still
 * reads as an intentional lineup rather than a column of broken images.
 *
 * The hue is deliberately muted; it drives a soft gradient wash + the glyph
 * colour, sitting on the dark stack surface without competing with the brand
 * cyan used for prices and CTAs.
 */
export interface SlotVisual {
  glyph: string
  hue: string
}

const SLOT_VISUALS: Record<StackSlot, SlotVisual> = {
  protein: { glyph: 'shaker', hue: '#00D4FF' },
  performance: { glyph: 'dumbbell', hue: '#A78BFA' },
  energy: { glyph: 'bolt', hue: '#FBBF24' },
  hydration: { glyph: 'droplet', hue: '#38BDF8' },
  recovery: { glyph: 'refresh', hue: '#34D399' },
  health: { glyph: 'heart', hue: '#FB7185' },
  sleep: { glyph: 'moon', hue: '#818CF8' },
  'vegan-support': { glyph: 'leaf', hue: '#4ADE80' },
  gut: { glyph: 'spiral', hue: '#2DD4BF' },
  menopause: { glyph: 'bloom', hue: '#F472B6' },
}

const FALLBACK_VISUAL: SlotVisual = { glyph: 'hexagon', hue: '#00D4FF' }

/** Glyph + hue for a slot, tolerant of unknown/legacy slot strings. */
export function slotVisual(slot: string | null | undefined): SlotVisual {
  if (!slot) return FALLBACK_VISUAL
  return SLOT_VISUALS[slot as StackSlot] ?? FALLBACK_VISUAL
}
