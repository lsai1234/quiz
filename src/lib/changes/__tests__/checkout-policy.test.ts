/**
 * The member's unavailability choice, from the checkout journey through to a
 * stored subscription and back out again in the hub.
 *
 * The subtle rule under test throughout: a line only carries its OWN
 * `changePolicy` when the member overrode that product. Everything else follows
 * `defaultChangePolicy`, because `setDefaultChangePolicy` deliberately leaves
 * explicit choices alone — stamping every line at checkout would silently turn
 * the hub's plan-wide control into a no-op.
 */
import { buildMemberSubscription } from '@/lib/recharge/mock'
import { policyForLine, setDefaultChangePolicy, setLineChangePolicy } from '@/lib/changes/policy'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { QuizAnswers } from '@/lib/types'

const build = (opts: Parameters<typeof buildMemberSubscription>[4] = {}, answers?: QuizAnswers | null) =>
  buildMemberSubscription(MOCK_BLUEPRINT, MOCK_CATALOGUE, 'member@example.com', answers, opts)

describe('capturing the choice at checkout', () => {
  it('defaults to keeping the plan whole', () => {
    const sub = build()
    expect(sub.defaultChangePolicy).toBe('auto-swap')
    expect(sub.lines.every((l) => policyForLine(sub, l) === 'auto-swap')).toBe(true)
  })

  it('carries a plan-wide "remove" to every line without stamping them', () => {
    const sub = build({ defaultChangePolicy: 'remove' })

    expect(sub.defaultChangePolicy).toBe('remove')
    expect(sub.lines.every((l) => policyForLine(sub, l) === 'remove')).toBe(true)
    // The key part: no line has a policy of its own, so the plan default still governs.
    expect(sub.lines.every((l) => l.changePolicy === undefined)).toBe(true)
  })

  it('records only genuine per-product overrides', () => {
    const target = MOCK_BLUEPRINT.slots[0].selectedProductId!
    const sub = build({ defaultChangePolicy: 'auto-swap', changePolicyByProductId: { [target]: 'remove' } })

    const overridden = sub.lines.find((l) => l.productId === target)!
    const others = sub.lines.filter((l) => l.productId !== target)

    expect(overridden.changePolicy).toBe('remove')
    expect(policyForLine(sub, overridden)).toBe('remove')
    expect(others.every((l) => l.changePolicy === undefined)).toBe(true)
    expect(others.every((l) => policyForLine(sub, l) === 'auto-swap')).toBe(true)
  })

  it('keeps the legacy boolean in step with the effective policy', () => {
    // Older readers only understand allowSubstitution, so it has to reflect what
    // will actually happen — including for lines that merely inherit.
    const sub = build({ defaultChangePolicy: 'remove' })
    expect(sub.lines.every((l) => l.allowSubstitution === false)).toBe(true)

    const swapped = build({ defaultChangePolicy: 'auto-swap' })
    expect(swapped.lines.every((l) => l.allowSubstitution === true)).toBe(true)
  })

  it('still understands the legacy per-product boolean', () => {
    const target = MOCK_BLUEPRINT.slots[0].selectedProductId!
    const sub = build({ substitutionByProductId: { [target]: false } })

    expect(sub.lines.find((l) => l.productId === target)!.changePolicy).toBe('remove')
  })

  it('snapshots the member’s exclusions onto the plan', () => {
    const sub = build({ safetyConstraints: { dietaryTags: ['vegan'], noStimulants: true } })
    expect(sub.safetyConstraints).toEqual({ dietaryTags: ['vegan'], noStimulants: true })
  })
})

describe('changing it later in the hub', () => {
  it('the plan-wide control moves every line that has no choice of its own', () => {
    const sub = build({ defaultChangePolicy: 'auto-swap' })
    const next = setDefaultChangePolicy(sub, 'remove')

    expect(next.lines.every((l) => policyForLine(next, l) === 'remove')).toBe(true)
  })

  it('…and leaves a product the member set individually exactly where it is', () => {
    const target = MOCK_BLUEPRINT.slots[0].selectedProductId!
    const sub = build({ defaultChangePolicy: 'auto-swap', changePolicyByProductId: { [target]: 'auto-swap' } })

    const next = setDefaultChangePolicy(sub, 'remove')
    const pinned = next.lines.find((l) => l.productId === target)!

    expect(policyForLine(next, pinned)).toBe('auto-swap')
    expect(next.lines.filter((l) => l.productId !== target).every((l) => policyForLine(next, l) === 'remove')).toBe(true)
  })

  it('a per-line change pins that line against later default changes', () => {
    const sub = build({ defaultChangePolicy: 'auto-swap' })
    const lineId = sub.lines[0].id

    const pinned = setLineChangePolicy(sub, lineId, 'remove')
    const afterDefault = setDefaultChangePolicy(pinned, 'auto-swap')

    expect(policyForLine(afterDefault, afterDefault.lines[0])).toBe('remove')
  })
})
