/**
 * @jest-environment node
 */
import { mkdirSync, writeFileSync } from 'fs'
import { ImageResponse } from 'next/og'
import { StoryShareCard, STORY_H, STORY_SAFE_BOTTOM, STORY_SAFE_TOP, STORY_W } from '@/components/share-card/StoryShareCard'
import { loadShareCardFonts } from '../fonts'
import type { StoryShare } from '../story'
import { brightPixels, decodePng } from './png'

/**
 * Every story card, actually rasterised (plan Phase 8): Satori can lay it out,
 * it draws something, and its type stays inside Instagram's safe band. Set
 * `SHARE_PREVIEW_DIR` to write the PNGs out and look at them.
 */
jest.setTimeout(120_000)

const OUT = process.env.SHARE_PREVIEW_DIR

const CARDS: StoryShare[] = [
  { v: 1, card: 'day', sleep: [23 * 60 + 30, 6 * 60 + 30], cup: { at: 16 * 60 }, train: { days: 3 }, daylight: 0.6, energy: { points: [6, 7, 8, 7, 4, 3, 5, 6, 5, 4] } },
  { v: 1, card: 'day', sleep: null, cup: { count: 3 }, train: { at: 18 * 60 }, daylight: null, energy: { level: 4 } },
  { v: 1, card: 'spotted', pattern: 'wired' },
  { v: 1, card: 'spotted', pattern: 'weekend-warrior' },
  {
    v: 1,
    card: 'dots',
    stars: [
      { a: -1.571, d: 0.4, w: 1, s: 'yes' },
      { a: -0.673, d: 0.62, w: 0.7, s: 'in' },
      { a: 0.224, d: 0.9, w: 0.2, s: 'in' },
      { a: 1.122, d: 1, w: 0, s: 'out' },
      { a: 2.02, d: 0.4, w: 1, s: 'yes' },
      { a: 2.917, d: 0.95, w: 0.1, s: 'in' },
    ],
    named: ['wired', 'crash'],
    narrowing: [7, 5, 2],
  },
  { v: 1, card: 'start', hero: 'Clear Whey', products: ['Sport Multivitamin', 'Sleep & Recovery', 'Magnesium Glycinate', 'Super Greens'] },
  { v: 1, card: 'start', hero: null, products: ['Creatine Monohydrate', 'Electrolytes'] },
]

describe('a shared story card, rasterised', () => {
  it.each(CARDS.map((c, i) => [`${c.card} ${i}`, c] as const))('%s: 1080×1920, drawn, type inside the safe band', async (name, card) => {
    const res = new ImageResponse(<StoryShareCard share={card} />, { width: STORY_W, height: STORY_H, fonts: await loadShareCardFonts() })
    const png = Buffer.from(await res.arrayBuffer())
    if (OUT) {
      mkdirSync(OUT, { recursive: true })
      writeFileSync(`${OUT}/story-${name.replace(' ', '-')}.png`, png)
    }
    const image = decodePng(png)
    expect([image.width, image.height]).toEqual([STORY_W, STORY_H])
    expect(png.length).toBeGreaterThan(40_000)
    // Nothing bright (type) above or below Instagram's controls.
    expect(brightPixels(image, 0, STORY_SAFE_TOP, 180)).toBe(0)
    expect(brightPixels(image, STORY_SAFE_BOTTOM, STORY_H, 180)).toBe(0)
    // And plenty inside it.
    expect(brightPixels(image, STORY_SAFE_TOP, STORY_SAFE_BOTTOM, 180)).toBeGreaterThan(2000)
  })
})
