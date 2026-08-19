import {
  listArtUploads, readArtUpload, putArtUpload, deleteArtUpload, artSetVersion,
} from '../share-card-art'
import { resolveCardArt } from '@/lib/share-card/art-resolve'
import { ART_KEYS } from '@/lib/share-card/art'

/**
 * The uploaded category photography.
 *
 * Six rows of settings, so most of this is unremarkable. Two things are not, and
 * they are what the assertions are about: the version has to be derived from the
 * bytes rather than from a clock, because it is what invalidates every cached
 * card carrying that image — and the renderer's resolution order has to fall all
 * the way through to the gradient field rather than to a broken image slot.
 */

/** A 1×1 GIF is plenty: nothing here decodes the bytes. */
const PIXEL = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const OTHER = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

function upload(key: string, data = PIXEL) {
  return putArtUpload({ key, mime: 'image/jpeg', data, width: 1080, height: 1440 })
}

afterEach(async () => {
  for (const key of ART_KEYS) await deleteArtUpload(key)
})

describe('putArtUpload', () => {
  it('stores an image against a key and reads it back whole', async () => {
    await upload('strength')
    const back = await readArtUpload('strength')
    expect(back?.data).toBe(PIXEL)
    expect(back?.mime).toBe('image/jpeg')
    expect(back?.width).toBe(1080)
    expect(back?.height).toBe(1440)
  })

  it('versions by content, so re-uploading the same file changes nothing', async () => {
    const first = await upload('energy')
    const again = await upload('energy')
    expect(again?.version).toBe(first?.version)
  })

  it('changes the version when the image changes', async () => {
    const first = await upload('energy')
    const replaced = await upload('energy', OTHER)
    expect(replaced?.version).not.toBe(first?.version)
  })

  it('replaces rather than accumulating', async () => {
    await upload('recovery')
    await upload('recovery', OTHER)
    const rows = await listArtUploads()
    expect(Object.keys(rows)).toEqual(['recovery'])
    expect((await readArtUpload('recovery'))?.data).toBe(OTHER)
  })

  it('refuses a key that is not one of the six', async () => {
    expect(await upload('barbells')).toBeNull()
    expect(await listArtUploads()).toEqual({})
  })
})

describe('listArtUploads', () => {
  it('does not carry the bytes', async () => {
    // The settings screen polls this for six slots. Shipping the base64 with it
    // would be megabytes to draw a status line.
    await upload('hydration')
    const rows = await listArtUploads()
    expect(rows.hydration).toBeDefined()
    expect(rows.hydration).not.toHaveProperty('data', PIXEL)
  })
})

describe('artSetVersion', () => {
  it('is empty while everything is a stand-in', async () => {
    expect(await artSetVersion()).toBe('')
  })

  it('moves when any one image is replaced', async () => {
    await upload('wellbeing')
    const before = await artSetVersion()
    await upload('wellbeing', OTHER)
    expect(await artSetVersion()).not.toBe(before)
  })
})

describe('resolveCardArt', () => {
  it('prefers the uploaded photograph over the product render', async () => {
    /**
     * This assertion used to run the other way — "prefers a real catalogue
     * picture over everything" — and that is the bug the settings screen was
     * built into. `payload.ts` sets `heroImage` from the first product in the
     * stack, so every real stack carries one; with the hero winning, an uploaded
     * photograph could only ever appear on a card whose lineup was empty. A
     * founder could upload all six, see them stored, and never see one on a card.
     *
     * The brief is unambiguous about the order: the render from `public/hero/`
     * is the placeholder the art set exists to replace — "the card is about a
     * stack, not a product, so a single bottle under a headline about six
     * supplements is the wrong picture".
     */
    await upload('strength')
    expect(await resolveCardArt('strength', 'https://cdn.example/hero.jpg'))
      .toBe(`data:image/jpeg;base64,${PIXEL}`)
  })

  it('still uses the product render when nothing has been uploaded', async () => {
    // The rung below the art set, not above it — and with no bundled files yet,
    // it is what a card falls back to today.
    expect(await resolveCardArt('performance', 'https://cdn.example/hero.jpg'))
      .toBe('https://cdn.example/hero.jpg')
  })

  it('drops an upload back to the product render when it is removed', async () => {
    await upload('strength')
    await deleteArtUpload('strength')
    expect(await resolveCardArt('strength', 'https://cdn.example/hero.jpg'))
      .toBe('https://cdn.example/hero.jpg')
  })

  it('inlines the upload as a data URI, because the renderer must not fetch', async () => {
    await upload('strength')
    expect(await resolveCardArt('strength')).toBe(`data:image/jpeg;base64,${PIXEL}`)
  })

  it('falls through to nothing, which is the gradient field', async () => {
    // Not a stand-in file: a card that renders a designed absence beats one that
    // renders a broken image slot.
    expect(await resolveCardArt('performance')).toBeNull()
  })

  it('does not leak one category into another', async () => {
    await upload('strength')
    expect(await resolveCardArt('hydration')).toBeNull()
  })
})

describe('deleteArtUpload', () => {
  it('resets a slot back to the stand-in, and says nothing when there is none', async () => {
    await upload('performance')
    await deleteArtUpload('performance')
    expect(await readArtUpload('performance')).toBeNull()
    await expect(deleteArtUpload('performance')).resolves.toBeUndefined()
  })
})
