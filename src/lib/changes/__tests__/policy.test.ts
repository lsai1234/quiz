import {
  FALLBACK_CHANGE_POLICY,
  anyCategoryCandidate,
  autoApplyAt,
  findReplacement,
  isDueForAutoApply,
  policyForLine,
  resolveIntendedAction,
  setDefaultChangePolicy,
  setLineChangePolicy,
  applyPolicyMap,
} from '@/lib/changes/policy'
import { AVAILABILITY_KINDS, PRICE_KINDS, type ChangeKind } from '@/lib/changes/types'
import { getPricingConfig, setPricingOverrides, resetPricingOverrides } from '@/lib/stack-blueprint/pricing'
import type { ChangePolicy, MemberSubscription, MemberSubscriptionLine, SafetyConstraints } from '@/lib/recharge/types'
import { product, subscriptionWith, line } from './fixtures'

afterEach(() => resetPricingOverrides())

const NO_CONSTRAINTS: SafetyConstraints = { dietaryTags: [], noStimulants: false }

describe('policyForLine — precedence and back-compat', () => {
  const sub = (defaultPolicy?: ChangePolicy) =>
    ({ defaultChangePolicy: defaultPolicy }) as Pick<MemberSubscription, 'defaultChangePolicy'>

  it('an explicit line policy wins over everything', () => {
    expect(policyForLine(sub('auto-swap'), { changePolicy: 'remove', allowSubstitution: true })).toBe('remove')
    expect(policyForLine(sub('remove'), { changePolicy: 'auto-swap', allowSubstitution: false })).toBe('auto-swap')
  })

  it('maps the legacy opt-out to remove, not to a stalled hold', () => {
    expect(policyForLine(sub(), { allowSubstitution: false })).toBe('remove')
  })

  it('ignores allowSubstitution:true — it was the default for every line ever built', () => {
    // If `true` outranked the plan default, a member who picked "remove" at
    // checkout would silently get swaps on every pre-existing line.
    expect(policyForLine(sub('remove'), { allowSubstitution: true })).toBe('remove')
  })

  it('falls back to the plan default, then the configured default', () => {
    expect(policyForLine(sub('remove'), {})).toBe('remove')
    expect(policyForLine(sub(), {})).toBe(FALLBACK_CHANGE_POLICY)
    setPricingOverrides({ defaultChangePolicy: 'remove' })
    expect(policyForLine(sub(), {}, getPricingConfig())).toBe('remove')
  })

  it('ignores a nonsense configured default rather than inventing a third option', () => {
    setPricingOverrides({ defaultChangePolicy: 'ask-me' as unknown as 'remove' })
    expect(policyForLine(sub(), {}, getPricingConfig())).toBe('auto-swap')
  })
})

describe('writing policy', () => {
  it('keeps the deprecated allowSubstitution flag in step', () => {
    const s = subscriptionWith([line({ id: 'l1' })])
    const next = setLineChangePolicy(s, 'l1', 'remove')
    expect(next.lines[0].changePolicy).toBe('remove')
    expect(next.lines[0].allowSubstitution).toBe(false)
    expect(setLineChangePolicy(next, 'l1', 'auto-swap').lines[0].allowSubstitution).toBe(true)
  })

  it('changing the plan default leaves deliberate per-line choices alone', () => {
    const s = subscriptionWith([
      line({ id: 'l1', changePolicy: 'auto-swap' }),
      line({ id: 'l2' }),
    ])
    const next = setDefaultChangePolicy(s, 'remove')
    expect(next.defaultChangePolicy).toBe('remove')
    expect(next.lines[0].changePolicy).toBe('auto-swap') // explicitly set — untouched
    expect(next.lines[1].changePolicy).toBe('remove') // followed the default
  })

  it('applies a per-product map from the checkout step', () => {
    const s = subscriptionWith([line({ id: 'l1', productId: 'p1' }), line({ id: 'l2', productId: 'p2' })])
    const next = applyPolicyMap(s, { p2: 'remove' })
    expect(next.lines[0].changePolicy).toBeUndefined()
    expect(next.lines[1].changePolicy).toBe('remove')
  })
})

