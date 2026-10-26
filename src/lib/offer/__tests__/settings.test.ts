/**
 * The hero list and the free bonus, before anything reads them (plan Phase 2).
 *
 * Both switches are off by default. A hero takes effect only with every check
 * complete — any one missing and it has no effect — and a switch on with no
 * approved hero or an empty pool changes nothing.
 */
import {
  DEFAULT_OFFER,
  activeBonusPool,
  activeHeroIds,
  heroStatus,
  missingHeroChecks,
  normaliseOffer,
  type HeroApproval,
  type OfferSettings,
} from '../settings'

const TODAY = '2026-11-02'
const product = { id: 'whey', swapGroup: 'protein-whey' as const }
const catalogue = [product, { id: 'ashwa', swapGroup: 'adaptogen' as const }]

const complete: HeroApproval = {
  productId: 'whey',
  hero: true,
  legalGB: true,
  novelFood: 'not-novel',
  safetyReviewed: true,
  safetyNotes: 'Milk allergy on the label.',
  claimId: 'protein-muscle-growth',
  checkedBy: 'A Pharmacist',
  checkedAt: '2026-10-30',
  updatedBy: null,
  updatedAt: null,
}

const on = (heroes: HeroApproval[], over: Partial<OfferSettings> = {}): OfferSettings => ({
  ...DEFAULT_OFFER,
  heroEnabled: true,
  heroes: Object.fromEntries(heroes.map((h) => [h.productId, h])),
  ...over,
})

describe('defaults', () => {
  it('has both switches off, no heroes and an empty pool', () => {
    expect(normaliseOffer(undefined)).toEqual(DEFAULT_OFFER)
    expect(DEFAULT_OFFER.heroEnabled).toBe(false)
    expect(DEFAULT_OFFER.bonus.enabled).toBe(false)
    expect(DEFAULT_OFFER.bonus.pool).toEqual([])
  })

  it('reads anything unrecognised as off', () => {
    const s = normaliseOffer({ heroEnabled: 'yes', bonus: { enabled: 1, pool: [3, 'x', 'x'], codes: '??', floorPct: 7 } })
    expect(s.heroEnabled).toBe(false)
    expect(s.bonus.enabled).toBe(false)
    expect(s.bonus.pool).toEqual(['x'])
    expect(s.bonus.codes).toBe('better-of')
    expect(s.bonus.floorPct).toBe(1)
  })
})

describe('a hero needs every check', () => {
  it('takes effect when all are recorded', () => {
    expect(missingHeroChecks(complete, product, TODAY)).toEqual([])
    expect(heroStatus(complete, product, TODAY)).toBe('approved')
    expect(activeHeroIds(on([complete]), catalogue, TODAY)).toEqual(['whey'])
  })

  const cases: [string, Partial<HeroApproval>, string][] = [
    ['not legal in GB', { legalGB: false }, 'legal'],
    ['novel food not authorised', { novelFood: 'unauthorised' }, 'novel-food'],
    ['novel food unchecked', { novelFood: 'unknown' }, 'novel-food'],
    ['safety not reviewed', { safetyReviewed: false }, 'safety'],
    ['wording undecided', { claimId: null }, 'wording'],
    ['a claim its kind cannot carry', { claimId: 'creatine-performance' }, 'wording'],
    ['nobody named', { checkedBy: '  ' }, 'checked-by'],
    ['no date', { checkedAt: null }, 'checked-at'],
    ['a date in the future', { checkedAt: '2027-01-01' }, 'checked-at'],
  ]
  it.each(cases)('has no effect when %s', (_, patch, check) => {
    const a = { ...complete, ...patch }
    expect(missingHeroChecks(a, product, TODAY)).toEqual([check])
    expect(heroStatus(a, product, TODAY)).toBe('incomplete')
    expect(activeHeroIds(on([a]), catalogue, TODAY)).toEqual([])
  })

  it('accepts "no claim" for a kind with none, and refuses a made-up one', () => {
    const ashwa = { ...complete, productId: 'ashwa', claimId: 'none' }
    expect(activeHeroIds(on([ashwa]), catalogue, TODAY)).toEqual(['ashwa'])
    expect(missingHeroChecks({ ...ashwa, claimId: 'protein-muscle-growth' }, catalogue[1], TODAY)).toEqual(['wording'])
  })

  it('is no hero once it leaves the catalogue', () => {
    expect(activeHeroIds(on([complete]), [], TODAY)).toEqual([])
  })

  it('is no hero with the switch off, however complete', () => {
    expect(activeHeroIds(on([complete], { heroEnabled: false }), catalogue, TODAY)).toEqual([])
  })
})

describe('switched on with nothing in it', () => {
  it('has no active hero and no bonus pool', () => {
    const s = normaliseOffer({ heroEnabled: true, bonus: { enabled: true, pool: [] } })
    expect(activeHeroIds(s, catalogue, TODAY)).toEqual([])
    expect(activeBonusPool(s, catalogue)).toEqual([])
  })

  it('keeps pool products that have left the catalogue out', () => {
    const s = normaliseOffer({ bonus: { enabled: true, pool: ['whey', 'gone'] } })
    expect(activeBonusPool(s, catalogue)).toEqual(['whey'])
    expect(activeBonusPool({ ...s, bonus: { ...s.bonus, enabled: false } }, catalogue)).toEqual([])
  })
})

describe('review pack rows', () => {
  it('lists every condition the bonus has to carry, and every hero with its wording', async () => {
    const { bonusTermRows, heroReviewRows } = await import('../review-rows')
    const terms = bonusTermRows(DEFAULT_OFFER.bonus).map((r) => r[2]).join(' ')
    for (const t of ['First order only', 'one per customer', '£60', 'While stocks last', 'first box only', 'Returns', 'discount code']) expect(terms).toContain(t)
    const rows = heroReviewRows([
      { productId: 'whey', title: 'Whey', swapGroup: 'protein-whey', inCatalogue: true, status: 'approved', missing: [], approval: complete },
      { productId: 'x', title: 'Off', swapGroup: null, inCatalogue: false, status: 'off', missing: [], approval: { ...complete, hero: false } },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0][2]).toBe('Protein contributes to a growth in muscle mass')
    expect(rows[0][3]).toMatch(/^Approved\. Checked by A Pharmacist on 2026-10-30/)
  })
})
