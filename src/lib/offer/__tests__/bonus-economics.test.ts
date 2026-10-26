/**
 * What the bonus would cost on three example stacks, and the proposed defaults.
 * "Free" never moves the stack's price or delivery: only what we keep changes.
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { bonusEconomics, costedItem, exampleStacks, proposeBonusDefaults, stackMargin, type CostedItem } from '../bonus-economics'
import { DEFAULT_BONUS } from '../settings'

const stacks = exampleStacks(MOCK_CATALOGUE)
const pool = MOCK_CATALOGUE.filter((p) => ['vitamin-c', 'magnesium', 'vitamin-d'].includes(p.swapGroup))
  .map(costedItem)
  .filter((i): i is CostedItem => i !== null)

it('builds Essentials, Balanced and Complete at three, five and seven products, one per kind', () => {
  expect(stacks.map((s) => [s.name, s.items.length])).toEqual([['Essentials', 3], ['Balanced', 5], ['Complete', 7]])
  const ids = stacks[2].items.map((i) => i.id)
  expect(new Set(ids).size).toBe(ids.length)
})

it('leaves the stack price and delivery alone, and only takes from what we keep', () => {
  for (const row of bonusEconomics(pool, stacks, DEFAULT_BONUS)) {
    for (const s of row.stacks) {
      expect(s.with.total).toBe(s.without.total)
      expect(s.with.delivery).toBe(s.without.delivery)
      expect(s.with.contribution).toBeLessThan(s.without.contribution)
      expect(s.cost).toBeCloseTo(s.without.contribution - s.with.contribution, 2)
    }
  }
})

it('never offers a bonus already in the stack, under the minimum, below the floor or on a tier switched off', () => {
  const inStack = stacks[2].items[0]
  const rows = bonusEconomics([inStack], stacks, DEFAULT_BONUS)
  expect(rows[0].stacks.find((s) => s.level === 'complete')!.qualifies).toBe(false)

  const high = bonusEconomics(pool, stacks, { ...DEFAULT_BONUS, minSubtotal: 10_000 })
  expect(high.every((r) => r.stacks.every((s) => !s.qualifies && !s.meetsMinimum))).toBe(true)

  const floor = bonusEconomics(pool, stacks, { ...DEFAULT_BONUS, minSubtotal: 0, floorPounds: 1_000 })
  expect(floor.every((r) => r.stacks.every((s) => !s.qualifies && !s.clearsFloor))).toBe(true)

  const noTiers = bonusEconomics(pool, stacks, { ...DEFAULT_BONUS, minSubtotal: 0, floorPounds: 0, floorPct: 0, tiers: [] })
  expect(noTiers.every((r) => r.stacks.every((s) => !s.qualifies))).toBe(true)
})

it('proposes a floor of half what the smallest stack keeps, and the first stack the dearest bonus clears it on', () => {
  const p = proposeBonusDefaults(pool, stacks)!
  const smallest = stackMargin(stacks[0].items)
  expect(p.floorPounds).toBe(Math.floor(smallest.contribution / 2))
  expect(p.floorPct).toBeLessThanOrEqual(smallest.marginPct / 2)
  expect(p.minSubtotal % 5).toBe(0)
  expect(p.why).toMatch(/half/)
  expect(proposeBonusDefaults([], stacks)).toBeNull()
})
