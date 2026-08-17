/**
 * @jest-environment node
 */
import { writeFileSync, mkdirSync } from 'fs'
import { ImageResponse } from 'next/og'
import { ShareCard } from '@/components/share-card/ShareCard'
import { buildShareCardView, FORMATS, type CompetitionBand, type ShareFormat } from '../format'
import { loadShareCardFonts } from '../fonts'
import { sharePersonas } from '../personas'
import { decodePng, brightPixels, patchDeviation, patchMean, solidPngDataUri } from './png'
import { ART_KEYS } from '../art'

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

/**
 * A live campaign, so the entry card renders what it is for.
 *
 * Without a band the entry format falls back to the plain poster, which is a
 * real path — the draw has closed — but it is not the one worth looking at, and
 * a preview run that never drew the prize block let a missing prize block go
 * unnoticed for a whole review.
 */
const BAND: CompetitionBand = {
  prize: 'Win £200 of supplements',
  mechanic: 'Share this to your story',
  closes: 'Closes 30 Nov',
  terms: 'Full T&Cs at getchrgd.co.uk',
  test: false,
  handle: '@getchrgd',
  route: 'Quiz link in our bio',
  steps: ['Follow @getchrgd', 'Share this to your story', 'Tag us to be counted'],
}

describe('the card rasterises', () => {
  it.each(cases)('%s / %s', async (id, format, persona) => {
    const spec = FORMATS[format]
    const res = new ImageResponse(
      <ShareCard view={buildShareCardView(persona.payload, format, format === 'entry' ? BAND : null)} />,
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

    // ── The acceptance checks that live in the raster ────────────────────
    const image = decodePng(png)

    // Grain, in the exported PNG rather than only in a browser. A flat corner
    // of the ground is picked deliberately: with no grain its deviation is
    // zero, and 3 is what the tile at 7% overlay actually measures.
    expect(patchDeviation(image, 40, image.height - 120, 64)).toBeGreaterThan(1.2)

    // The scrim. The top of the picture has to be darker than its middle, or
    // the header rail is sitting on whatever the photograph happened to do.
    expect(patchMean(image, 0, 0, image.width, 56))
      .toBeLessThan(patchMean(image, 0, Math.round(image.height * 0.16), image.width, 56))

    // No type under Instagram's chrome. The previous card's footer lived under
    // the reply bar for its whole time on master and nothing said so, which is
    // why this is a pixel assertion and not a review note.
    //
    // Only meaningful on the story frames, and only while the art is the
    // gradient stand-in — the brief lets imagery bleed under both bands, so a
    // bright uploaded photograph is allowed to light these rows up. Type is
    // near-white at 246; nothing else on the card comes close to 180.
    if (spec.height === 1920) {
      expect(brightPixels(image, 0, 250, 180)).toBe(0)
      expect(brightPixels(image, 1620, 1920, 180)).toBe(0)
    }
  })
})

/**
 * The other half of the picture: what happens once photography is uploaded.
 *
 * `resolveCardArt` hands the renderer a data URI and the card draws it instead
 * of the gradient field. Worth its own test because the two paths are different
 * elements — an `<img>` against a stack of gradient divs — and only one of them
 * was exercised by everything above.
 */
describe('with uploaded art', () => {
  const [persona] = PERSONAS

  it.each(ART_KEYS)('draws the upload rather than the field — %s', async (key) => {
    const view = buildShareCardView({ ...persona.payload, artKey: key }, 'story')
    const res = new ImageResponse(
      // Mid grey: bright enough to be unmistakable against a card whose art is
      // near-black either way, and dark enough that the scrim still reads.
      <ShareCard view={view} art={solidPngDataUri(108, 144, [128, 128, 128])} />,
      { width: 1080, height: 1920, fonts: await loadShareCardFonts() },
    )
    expect(res.status).toBe(200)

    const image = decodePng(Buffer.from(await res.arrayBuffer()))
    // The middle of the art window, where nothing else is drawn. The gradient
    // fields all sit under 60 here; the upload puts it near 128 before the
    // scrim's transparent midsection.
    expect(patchMean(image, 120, 560, 200, 200)).toBeGreaterThan(90)

    // And the picture still stops where the card says it does. Sampled below
    // the safe line, where nothing but ground and grain is ever drawn — a patch
    // over the spec table measures the type, not the photograph.
    expect(patchMean(image, 400, 1700, 200, 120)).toBeLessThan(20)
  })

  it('falls back to the field when nothing is uploaded', async () => {
    const view = buildShareCardView(persona.payload, 'story')
    const res = new ImageResponse(<ShareCard view={view} art={null} />, {
      width: 1080, height: 1920, fonts: await loadShareCardFonts(),
    })
    const image = decodePng(Buffer.from(await res.arrayBuffer()))
    expect(patchMean(image, 120, 560, 200, 200)).toBeLessThan(90)
  })
})
