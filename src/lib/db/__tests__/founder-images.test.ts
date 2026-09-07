import {
  listFounderImages,
  readFounderImage,
  putFounderImage,
  deleteFounderImage,
  isFounderImageId,
  bundleImageId,
  founderImageUrl,
} from '../founder-images'

/**
 * Pictures a founder uploads rather than links to.
 *
 * Two things here are load-bearing and the rest is a key-value table: the
 * version has to come from the bytes, because it is what makes a replaced
 * picture appear without making an unchanged one re-download — and the id has to
 * be refused rather than sanitised, because it is a path segment in a public
 * URL and a quietly rewritten key stores an image where nothing will look.
 */

/** A 1×1 GIF is plenty: nothing here decodes the bytes. */
const PIXEL = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const OTHER = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const put = (id: string, data = PIXEL) =>
  putFounderImage({ id, mime: 'image/jpeg', data, width: 1200, height: 900 })

afterEach(async () => {
  for (const image of await listFounderImages()) await deleteFounderImage(image.id)
})

describe('isFounderImageId', () => {
  it('accepts a namespaced slug', () => {
    expect(isFounderImageId('bundle:leg-day-loading')).toBe(true)
    expect(isFounderImageId(bundleImageId('big-night-big-morning'))).toBe(true)
  })

  it('refuses anything that could escape its namespace or a URL', () => {
    expect(isFounderImageId('bundle:../../etc/passwd')).toBe(false)
    expect(isFounderImageId('no-namespace')).toBe(false)
    expect(isFounderImageId('bundle:with space')).toBe(false)
    expect(isFounderImageId('')).toBe(false)
  })
})

describe('putFounderImage', () => {
  it('stores an image against an id and reads it back whole', async () => {
    const meta = await put('bundle:leg-day')
    expect(meta?.bytes).toBeGreaterThan(0)

    const read = await readFounderImage('bundle:leg-day')
    expect(read?.data).toBe(PIXEL)
    expect(read?.mime).toBe('image/jpeg')
    expect(read?.width).toBe(1200)
  })

  it('versions by content, so the same file twice keeps the same URL', async () => {
    const first = await put('bundle:leg-day')
    const again = await put('bundle:leg-day')
    expect(again?.version).toBe(first?.version)

    const changed = await put('bundle:leg-day', OTHER)
    expect(changed?.version).not.toBe(first?.version)
    // …and the URL changes with it, which is the whole point of the hash.
    expect(founderImageUrl(changed!)).not.toBe(founderImageUrl(first!))
  })

  it('replaces rather than accumulating — one picture per id', async () => {
    await put('bundle:leg-day')
    await put('bundle:leg-day', OTHER)
    const all = await listFounderImages('bundle:')
    expect(all).toHaveLength(1)
    expect((await readFounderImage('bundle:leg-day'))?.data).toBe(OTHER)
  })

  it('refuses an id it would have to rewrite', async () => {
    expect(await put('bundle:../escape')).toBeNull()
    expect(await readFounderImage('bundle:../escape')).toBeNull()
  })

  it('lists metadata without the bytes', async () => {
    await put('bundle:leg-day')
    const [meta] = await listFounderImages('bundle:')
    expect(meta.id).toBe('bundle:leg-day')
    expect(meta).not.toHaveProperty('data')
  })
})
