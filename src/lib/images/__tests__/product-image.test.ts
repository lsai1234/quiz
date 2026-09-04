import {
  isNormalisableUrl,
  snapWidth,
  productImageSrc,
  productImageSrcSet,
  parseImageRequest,
  IMAGE_WIDTHS,
} from '../product-image'

/**
 * The shape check only. It is deliberately NOT the security boundary — the
 * route re-checks every URL against the catalogue before it fetches anything,
 * which is what makes `powerbody.co.uk.evil.com` and an internal address
 * unreachable regardless of what this says. See the route's `isCatalogueImage`.
 */
describe('isNormalisableUrl', () => {
  it('accepts an https image URL', () => {
    expect(isNormalisableUrl('https://cdn.powerbody.co.uk/img/a.jpg')).toBe(true)
  })

  it('rejects every scheme but https, so no local file or data URI is asked for', () => {
    expect(isNormalisableUrl('http://powerbody.co.uk/a.jpg')).toBe(false)
    expect(isNormalisableUrl('file:///etc/passwd')).toBe(false)
    expect(isNormalisableUrl('data:image/png;base64,AAA')).toBe(false)
  })

  it('rejects anything that is not a URL rather than throwing', () => {
    expect(isNormalisableUrl('')).toBe(false)
    expect(isNormalisableUrl('/img/a.jpg')).toBe(false)
    expect(isNormalisableUrl(null)).toBe(false)
    expect(isNormalisableUrl(undefined)).toBe(false)
  })
})

describe('snapWidth', () => {
  it('rounds up to the next offered width', () => {
    expect(snapWidth(1)).toBe(56)
    expect(snapWidth(56)).toBe(56)
    expect(snapWidth(57)).toBe(96)
    expect(snapWidth(200)).toBe(320)
  })

  it('caps rather than minting a new size', () => {
    expect(snapWidth(4000)).toBe(IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1])
  })
})

describe('productImageSrc', () => {
  it('routes a supplier image through the normaliser at a snapped width', () => {
    const src = productImageSrc('https://powerbody.co.uk/img/whey.jpg', 56)
    expect(src).toBe('/api/product-image?u=https%3A%2F%2Fpowerbody.co.uk%2Fimg%2Fwhey.jpg&w=56')
  })

  it('routes ANY https image, whoever is hosting it', () => {
    // The hostname is not the boundary — the catalogue is. A supplier moving
    // CDN must not silently stop being normalised, which is what a hardcoded
    // host list did: the only symptom was cropped photos on a phone.
    expect(productImageSrc('https://images.somebrand.net/a.jpg', 56))
      .toBe('/api/product-image?u=https%3A%2F%2Fimages.somebrand.net%2Fa.jpg&w=56')
  })

  it('leaves an image we cannot normalise exactly as it is', () => {
    // A hand-entered http URL in the Founders Hub still has to render.
    expect(productImageSrc('http://example.com/a.jpg', 56)).toBe('http://example.com/a.jpg')
  })

  it('returns null when there is no image, so the caller draws the fallback tile', () => {
    expect(productImageSrc(null, 56)).toBeNull()
    expect(productImageSrc(undefined, 56)).toBeNull()
    expect(productImageSrc('', 56)).toBeNull()
  })
})

describe('productImageSrcSet', () => {
  it('offers a 2x for a phone screen', () => {
    const set = productImageSrcSet('https://powerbody.co.uk/a.jpg', 56)
    expect(set).toContain('w=56 1x')
    expect(set).toContain('w=160 2x') // 56×2 = 112, which snaps up to 160
  })

  it('gives none when 1x is already the largest size we make', () => {
    expect(productImageSrcSet('https://powerbody.co.uk/a.jpg', 640)).toBeNull()
  })

  it('gives none for an image we cannot normalise', () => {
    expect(productImageSrcSet('http://example.com/a.jpg', 56)).toBeNull()
    expect(productImageSrcSet(null, 56)).toBeNull()
  })
})

describe('parseImageRequest', () => {
  const parse = (qs: string) => parseImageRequest(new URLSearchParams(qs))

  it('reads a well-formed request', () => {
    expect(parse('u=https://powerbody.co.uk/a.jpg&w=96')).toEqual({
      url: 'https://powerbody.co.uk/a.jpg',
      width: 96,
    })
  })

  it('snaps an in-between width instead of honouring it', () => {
    expect(parse('u=https://powerbody.co.uk/a.jpg&w=57')!.width).toBe(96)
  })

  it('refuses a request that is not even the right shape', () => {
    expect(parse('w=96')).toBeNull()
    expect(parse('u=not-a-url&w=96')).toBeNull()
    expect(parse('u=http://powerbody.co.uk/a.jpg&w=96')).toBeNull()
  })

  it('refuses a width that is not a positive number', () => {
    expect(parse('u=https://powerbody.co.uk/a.jpg')).toBeNull()
    expect(parse('u=https://powerbody.co.uk/a.jpg&w=wide')).toBeNull()
    expect(parse('u=https://powerbody.co.uk/a.jpg&w=-5')).toBeNull()
  })
})
