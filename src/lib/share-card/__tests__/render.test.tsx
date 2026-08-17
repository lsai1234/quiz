/**
 * @jest-environment node
 */
import { writeFileSync, mkdirSync } from 'fs'
import { ImageResponse } from 'next/og'
import { ShareCard } from '@/components/share-card/ShareCard'
import { buildShareCardView, FORMATS, type ShareFormat } from '../format'
import { loadShareCardFonts } from '../fonts'
import { sharePersonas } from '../personas'

/**
 * Every persona, in every format, actually rasterised.
 *
 * This does not check that the card looks right — no test can, which is what
 * `/styleguide/share` is for. What it checks is that Satori can lay the tree out
 * at all, and that is worth more than it sounds: the renderer fails by producing
 * a wrong PNG rather than by throwing, so the failures it *can* throw on
 * (an unsupported style, an unparseable font, a bad SVG attribute) are the ones
 * that would otherwise reach a customer's story silently.
 *
 * The size floor catches the other silent failure: a card that lays out but
 * draws nothing compresses to a few KB of flat black.
 *
 * Set `SHARE_PREVIEW_DIR` to write the PNGs out and look at them.
 */

jest.setTimeout(120_000)

const OUT = process.env.SHARE_PREVIEW_DIR
const PERSONAS = sharePersonas()
const FORMAT_IDS = Object.keys(FORMATS) as ShareFormat[]

/** A blank or near-blank card compresses far below this. A real one is 200KB+. */
const MIN_BYTES = 40_000

const cases = PERSONAS.flatMap((p) => FORMAT_IDS.map((f) => [p.id, f, p] as const))

describe('the card rasterises', () => {
  it.each(cases)('%s / %s', async (id, format, persona) => {
    const spec = FORMATS[format]
    const res = new ImageResponse(
      <ShareCard view={buildShareCardView(persona.payload, format)} />,
      { width: spec.width, height: spec.height, fonts: await loadShareCardFonts() },
    )

    expect(res.status).toBe(200)
    const png = Buffer.from(await res.arrayBuffer())

    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(png.readUInt32BE(16)).toBe(spec.width)
    expect(png.readUInt32BE(20)).toBe(spec.height)
    expect(png.length).toBeGreaterThan(MIN_BYTES)

    if (OUT) {
      mkdirSync(OUT, { recursive: true })
      writeFileSync(`${OUT}/${id}-${format}.png`, png)
    }
  })
})
