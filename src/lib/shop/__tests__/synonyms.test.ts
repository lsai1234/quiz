import { EXPANSIONS, INTENT_RULES, parseQuery, expand } from '../synonyms'
import { isClaimSafe, claimFlags } from '../claim-safety'

/**
 * The synonym tables are copy, and the claim-safety assertions below are the
 * point of this file rather than a formality. A phrase in a lookup table is
 * published text that no copy review will ever open — "hangover cure" mapped to
 * electrolytes is a medical claim shipped in a data structure.
 */
describe('the synonym tables are claim-safe', () => {
  it('has no risky phrase on the left-hand side', () => {
    for (const { phrase } of EXPANSIONS) {
      expect(claimFlags(phrase)).toEqual([])
    }
    for (const { phrase } of INTENT_RULES) {
      expect(claimFlags(phrase)).toEqual([])
    }
  })

  it('has no risky term on the right-hand side either', () => {
    for (const { expandsTo } of EXPANSIONS) {
      for (const term of expandsTo) expect(isClaimSafe(term)).toBe(true)
    }
  })
})

describe('the tables are well-formed', () => {
  it('carries no duplicate phrases', () => {
    const phrases = [...EXPANSIONS.map((e) => e.phrase), ...INTENT_RULES.map((r) => r.phrase)]
    expect(new Set(phrases).size).toBe(phrases.length)
  })

  it('is stored already-normalised, so matching never has to guess', () => {
    for (const { phrase } of EXPANSIONS) expect(phrase).toBe(phrase.toLowerCase().trim())
    for (const { phrase } of INTENT_RULES) expect(phrase).toBe(phrase.toLowerCase().trim())
  })
})

describe('expand', () => {
  it('adds catalogue vocabulary without removing the shopper’s own words', () => {
    const out = expand('pwo')
    expect(out).toContain('pwo')
    expect(out).toContain('pre')
    expect(out).toContain('workout')
  })

  it('only fires on whole tokens', () => {
    // "bulking" must not trip the "bulk" rule and re-add "muscle" twice over.
    expect(expand('bulk')).toContain('muscle')
    expect(expand('bulkhead')).toBe('bulkhead')
  })

  it('leaves an empty query alone', () => {
    expect(expand('')).toBe('')
  })
})

describe('parseQuery — intent', () => {
  it('reads "stim free" as a filter and takes it out of the search text', () => {
    const { text, intent } = parseQuery('stim free pre workout')
    expect(intent.stimFree).toBe(true)
    expect(text).not.toContain('stim')
    expect(text).toContain('pre workout')
  })

  it('handles every phrasing of no-caffeine', () => {
    for (const phrase of ['no caffeine', 'caffeine free', 'stimulant free', 'without caffeine', 'decaf']) {
      expect(parseQuery(phrase).intent.stimFree).toBe(true)
    }
  })

  it('reads a sort out of the phrasing', () => {
    expect(parseQuery('cheap protein').intent.sort).toBe('price-asc')
    expect(parseQuery('top rated protein').intent.sort).toBe('rating')
  })

  it('reads deal and stock intent', () => {
    expect(parseQuery('protein on offer').intent.onDealOnly).toBe(true)
    expect(parseQuery('creatine in stock').intent.inStockOnly).toBe(true)
  })

  it('turns a dietary word into a filter and takes it out of the text', () => {
    // Left in the text it would count twice — as a filter, and as a term the
    // product's own dietary tag matches — so "vegan protein" returned every
    // vegan product in the shop rather than the vegan proteins.
    const { text, intent } = parseQuery('vegan protein')
    expect(intent.dietary).toEqual(['vegan'])
    expect(text).toBe('protein')
  })

  it('matches whole tokens only', () => {
    expect(parseQuery('veganism').intent.dietary).toBeUndefined()
  })

  it('reports which phrases fired, for the UI to show back', () => {
    expect(parseQuery('cheap vegan protein').matchedPhrases).toEqual(expect.arrayContaining(['cheap', 'vegan']))
  })
})

describe('parseQuery — prices', () => {
  it('reads an explicit ceiling, with or without the pound sign', () => {
    expect(parseQuery('protein under £30').intent.priceMax).toBe(30)
    expect(parseQuery('protein under 30').intent.priceMax).toBe(30)
    expect(parseQuery('protein less than 25.50').intent.priceMax).toBe(25.5)
  })

  it('reads an explicit floor', () => {
    expect(parseQuery('protein over £20').intent.priceMin).toBe(20)
  })

  it('takes the price phrase out of the search text', () => {
    expect(parseQuery('protein under £30').text).not.toContain('30')
  })

  it('does NOT guess a ceiling from a bare number', () => {
    // "£30" is as likely to mean "around £30", and until the parse is shown back
    // as an editable chip a silent wrong filter removes products invisibly.
    const { intent } = parseQuery('protein £30')
    expect(intent.priceMax).toBeUndefined()
    expect(intent.priceMin).toBeUndefined()
  })
})

describe('parseQuery — combinations', () => {
  it('reads a whole sentence into text plus structure', () => {
    const { text, intent } = parseQuery('vegan protein under £30 no caffeine')
    expect(intent.dietary).toEqual(['vegan'])
    expect(intent.priceMax).toBe(30)
    expect(intent.stimFree).toBe(true)
    expect(text).toContain('protein')
    expect(text).not.toContain('caffeine')
  })

  it('returns an empty parse for an empty query', () => {
    const { text, intent, matchedPhrases } = parseQuery('   ')
    expect(text).toBe('')
    expect(intent).toEqual({})
    expect(matchedPhrases).toEqual([])
  })
})
