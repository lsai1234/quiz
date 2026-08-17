import { statSync } from 'fs'
import { join } from 'path'
import { loadShareCardFonts, FONT_DISPLAY, FONT_MONO, SHARE_CARD_FACES } from '../fonts'

/**
 * The vendored faces.
 *
 * Two things go wrong with committed fonts and neither announces itself: someone
 * replaces a file with the WOFF2 that Google serves by default — which Satori
 * cannot parse, so every card 500s — or someone re-downloads an unsubsetted
 * weight and quietly puts 325KB back into the function bundle. Both are caught
 * here rather than in production, where the symptom is an image route failing
 * for reasons that look like anything else.
 */

const DIR = 'src/lib/share-card/fonts'

/** 50KB is a subsetted weight; a full display TTF is 300KB+. Anything between
 *  is a subset that has drifted and worth looking at. */
const MAX_BYTES = 80 * 1024

describe('share card fonts', () => {
  it('loads the display and utility families, at the weights the card sets', async () => {
    const fonts = await loadShareCardFonts()
    expect(fonts.map((f) => `${f.name} ${f.weight}`).sort()).toEqual([
      `${FONT_DISPLAY} 400`,
      `${FONT_DISPLAY} 600`,
      `${FONT_DISPLAY} 800`,
      `${FONT_MONO} 400`,
      `${FONT_MONO} 500`,
      `${FONT_MONO} 600`,
    ])
  })

  it('hands over real TrueType bytes, not WOFF2', async () => {
    for (const font of await loadShareCardFonts()) {
      const magic = Buffer.from(font.data.slice(0, 4))
      // 0x00010000 is a TrueType outline font. 'wOF2' is what fonts.googleapis
      // serves to a modern user agent, and Satori cannot read it.
      expect([...magic]).toEqual([0x00, 0x01, 0x00, 0x00])
      expect(magic.toString('latin1')).not.toBe('wOF2')
    }
  })

  it('hands over exactly the file, not the pool it was read into', async () => {
    // A Node Buffer is a view into a shared, larger ArrayBuffer. Passing the
    // whole pool to Satori hands it whatever else Node allocated alongside.
    const sizes = SHARE_CARD_FACES
      .map((f) => statSync(join(DIR, f.file)).size)
      .sort((a, b) => a - b)
    const loaded = (await loadShareCardFonts()).map((f) => f.data.byteLength).sort((a, b) => a - b)
    expect(loaded).toEqual(sizes)
  })

  it('keeps every face subsetted', () => {
    for (const face of SHARE_CARD_FACES) {
      expect(statSync(join(DIR, face.file)).size).toBeLessThan(MAX_BYTES)
    }
  })

  it('reads each face once', async () => {
    // The cache holds the promise, not the result, so concurrent first requests
    // share one set of reads instead of racing to do the same six.
    const [a, b] = await Promise.all([loadShareCardFonts(), loadShareCardFonts()])
    expect(a[0].data).toBe(b[0].data)
  })
})
