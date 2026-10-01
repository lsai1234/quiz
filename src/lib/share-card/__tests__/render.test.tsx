/**
 * @jest-environment node
 */
import { writeFileSync, mkdirSync } from 'fs'
import { ImageResponse } from 'next/og'
import { ShareCard } from '@/components/share-card/ShareCard'
import { buildShareCardView, FORMATS, type CompetitionBand, type ShareFormat } from '../format'
import { loadShareCardFonts } from '../fonts'
import { archetypePersonas, sharePersonas } from '../personas'
import type { ShareCardPayload } from '../types'
import { GIVEAWAY_SAFE_BOTTOM, GIVEAWAY_SAFE_TOP } from '@/components/share-card/GiveawayCard'
import {
  decodePng, brightPixels, luminance, patchDeviation, patchMean, solidPngDataUri, worstTypeGround, type Decoded,
} from './png'
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
 * Without a band the entry format falls back to the plain story poster, which
 * is a real path — the draw has closed — but it is not the one worth looking at.
 */
const BAND: CompetitionBand = {
  prize: 'Win £200 of supplements',
  mechanic: 'Share this to your story',
  closes: 'Closes 30 Nov',
  terms: 'Full T&Cs at getchrgd.co.uk',
  test: false,
  handle: '@getchrgd_',
  route: 'Quiz link in our bio',
  steps: ['Follow @getchrgd_', 'Take the quiz', 'Share it to your story tagging us'],
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

    // The giveaway card has no picture and no scrim, and safe zones of its
    // own — it is checked on its own terms below.
    if (format === 'entry') return

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

  /** A bright frame, which is the case the scrim has to survive. Real
   *  photography is rarely this even, and never darker than its own average. */
  const BRIGHT: [number, number, number] = [205, 205, 210]

  /** Where the picture still belongs to the picture: right of the type side's
   *  grade, above the block, below the header rail's own scrim. */
  const WINDOW = { x: 700, y: 330, w: 260, h: 200 }

  it.each(ART_KEYS)('draws the upload rather than the field — %s', async (key) => {
    const view = buildShareCardView({ ...persona.payload, artKey: key }, 'story')
    const res = new ImageResponse(
      <ShareCard view={view} art={solidPngDataUri(108, 121, BRIGHT)} />,
      { width: 1080, height: 1920, fonts: await loadShareCardFonts() },
    )
    expect(res.status).toBe(200)

    const image = decodePng(Buffer.from(await res.arrayBuffer()))
    // The gradient fields all measure under 50 here, a bright upload about
    // 157: the picture keeps three quarters of itself on this side of the
    // frame. Sampled here rather than on the left because the type side is
    // graded on purpose now, and a patch there would measure the scrim.
    expect(patchMean(image, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h)).toBeGreaterThan(100)

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
    expect(patchMean(image, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h)).toBeLessThan(60)
  })

  /**
   * The card has to be readable over a photograph nobody has art-directed.
   *
   * This is the regression the scrim was rebuilt for. Its stops were cut
   * against the gradient stand-ins, which are near-black by construction and
   * carry their own fade to the ink; over an uploaded frame the band the
   * headline sits in was passing about 98% of the picture, which put near-white
   * type on a ground of 198 — a contrast ratio of 1.6:1. The stamp and the
   * second headline line were simply not there.
   *
   * Asserted as "wherever there is type, what is behind it is dark", found from
   * the raster rather than from named coordinates, so it holds as the block
   * grows and shrinks with its contents. 110 is the ground at which the card's
   * near-white ink still clears 5:1; both story frames measure under 80.
   */
  it.each(['story'] as ShareFormat[])('keeps type on a dark ground — %s', async (format) => {
    const view = buildShareCardView(persona.payload, format)
    const res = new ImageResponse(
      <ShareCard view={view} art={solidPngDataUri(108, 121, BRIGHT)} />,
      { width: 1080, height: 1920, fonts: await loadShareCardFonts() },
    )
    const image = decodePng(Buffer.from(await res.arrayBuffer()))

    // Instagram's safe band, which is where all of the type is.
    const worst = worstTypeGround(image, 250, 1620)
    expect(worst.ground).toBeGreaterThan(0) // the walk found type at all
    expect(worst.ground).toBeLessThan(110)

    // And the seam closes. The last product row sits a few pixels above where
    // the picture ends, so a picture still visible there is a picture behind
    // the type — and the hard edge it left was visible as a line.
    expect(patchMean(image, 0, 1180, 1080, 24)).toBeLessThan(40)
  })
})

