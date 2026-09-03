import {
  RECENT_SEARCHES_KEY,
  MAX_RECENT_SEARCHES,
  readRecentSearches,
  rememberSearch,
  clearRecentSearches,
} from '../recent-searches'

describe('recent searches', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts empty', () => {
    expect(readRecentSearches()).toEqual([])
  })

  it('remembers a search, most recent first', () => {
    rememberSearch('whey')
    rememberSearch('magnesium')
    expect(readRecentSearches()).toEqual(['magnesium', 'whey'])
  })

  it('keeps the shopper’s own spelling but compares normalised', () => {
    rememberSearch('Whey Protein')
    rememberSearch('whey protein')
    // One entry, not two — and the newest casing is what shows.
    expect(readRecentSearches()).toEqual(['whey protein'])
  })

  it('moves a repeated search back to the top rather than duplicating it', () => {
    rememberSearch('whey')
    rememberSearch('creatine')
    rememberSearch('whey')
    expect(readRecentSearches()).toEqual(['whey', 'creatine'])
  })

  it('keeps only the most recent few', () => {
    for (const q of ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7']) rememberSearch(q)
    const recent = readRecentSearches()
    expect(recent).toHaveLength(MAX_RECENT_SEARCHES)
    expect(recent[0]).toBe('g7')
  })

  it('ignores an empty or whitespace-only search', () => {
    rememberSearch('   ')
    rememberSearch('')
    expect(readRecentSearches()).toEqual([])
  })

  it('ignores a search with nothing searchable in it', () => {
    rememberSearch('!!!')
    expect(readRecentSearches()).toEqual([])
  })

  it('caps a very long query rather than storing an essay', () => {
    rememberSearch('x'.repeat(500))
    expect(readRecentSearches()[0].length).toBeLessThanOrEqual(60)
  })

  it('clears on request', () => {
    rememberSearch('whey')
    expect(clearRecentSearches()).toEqual([])
    expect(readRecentSearches()).toEqual([])
  })
})

/**
 * Storage is not guaranteed to work. It can be disabled, full, or throw outright
 * in a private window — and a shop that white-screens over a list of five
 * strings would be a very poor trade.
 */
describe('when localStorage misbehaves', () => {
  beforeEach(() => window.localStorage.clear())

  it('survives stored data that is not ours', () => {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, 'not json at all')
    expect(readRecentSearches()).toEqual([])
  })

  it('survives stored data of the wrong shape', () => {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify({ whey: true }))
    expect(readRecentSearches()).toEqual([])
  })

  it('drops non-string entries from a partly-valid list', () => {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(['whey', 42, null, 'creatine']))
    expect(readRecentSearches()).toEqual(['whey', 'creatine'])
  })

  it('never throws when reading throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied')
    })
    expect(() => readRecentSearches()).not.toThrow()
    expect(readRecentSearches()).toEqual([])
    spy.mockRestore()
  })

  it('never throws when writing throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => rememberSearch('whey')).not.toThrow()
    spy.mockRestore()
  })

  it('never throws when clearing throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('nope')
    })
    expect(() => clearRecentSearches()).not.toThrow()
    spy.mockRestore()
  })
})