describe('findReplacement', () => {
  const current = line({ productId: 'whey-a', swapGroup: 'protein-whey', quantity: 1, pricePerDelivery: 30 })

  it('picks the nearest-priced same-group product', () => {
    const found = findReplacement({
      candidates: [
        product({ id: 'whey-b', swapGroup: 'protein-whey', price: 33 }),
        product({ id: 'whey-c', swapGroup: 'protein-whey', price: 31 }),
      ],
      line: current,
      constraints: NO_CONSTRAINTS,
    })
    expect(found?.id).toBe('whey-c')
  })

  it('rejects anything outside the price tolerance in either direction', () => {
    // 15% of £30 = £4.50, so £36 (too dear) and £20 (a downgrade) both fail.
    const found = findReplacement({
      candidates: [
        product({ id: 'whey-dear', swapGroup: 'protein-whey', price: 36 }),
        product({ id: 'whey-cheap', swapGroup: 'protein-whey', price: 20 }),
      ],
      line: current,
      constraints: NO_CONSTRAINTS,
    })
    expect(found).toBeNull()
  })

  it('never returns a product that fails the member’s exclusions', () => {
    const candidates = [product({ id: 'whey-b', swapGroup: 'protein-whey', price: 31, dietaryTags: [] })]
    expect(findReplacement({ candidates, line: current, constraints: { dietaryTags: ['vegan'], noStimulants: false } })).toBeNull()
    // …but the category itself does have something, which is a different email.
    expect(anyCategoryCandidate({ candidates, line: current })).toBe(true)
  })

  it('skips the current product, subscription-only refills and non-eligible items', () => {
    const found = findReplacement({
      candidates: [
        product({ id: 'whey-a', swapGroup: 'protein-whey', price: 30 }),
        product({ id: 'whey-sub', swapGroup: 'protein-whey', price: 30, isSubscriptionOnly: true }),
        product({ id: 'whey-no', swapGroup: 'protein-whey', price: 30, subscriptionEligible: false }),
      ],
      line: current,
      constraints: NO_CONSTRAINTS,
    })
    expect(found).toBeNull()
  })
})