/**
 * The giveaway card, for every archetype the quiz hands out.
 *
 * Built from `archetypePersonas()` — the consult's own engine and identity
 * rules, one card per top goal — plus the stress cases: the longest name and
 * archetype the poster suite has, a two-product stack, no identity at all, and
 * supplier-length product names that have to shrink rather than run off.
 */
describe('the giveaway card', () => {
  const LONG_NAMES: ShareCardPayload = {
    ...sharePersonas().find((p) => p.id === 'long-everything')!.payload,
    lineup: [
      'Applied Nutrition Critical Whey Protein Isolate',
      'Creatine Monohydrate Micronised Unflavoured',
      'Magnesium Bisglycinate Chelate Night Formula',
      'Omega-3 Triple Strength',
      'Vitamin D3 + K2',
      'Never shown — the sixth product',
    ].map((product) => ({ slot: 'Slot', product, reason: '', dose: '30 G / DAY' })),
  }

  const cards: Array<[string, ShareCardPayload]> = [
    ...archetypePersonas().map((p) => [p.id, p.payload] as [string, ShareCardPayload]),
    ...sharePersonas()
      .filter((p) => ['long-everything', 'essentials', 'no-identity'].includes(p.id))
      .map((p) => [`stress-${p.id}`, p.payload] as [string, ShareCardPayload]),
    ['stress-long-product-names', LONG_NAMES],
  ]

  /**
   * Brightest pixel in a region. The ground, its blooms and the grain measure
   * under 30 everywhere; the faintest thing drawn on the card — the panel's
   * hairline — measures over 40.
   */
  function brightest(image: Decoded, x0: number, y0: number, x1: number, y1: number): number {
    let max = 0
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        max = Math.max(max, luminance(image.data, (y * image.width + x) * 4))
      }
    }
    return max
  }
  const INK = 40

  async function render(payload: ShareCardPayload, art?: string) {
    const view = buildShareCardView(payload, 'entry', BAND)
    const res = new ImageResponse(<ShareCard view={view} art={art} />, {
      width: 1080, height: 1920, fonts: await loadShareCardFonts(),
    })
    expect(res.status).toBe(200)
    return Buffer.from(await res.arrayBuffer())
  }

  it.each(cards)('%s', async (id, payload) => {
    const png = await render(payload)
    if (OUT) {
      mkdirSync(OUT, { recursive: true })
      writeFileSync(`${OUT}/giveaway-${id}.png`, png)
    }
    const image = decodePng(png)

    // Nothing at all in either safe zone — not type, not a rule, not a mark.
    expect(brightest(image, 0, 0, 1080, GIVEAWAY_SAFE_TOP)).toBeLessThan(INK)
    expect(brightest(image, 0, GIVEAWAY_SAFE_BOTTOM, 1080, 1920)).toBeLessThan(INK)

    // And the column really does run edge to edge of the space between them:
    // the logo starts within 30px of the top line, the small print ends
    // within 30px of the bottom one.
    expect(brightest(image, 0, GIVEAWAY_SAFE_TOP, 1080, GIVEAWAY_SAFE_TOP + 30)).toBeGreaterThan(120)
    expect(brightest(image, 0, GIVEAWAY_SAFE_BOTTOM - 30, 1080, GIVEAWAY_SAFE_BOTTOM)).toBeGreaterThan(100)

    // Nothing runs off the sides. Satori does not wrap a `nowrap` line and
    // does not complain about one it has overflowed, so a name too long for
    // its row shows up here or nowhere.
    expect(brightest(image, 0, GIVEAWAY_SAFE_TOP, 60, GIVEAWAY_SAFE_BOTTOM)).toBeLessThan(INK)
    expect(brightest(image, 1020, GIVEAWAY_SAFE_TOP, 1080, GIVEAWAY_SAFE_BOTTOM)).toBeLessThan(INK)
  })

  it('draws no photograph, even when the route hands it one', async () => {
    // The routes resolve art for every format. The giveaway card is type on
    // the brand ground, so a bright upload must not reach the safe zones.
    const image = decodePng(await render(cards[0][1], solidPngDataUri(108, 121, [205, 205, 210])))
    expect(brightest(image, 0, 0, 1080, GIVEAWAY_SAFE_TOP)).toBeLessThan(INK)
  })
})
