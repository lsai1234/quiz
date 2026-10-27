/**
 * The server's re-check of the bonus, before payment: every way it can stop
 * qualifying is refused, with words that say nothing was charged.
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { NO_CONSTRAINTS } from '@/lib/changes/safety'
import { checkBonusClaim, heroStillApproved } from '../server-check'
import { DEFAULT_OFFER } from '../settings'
import { TODAY, allOn } from './fixtures'

const byId = new Map(MOCK_CATALOGUE.map((p) => [p.id, p]))
const line = (id: string) => {
  const p = byId.get(id)!
  return { product: p, price: p.variants[0].price, cost: null, quantity: 1 }
}
const STACK = ['chrgd-whey-protein', 'chrgd-creatine', 'chrgd-pre-workout', 'chrgd-bcaa', 'chrgd-clear-whey'].map(line)
const base = {
  claim: { productId: 'chrgd-vitamin-c-zinc', level: 'complete' },
  settings: allOn(),
  catalogue: MOCK_CATALOGUE,
  lines: STACK,
  constraints: NO_CONSTRAINTS,
  isStack: true,
  codeApplied: false,
}

it('lets a bonus that still qualifies through', () => {
  const r = checkBonusClaim(base)
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.contributionWith).toBeGreaterThanOrEqual(r.floor)
})

it.each([
  ['switched off', { settings: DEFAULT_OFFER }, 'off'],
  ['taken out of the pool', { settings: allOn({ pool: ['chrgd-electrolytes'] }) }, 'not-in-pool'],
  ['on a depth that does not qualify', { settings: allOn({ tiers: ['essentials'] }) }, 'tier'],
  ['the hero on its own', { isStack: false }, 'not-a-stack'],
  ['already in the basket', { lines: [...STACK, line('chrgd-vitamin-c-zinc')] }, 'in-basket'],
  ['not suitable for them', { claim: { productId: 'chrgd-omega-3', level: 'complete' }, constraints: { ...NO_CONSTRAINTS, excludedIngredients: ['fish-oil' as const] } }, 'excluded'],
  ['under the minimum', { settings: allOn({ minSubtotal: 10_000 }) }, 'minimum'],
  ['below the floor', { settings: allOn({ floorPounds: 1_000 }) }, 'margin'],
  ['with a code, when a code replaces it', { settings: allOn({ codes: 'code-cancels-bonus' }), codeApplied: true }, 'code'],
] as const)('refuses one %s', (_, over, reason) => {
  const r = checkBonusClaim({ ...base, ...over } as typeof base)
  expect(r).toMatchObject({ ok: false, reason })
  if (!r.ok) expect(r.message).toMatch(/Nothing has been charged/)
})

it('refuses a sold-out bonus', () => {
  const soldOut = MOCK_CATALOGUE.map((p) => (p.id === 'chrgd-vitamin-c-zinc' ? { ...p, variants: p.variants.map((v) => ({ ...v, available: false })) } : p))
  expect(checkBonusClaim({ ...base, catalogue: soldOut })).toMatchObject({ ok: false, reason: 'stock' })
})

it('keeps a hero only while it is still approved and the switch is on', () => {
  expect(heroStillApproved('chrgd-magnesium', allOn(), MOCK_CATALOGUE, TODAY)).toBe(true)
  expect(heroStillApproved('chrgd-magnesium', { ...allOn(), heroEnabled: false }, MOCK_CATALOGUE, TODAY)).toBe(false)
  expect(heroStillApproved('chrgd-whey-protein', allOn(), MOCK_CATALOGUE, TODAY)).toBe(false)
})
