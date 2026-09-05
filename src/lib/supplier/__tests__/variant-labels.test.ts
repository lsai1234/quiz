import { variantLabels, looksLikeSku } from '../variant-labels'

/**
 * Flavour labels, derived by comparing siblings against each other.
 *
 * The bug these exist for: a six-flavour product imported with one real name
 * and five raw SKU codes in the picker, because only the row's main SKU was
 * ever looked up. These tests are mostly about the labels being READABLE —
 * "Blackcurrant", not "P45757" and not the full sixty-character supplier name
 * repeated six times.
 */

const gel = (flavour: string) => `Endurance Breathe Isotonic Energy Gel, ${flavour} - 20 x 60g`

describe('variantLabels', () => {
  it('reduces sibling names to the words that actually differ', () => {
    const out = variantLabels([
      { sku: 'P50744', name: gel('Blackcurrant') },
      { sku: 'P42987', name: gel('Orange') },
      { sku: 'P45913', name: gel('Lemon') },
    ])
    expect(out.map((v) => v.label)).toEqual(['Blackcurrant', 'Orange', 'Lemon'])
    expect(out.every((v) => v.named)).toBe(true)
  })

  /*
    The reason the common part is taken in whole WORDS. A character-wise
    prefix over these two is "Black", which would label them "currant" and
    "berry" — technically the difference, and unreadable.
  */
  it('does not cut a word in half to find the difference', () => {
    const out = variantLabels([
      { sku: 'A', name: 'Whey Protein, Blackcurrant 1kg' },
      { sku: 'B', name: 'Whey Protein, Blackberry 1kg' },
    ])
    expect(out.map((v) => v.label)).toEqual(['Blackcurrant', 'Blackberry'])
  })

  it('works when the difference is a size rather than a flavour', () => {
    const out = variantLabels([
      { sku: 'A', name: 'Creatine Monohydrate 250g' },
      { sku: 'B', name: 'Creatine Monohydrate 500g' },
      { sku: 'C', name: 'Creatine Monohydrate 1kg' },
    ])
    expect(out.map((v) => v.label)).toEqual(['250g', '500g', '1kg'])
  })

  it('works when the difference is in the middle, not at either end', () => {
    const out = variantLabels([
      { sku: 'A', name: 'ISO-XP Whey Isolate Vanilla 1kg Tub' },
      { sku: 'B', name: 'ISO-XP Whey Isolate Chocolate 1kg Tub' },
    ])
    expect(out.map((v) => v.label)).toEqual(['Vanilla', 'Chocolate'])
  })

  it('strips the punctuation the split leaves dangling', () => {
    const out = variantLabels([
      { sku: 'A', name: 'Gel — Blackcurrant — 20 x 60g' },
      { sku: 'B', name: 'Gel — Orange — 20 x 60g' },
    ])
    expect(out.map((v) => v.label)).toEqual(['Blackcurrant', 'Orange'])
  })

  it('keeps a multi-word flavour whole', () => {
    const out = variantLabels([
      { sku: 'A', name: gel('Salted Caramel') },
      { sku: 'B', name: gel('Cherry Bakewell') },
    ])
    expect(out.map((v) => v.label)).toEqual(['Salted Caramel', 'Cherry Bakewell'])
  })

  describe('when there is nothing to compare against', () => {
    it('keeps the whole name for a lone named sibling', () => {
      const out = variantLabels([{ sku: 'P1', name: 'Creatine Monohydrate 500g' }])
      expect(out[0].label).toBe('Creatine Monohydrate 500g')
      expect(out[0].named).toBe(true)
    })

    it('falls back to the code for a SKU we have no name for', () => {
      const out = variantLabels([{ sku: 'P45757' }, { sku: 'P50744', name: null }])
      expect(out.map((v) => v.label)).toEqual(['P45757', 'P50744'])
      expect(out.every((v) => v.named)).toBe(false)
    })

    /*
      The state this repairs: one flavour was looked up and the rest were not.
      The named one must still get a real label, and the unnamed ones must be
      visibly unresolved rather than silently mislabelled.
    */
    it('labels what it can and leaves the rest as codes', () => {
      const out = variantLabels([
        { sku: 'P50744', name: gel('Blackcurrant') },
        { sku: 'P42987' },
        { sku: 'P45757', name: '' },
      ])
      expect(out[0]).toEqual({ sku: 'P50744', label: gel('Blackcurrant'), named: true })
      expect(out[1]).toEqual({ sku: 'P42987', label: 'P42987', named: false })
      expect(out[2]).toEqual({ sku: 'P45757', label: 'P45757', named: false })
    })
  })

  /*
    PowerBody list the same product under two codes often enough to matter.
    Stripping the shared part leaves nothing at all, and a blank label in a
    picker is worse than a long one.
  */
  it('keeps the full name when two siblings are named identically', () => {
    const out = variantLabels([
      { sku: 'A', name: 'Creatine Monohydrate 500g' },
      { sku: 'B', name: 'Creatine Monohydrate 500g' },
    ])
    expect(out.map((v) => v.label)).toEqual(['Creatine Monohydrate 500g', 'Creatine Monohydrate 500g'])
    expect(out.every((v) => v.named)).toBe(true)
  })

  it('never returns an empty label', () => {
    const out = variantLabels([
      { sku: 'A', name: '   ' },
      { sku: 'B', name: 'Something Real' },
      { sku: 'C' },
    ])
    for (const v of out) expect(v.label.trim().length).toBeGreaterThan(0)
  })

  it('returns one entry per input, in order', () => {
    const skus = ['P1', 'P2', 'P3', 'P4']
    const out = variantLabels(skus.map((sku) => ({ sku, name: gel(sku) })))
    expect(out.map((v) => v.sku)).toEqual(skus)
  })
})

describe('looksLikeSku', () => {
  it('recognises the codes the broken import left behind', () => {
    for (const t of ['P50744', 'P42987', 'P45757', '123456', 'AB12345']) {
      expect(looksLikeSku(t)).toBe(true)
    }
  })

  /*
    A false positive is the expensive direction: the repair pass overwrites
    anything this returns true for, so a real flavour that happens to contain
    digits must survive untouched.
  */
  it('leaves a real flavour alone, digits and all', () => {
    for (const t of [
      'Blackcurrant',
      'Salted Caramel',
      '2:1:1 Blue Razz',
      'Vanilla 1kg',
      'Orange - 20 x 60g',
      'Berry 500g',
      'Endurance Breathe Isotonic Energy Gel',
    ]) {
      expect(looksLikeSku(t)).toBe(false)
    }
  })

  it('is unbothered by nothing at all', () => {
    expect(looksLikeSku(null)).toBe(false)
    expect(looksLikeSku(undefined)).toBe(false)
    expect(looksLikeSku('')).toBe(false)
  })
})
