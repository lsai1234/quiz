import {
  approved,
  asPendingReview,
  blankFillableFields,
  fieldsNeedingReview,
  isBlankValue,
  isPendingReview,
  isReviewComplete,
  sourcesForImport,
  withConfirmed,
  withoutSupplierOwned,
  REVIEW_FIELDS,
} from '@/lib/catalogue/review'
import type { CatalogueProduct } from '@/lib/catalogue/types'

const PRODUCT = {
  id: 'whey-1kg',
  title: 'Whey 1kg',
  description: 'A whey.',
  category: 'Protein',
  stackSlots: ['protein'],
  goals: ['muscle'],
  shortReason: 'Supports muscle growth.',
  basePrice: 19.99,
  cost: 10,
} as unknown as CatalogueProduct

describe('sourcesForImport', () => {
  it('separates what the supplier sent from what a machine decided', () => {
    const sources = sourcesForImport(['stackSlots', 'goals', 'shortReason'], true)

    // Copied from the feed.
    expect(sources.title).toBe('supplier')
    expect(sources.description).toBe('supplier')
    expect(sources.cost).toBe('supplier')
    // Our own rule.
    expect(sources.basePrice).toBe('rule')
    // Written by the model on this run.
    expect(sources.stackSlots).toBe('ai')
    expect(sources.shortReason).toBe('ai')
  })

  it('marks the keyword fallback as a heuristic, not as AI', () => {
    // Worth distinguishing: it is blunt but it cannot invent anything, and a
    // review that cries wolf on every field stops being read.
    const sources = sourcesForImport(['stackSlots'], false)
    expect(sources.stackSlots).toBe('heuristic')
  })
})

describe('withoutSupplierOwned', () => {
  it('refuses to let an estimate overwrite what the supplier actually charges', () => {
    // The classifier estimates cost from the shelf price for products that have
    // none. Applied to an imported product it turned a real £20.00 wholesale
    // price into £21.99, and every margin in the hub was then computed off a
    // number PowerBody never sent.
    const patch = { cost: 21.99, servings: 30, stackSlots: ['protein'], shortReason: 'Copy.' } as Partial<CatalogueProduct>

    expect(withoutSupplierOwned(patch)).toEqual({ stackSlots: ['protein'], shortReason: 'Copy.' })
  })

  it('leaves our own pricing rule alone too', () => {
    expect(withoutSupplierOwned({ basePrice: 9.99, goals: ['muscle'] } as Partial<CatalogueProduct>)).toEqual({
      goals: ['muscle'],
    })
  })
})

describe('the import gate', () => {
  it('imports as pending, which is what holds it out of the shop', () => {
    const pending = asPendingReview(PRODUCT, sourcesForImport(['stackSlots'], true))

    expect(pending.review?.status).toBe('pending')
    expect(isPendingReview(pending)).toBe(true)
    expect(isPendingReview(PRODUCT)).toBe(false)
  })

  it('does not ask the founder to tick off fields copied from the supplier', () => {
    // Eleven faithful copies between someone and the two fields a model wrote is
    // how a review becomes a rubber stamp.
    const pending = asPendingReview(PRODUCT, sourcesForImport(['stackSlots', 'shortReason'], true))
    const keys = fieldsNeedingReview(pending).map((f) => f.key)

    expect(keys).not.toContain('title')
    expect(keys).not.toContain('description')
    expect(keys).toContain('stackSlots')
    expect(keys).toContain('shortReason')
  })

  it('is not complete until every machine-decided field is checked', () => {
    let product = asPendingReview(PRODUCT, sourcesForImport(['stackSlots'], true))
    expect(isReviewComplete(product)).toBe(false)

    for (const field of fieldsNeedingReview(product)) {
      product = withConfirmed(product, [field.key as string])
    }
    expect(isReviewComplete(product)).toBe(true)
  })

  it('treats editing a field as both checking it and taking ownership of it', () => {
    const pending = asPendingReview(PRODUCT, sourcesForImport(['shortReason'], true))
    const edited = withConfirmed({ ...pending, shortReason: 'Mine now.' }, ['shortReason'], ['shortReason'])

    expect(edited.review?.confirmed).toContain('shortReason')
    // No longer the model's answer, so it should not be flagged as one.
    expect(edited.review?.sources.shortReason).toBe('founder')
  })

  it('approving records who and when, and makes it sellable', () => {
    const pending = asPendingReview(PRODUCT, sourcesForImport(['stackSlots'], true))
    const live = approved(pending, 'founder1@chrgd.dev')

    expect(live.review?.status).toBe('approved')
    expect(live.review?.approvedBy).toBe('founder1@chrgd.dev')
    expect(live.review?.approvedAt).toEqual(expect.any(String))
    expect(isPendingReview(live)).toBe(false)
    // Approving is itself a statement about everything on the screen.
    expect(live.review?.confirmed).toEqual(expect.arrayContaining(REVIEW_FIELDS.map((f) => f.key as string)))
  })
})

describe('blankFillableFields', () => {
  const blank = {
    ...PRODUCT,
    stackSlots: [],
    goals: [],
    dietaryTags: [],
    formats: ['powder'],
    swapGroup: 'general',
    shortReason: '   ',
    warnings: [],
    cost: 0,
  } as unknown as CatalogueProduct

  it('names every gap a machine is allowed to close', () => {
    const keys = blankFillableFields(blank).map((f) => f.key)

    expect(keys).toEqual(expect.arrayContaining(['stackSlots', 'goals', 'dietaryTags', 'shortReason', 'warnings']))
    // Filled in, so not a gap — a fill must never overwrite a decision.
    expect(keys).not.toContain('formats')
  })

  it('counts a swap group of "general" as blank', () => {
    // "general" is the engine's way of saying it does not know. A product left
    // there gets no swap alternatives and no affinity bonus, so treating it as
    // a filled-in value is how a product silently never gets recommended.
    expect(blankFillableFields(blank).map((f) => f.key)).toContain('swapGroup')
    expect(isBlankValue('swapGroup', 'general')).toBe(true)
    expect(isBlankValue('swapGroup', 'creatine')).toBe(false)
  })

  it('never offers to fill a price or anything else the supplier owns', () => {
    // A cost of 0 means PowerBody did not answer. Guessing one puts a made-up
    // wholesale price behind every margin figure in the hub.
    const keys = blankFillableFields(blank).map((f) => f.key)
    expect(keys).not.toContain('cost')
    expect(keys).not.toContain('basePrice')
    expect(keys).not.toContain('imageUrl')
    expect(keys).not.toContain('description')
  })

  it('has nothing to offer once the gaps are closed', () => {
    const full = {
      ...PRODUCT,
      stackSlots: ['protein'],
      goals: ['muscle'],
      dietaryTags: ['vegan'],
      formats: ['powder'],
      swapGroup: 'protein-whey',
      shortReason: 'Copy.',
      warnings: ['Contains caffeine'],
      hasStimulants: false,
      servings: 30,
    } as unknown as CatalogueProduct

    expect(blankFillableFields(full)).toEqual([])
  })
})
