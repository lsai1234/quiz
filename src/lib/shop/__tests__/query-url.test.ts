import { EMPTY_QUERY, type ShopQuery } from '../shop-query'
import { encodeShopQuery, decodeShopQuery, shopQuerySearch } from '../query-url'

const query = (over: Partial<ShopQuery> = {}): ShopQuery => ({ ...EMPTY_QUERY, ...over })
const roundTrip = (q: ShopQuery) => decodeShopQuery(encodeShopQuery(q))

describe('encodeShopQuery', () => {
  it('writes nothing for an unnarrowed shop, so a plain shop keeps a plain URL', () => {
    expect(encodeShopQuery(EMPTY_QUERY).toString()).toBe('')
    expect(shopQuerySearch(EMPTY_QUERY)).toBe('')
  })

  it('uses short keys — this URL is meant to be pasted into a message', () => {
    const params = encodeShopQuery(query({ q: 'whey', dietary: ['vegan'], sort: 'price-asc' }))
    expect(params.get('q')).toBe('whey')
    expect(params.get('d')).toBe('vegan')
    expect(params.get('sort')).toBe('price-asc')
  })

  it('omits the default sort', () => {
    expect(encodeShopQuery(query({ sort: 'relevance' })).has('sort')).toBe(false)
  })

  it('omits a search that is only whitespace', () => {
    expect(encodeShopQuery(query({ q: '   ' })).has('q')).toBe(false)
  })

  it('prefixes the search string only when there is something in it', () => {
    expect(shopQuerySearch(query({ q: 'whey' }))).toBe('?q=whey')
  })
})

describe('round-tripping', () => {
  it('survives every field at once', () => {
    const full = query({
      q: 'magnesium',
      dietary: ['vegan', 'gluten-free'],
      categories: ['Protein', 'Sleep'],
      goals: ['muscle', 'sleep-better'],
      slots: ['protein', 'sleep'],
      formats: ['powder', 'capsule'],
      priceMin: 10,
      priceMax: 40.5,
      stimFree: true,
      inStockOnly: true,
      onDealOnly: true,
      subscribable: true,
      minRating: 4,
      sort: 'saving',
    })
    expect(roundTrip(full)).toEqual(full)
  })

  it('survives the empty query', () => {
    expect(roundTrip(EMPTY_QUERY)).toEqual(EMPTY_QUERY)
  })

  it('keeps a category with a space in it', () => {
    const q = query({ categories: ['Gut Health', 'Menopause Support'] })
    expect(roundTrip(q).categories).toEqual(['Gut Health', 'Menopause Support'])
  })
})

/**
 * Every case below is a link someone will actually produce: hand-edited, mangled
 * by a mail client, or simply older than the catalogue. None may throw — a shop
 * that crashes on a stale link is worse than one that ignores a stale value.
 */
describe('decodeShopQuery never throws', () => {
  it('returns the empty query for nothing at all', () => {
    expect(decodeShopQuery(null)).toEqual(EMPTY_QUERY)
    expect(decodeShopQuery(undefined)).toEqual(EMPTY_QUERY)
    expect(decodeShopQuery('')).toEqual(EMPTY_QUERY)
  })

  it('ignores keys it does not know', () => {
    expect(decodeShopQuery('utm_source=email&fbclid=abc123')).toEqual(EMPTY_QUERY)
  })

  it('drops a dietary tag we do not have', () => {
    expect(decodeShopQuery('d=vegan,unicorn').dietary).toEqual(['vegan'])
  })

  it('drops a goal we do not have', () => {
    expect(decodeShopQuery('g=muscle,teleportation').goals).toEqual(['muscle'])
  })

  it('drops a stack slot we do not have', () => {
    expect(decodeShopQuery('sl=protein,telekinesis').slots).toEqual(['protein'])
  })

  it('falls back to the default sort for one the UI no longer offers', () => {
    expect(decodeShopQuery('sort=cheapest').sort).toBe('relevance')
    expect(decodeShopQuery('sort=').sort).toBe('relevance')
  })

  it('rejects prices that are not positive numbers', () => {
    expect(decodeShopQuery('max=abc').priceMax).toBeNull()
    expect(decodeShopQuery('max=-5').priceMax).toBeNull()
    expect(decodeShopQuery('max=Infinity').priceMax).toBeNull()
    expect(decodeShopQuery('min=0').priceMin).toBeNull()
  })

  it('rejects a rating above five, which would filter to nothing forever', () => {
    expect(decodeShopQuery('r=9').minRating).toBeNull()
    expect(decodeShopQuery('r=4.5').minRating).toBe(4.5)
  })

  it('treats any flag value other than "1" as off', () => {
    expect(decodeShopQuery('stim=true').stimFree).toBe(false)
    expect(decodeShopQuery('stim=1').stimFree).toBe(true)
  })

  it('caps a search someone pasted an essay into', () => {
    expect(decodeShopQuery(`q=${'a'.repeat(400)}`).q).toHaveLength(120)
  })

  it('caps the number of values in a list', () => {
    const many = Array.from({ length: 60 }, (_, i) => `Cat${i}`).join(',')
    expect(decodeShopQuery(`c=${many}`).categories).toHaveLength(20)
  })

  it('drops empty and over-long entries from a list', () => {
    expect(decodeShopQuery('c=Protein,,  ,Sleep').categories).toEqual(['Protein', 'Sleep'])
    expect(decodeShopQuery(`c=Protein,${'x'.repeat(100)}`).categories).toEqual(['Protein'])
  })

  it('de-duplicates repeated values', () => {
    expect(decodeShopQuery('d=vegan,vegan,halal').dietary).toEqual(['vegan', 'halal'])
  })

  it('passes categories and formats through unvalidated — the catalogue owns them', () => {
    // A category we have stopped stocking outlives its products. It filters to
    // nothing, which the empty state already handles, and that beats dropping a
    // perfectly good link the day a shelf is renamed.
    expect(decodeShopQuery('c=Nootropics').categories).toEqual(['Nootropics'])
  })

  it('accepts a real URLSearchParams as well as a string', () => {
    expect(decodeShopQuery(new URLSearchParams({ q: 'whey' })).q).toBe('whey')
  })
})
