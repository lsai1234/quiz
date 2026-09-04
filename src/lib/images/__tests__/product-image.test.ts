import {
  isAllowedImageHost,
  snapWidth,
  productImageSrc,
  productImageSrcSet,
  parseImageRequest,
  IMAGE_WIDTHS,
} from '../product-image'

/**
 * The allowlist is the whole security boundary of `/api/product-image`: past it,
 * the server fetches a URL a client chose and hands back the bytes. Every one of
 * these is a URL somebody would actually try.
 */
describe('isAllowedImageHost', () => {
  it('accepts the supplier and its subdomains', () => {
    expect(isAllowedImageHost('https://powerbody.co.uk/img/a.jpg')).toBe(true)
    expect(isAllowedImageHost('https://cdn.powerbody.co.uk/img/a.jpg')).toBe(true)
    expect(isAllowedImageHost('https://POWERBODY.CO.UK/img/a.jpg')).toBe(true)
  })

  it('rejects a host that merely CONTAINS an allowed one', () => {
    expect(isAllowedImageHost('https://powerbody.co.uk.evil.com/a.jpg')).toBe(false)
    expect(isAllowedImageHost('https://notpowerbody.co.uk/a.jpg')).toBe(false)
  })

  it('rejects the internal addresses an SSRF would reach for', () => {
    expect(isAllowedImageHost('http://169.254.169.254/latest/meta-data/')).toBe(false)
    expect(isAllowedImageHost('https://localhost/admin')).toBe(false)
    expect(isAllowedImageHost('https://10.0.0.1/')).toBe(false)
  })

  it('rejects every scheme but https', () => {
    expect(isAllowedImageHost('http://powerbody.co.uk/a.jpg')).toBe(false)
    expect(isAllowedImageHost('file:///etc/passwd')).toBe(false)
    expect(isAllowedImageHost('data:image/png;base64,AAA')).toBe(false)
  })

  it('rejects anything that is not a URL rather than throwing', () => {
    expect(isAllowedImageHost('')).toBe(false)
    expect(isAllowedImageHost('/img/a.jpg')).toBe(false)
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

  it('leaves an image we do not normalise exactly as it is', () => {
    // A hand-entered URL in the Founders Hub still has to render.
    expect(productImageSrc('https://example.com/a.jpg', 56)).toBe('https://example.com/a.jpg')
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

  it('gives none for an image we do not normalise', () => {
    expect(productImageSrcSet('https://example.com/a.jpg', 56)).toBeNull()
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

  it('refuses anything the route must not fetch', () => {
    expect(parse('w=96')).toBeNull()
    expect(parse('u=https://evil.com/a.jpg&w=96')).toBeNull()
    expect(parse('u=http://powerbody.co.uk/a.jpg&w=96')).toBeNull()
  })

  it('refuses a width that is not a positive number', () => {
    expect(parse('u=https://powerbody.co.uk/a.jpg')).toBeNull()
    expect(parse('u=https://powerbody.co.uk/a.jpg&w=wide')).toBeNull()
    expect(parse('u=https://powerbody.co.uk/a.jpg&w=-5')).toBeNull()
  })
})