describe('resolveIntendedAction', () => {
  const replacement = product({ id: 'whey-b', swapGroup: 'protein-whey', price: 31 })

  it('swaps when the member chose auto-swap and something safe exists', () => {
    const action = resolveIntendedAction({ kind: 'out-of-stock', policy: 'auto-swap', replacement })
    expect(action.resolution).toEqual({ type: 'substitute', replacementProductId: 'whey-b' })
    expect(action.reason).toBe('member-chose-swap')
    expect(action.needsReview).toBe(false) // routine outage, member said what they want
  })

  it('removes when the member chose remove, even with a replacement available', () => {
    const action = resolveIntendedAction({ kind: 'out-of-stock', policy: 'remove', replacement })
    expect(action.resolution).toEqual({ type: 'remove' })
    expect(action.reason).toBe('member-chose-remove')
  })

  it('falls back to removal when no safe replacement exists, and says which', () => {
    const noneAtAll = resolveIntendedAction({ kind: 'out-of-stock', policy: 'auto-swap', replacement: null })
    expect(noneAtAll.resolution).toEqual({ type: 'remove' })
    expect(noneAtAll.reason).toBe('no-replacement-available')

    const unsafeOnly = resolveIntendedAction({
      kind: 'out-of-stock', policy: 'auto-swap', replacement: null, unsafeCandidateExists: true,
    })
    expect(unsafeOnly.reason).toBe('no-safe-replacement')
    expect(unsafeOnly.needsReview).toBe(true)
  })

  it('flags a plan-shape change for review without overwriting why it happened', () => {
    // The member still chose "remove" — that's what their email must say. The
    // fact it would empty their plan is a separate, founder-facing concern.
    const action = resolveIntendedAction({ kind: 'out-of-stock', policy: 'remove', replacement: null, wouldBreakPlan: true })
    expect(action.reason).toBe('member-chose-remove')
    expect(action.breaksPlan).toBe(true)
    expect(action.needsReview).toBe(true)
  })

  it('doesn’t flag a plan-shape change when the line is being swapped, not removed', () => {
    const action = resolveIntendedAction({ kind: 'out-of-stock', policy: 'auto-swap', replacement, wouldBreakPlan: true })
    expect(action.breaksPlan).toBeUndefined()
    expect(action.needsReview).toBe(false)
  })

  it('always reviews a discontinued product — the choice is permanent', () => {
    expect(resolveIntendedAction({ kind: 'discontinued', policy: 'auto-swap', replacement }).needsReview).toBe(true)
  })

  it('absorbs price moves by default, so an unattended queue never costs the member', () => {
    for (const kind of PRICE_KINDS) {
      const action = resolveIntendedAction({ kind, policy: 'auto-swap', replacement })
      expect(action.resolution).toEqual({ type: 'absorb' })
      expect(action.needsReview).toBe(true)
    }
  })

  it('applies immediately when the review window is switched off', () => {
    setPricingOverrides({ founderReviewHours: 0 })
    const action = resolveIntendedAction({
      kind: 'discontinued', policy: 'auto-swap', replacement: null, wouldBreakPlan: true, config: getPricingConfig(),
    })
    expect(action.needsReview).toBe(false)
  })

  // The invariant the whole design rests on.
  it('always yields a concrete action — no input can produce "wait for the member"', () => {
    const policies: ChangePolicy[] = ['auto-swap', 'remove']
    const kinds: ChangeKind[] = [...AVAILABILITY_KINDS, ...PRICE_KINDS]
    const allowed = ['substitute', 'remove', 'absorb']

    for (const kind of kinds) {
      for (const policy of policies) {
        for (const repl of [replacement, null]) {
          for (const wouldBreakPlan of [true, false]) {
            for (const unsafeCandidateExists of [true, false]) {
              const action = resolveIntendedAction({ kind, policy, replacement: repl, wouldBreakPlan, unsafeCandidateExists })
              expect(allowed).toContain(action.resolution.type)
              expect(action.reason).toBeTruthy()
              // A swap is only ever intended when there is something to swap to.
              if (action.resolution.type === 'substitute') expect(repl).not.toBeNull()
            }
          }
        }
      }
    }
  })
})

describe('the review window', () => {
  const at = new Date('2026-07-29T09:00:00.000Z')

  it('lands immediately when no review is needed', () => {
    const action = { resolution: { type: 'remove' }, reason: 'member-chose-remove', needsReview: false } as const
    expect(autoApplyAt(action, at)).toBe(at.toISOString())
  })

  it('defers by the configured hours when review is needed', () => {
    setPricingOverrides({ founderReviewHours: 24 })
    const action = { resolution: { type: 'remove' }, reason: 'member-chose-remove', needsReview: true } as const
    expect(autoApplyAt(action, at, getPricingConfig())).toBe('2026-07-30T09:00:00.000Z')
  })

  it('becomes due once the window has passed', () => {
    expect(isDueForAutoApply('2026-07-30T09:00:00.000Z', at)).toBe(false)
    expect(isDueForAutoApply('2026-07-29T09:00:00.000Z', at)).toBe(true)
    expect(isDueForAutoApply('not-a-date', at)).toBe(false)
  })
})

describe('MemberSubscriptionLine typing', () => {
  it('accepts a change policy', () => {
    const l: MemberSubscriptionLine = line({ changePolicy: 'remove' })
    expect(l.changePolicy).toBe('remove')
  })
})
