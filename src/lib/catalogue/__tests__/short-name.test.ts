/**
 * The short-name derivation, tested against the titles it actually has to
 * survive: the CHRGD mock catalogue and the real supplier roster in
 * `docs/rosters/chrgd-roster.csv`, which is where the awkward shapes live
 * ("ZMA - Sports Recovery - 90 vcaps", "Kre-Alkalyn EFX (Clear Caps) - 120
 * caps").
 */
import { deriveShortName, shortNameOf, shortNameNeedsWork, SHORT_NAME_MAX } from '../short-name'
import { MOCK_CATALOGUE } from '@/lib/catalogue'

describe('deriveShortName', () => {
  it.each([
    // Our own brand is the card, not the product.
    ['CHRGD Whey Protein', 'Whey Protein'],
    ['CHRGD Creatine Monohydrate', 'Creatine Monohydrate'],
    // A hyphenated WORD is not a sub-clause: only a spaced dash splits.
    ['CHRGD Stim-Free Pre-Workout', 'Stim-Free Pre-Workout'],
    ['Kre-Alkalyn EFX (Clear Caps) - 120 caps', 'Kre-Alkalyn EFX'],
    // Pack sizes, in every shape the roster writes them.
    ['Creatine Monohydrate Powder - 250g', 'Creatine Monohydrate'],
    ['Vitamin D3 + K2 - 90 softgels', 'Vitamin D3 + K2'],
    ['Vegan Multivitamin - 60 tablets', 'Vegan Multivitamin'],
    ['Collagen Peptides - Joints & Bones - 153g', 'Collagen Peptides'],
    ['ZMA - Sports Recovery - 90 vcaps', 'ZMA'],
    ['Neuro Optimizer - 120 caps', 'Neuro Optimizer'],
    // A leading percentage claim, then a trailing tier word.
    ['100% Whey Protein Professional', 'Whey Protein'],
    // Already short enough — left completely alone.
    ['Ultimate Omega + CoQ10', 'Ultimate Omega + CoQ10'],
    ['Super Strong Omega 3', 'Super Strong Omega 3'],
    ['Hydration+', 'Hydration+'],
    ['L-Glutamine', 'L-Glutamine'],
  ])('%s → %s', (title, expected) => {
    expect(deriveShortName({ title })).toBe(expected)
  })

  it('never returns an empty name for a product that has one', () => {
    for (const title of ['CHRGD', '250g', '- 90 vcaps', 'x', 'CHRGD 1kg']) {
      expect(deriveShortName({ title }).length).toBeGreaterThan(0)
    }
  })

  it('returns nothing only when there was nothing', () => {
    expect(deriveShortName({ title: '' })).toBe('')
  })

  it('never ends on dangling punctuation', () => {
    for (const p of MOCK_CATALOGUE) {
      expect(deriveShortName(p)).not.toMatch(/[\s,;:&+/–—-]$/)
    }
  })

  it('keeps the whole real catalogue inside the poster budget', () => {
    for (const p of MOCK_CATALOGUE) {
      expect(deriveShortName(p).length).toBeLessThanOrEqual(SHORT_NAME_MAX)
    }
  })

  it('a name too long to break stays a name rather than becoming nothing', () => {
    // One word, no spaces, over budget: there is nowhere to cut on a boundary.
    const out = deriveShortName({ title: 'Methylsulfonylmethanesulfonate' })
    expect(out.length).toBeLessThanOrEqual(SHORT_NAME_MAX)
    expect(out.length).toBeGreaterThan(0)
  })

  it('does not drop the word that says WHICH product it is', () => {
    // "Isolate", "Hydrolysed" and "Monohydrate" distinguish two products that
    // would otherwise both shorten to the same thing. They are not filler.
    expect(deriveShortName({ title: 'Whey Protein Isolate' })).toContain('Isolate')
    expect(deriveShortName({ title: 'Creatine Monohydrate Powder - 250g' })).toContain('Monohydrate')
    expect(deriveShortName({ title: 'Collagen Hydrolysed Type I & III' })).toContain('Hydrolysed')
  })
})

describe('shortNameOf', () => {
  it('prefers the stored name', () => {
    expect(shortNameOf({ title: 'CHRGD Whey Protein', shortName: 'Whey' })).toBe('Whey')
  })

  it('falls back to the derivation when the field is absent, null or blank', () => {
    const title = 'CHRGD Whey Protein'
    expect(shortNameOf({ title })).toBe('Whey Protein')
    expect(shortNameOf({ title, shortName: null })).toBe('Whey Protein')
    expect(shortNameOf({ title, shortName: '   ' })).toBe('Whey Protein')
  })
})

describe('shortNameNeedsWork', () => {
  it('flags absent, over-budget, and copied-title names', () => {
    const title = 'Collagen Peptides - Joints & Bones - 153g'
    expect(shortNameNeedsWork({ title })).toBe(true)
    expect(shortNameNeedsWork({ title, shortName: title })).toBe(true)
    expect(shortNameNeedsWork({ title, shortName: 'A name well over the poster budget' })).toBe(true)
    expect(shortNameNeedsWork({ title, shortName: 'Collagen Peptides' })).toBe(false)
  })
})
