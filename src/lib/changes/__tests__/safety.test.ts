import {
  NO_CONSTRAINTS,
  constraintsFor,
  describeConstraints,
  failedConstraints,
  hasConstraints,
  meetsSafetyConstraints,
  safetyConstraintsFrom,
} from '@/lib/changes/safety'
import type { QuizAnswers } from '@/lib/types'
import { product } from './fixtures'

function answers(over: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    lifestyle: [], wellbeingAnswers: {}, stimPreference: null, caffeineLevel: null, safetyFlags: [], ...over,
  } as QuizAnswers
}

describe('deriving constraints from quiz answers', () => {
  it('reads vegan off lifestyle', () => {
    expect(safetyConstraintsFrom(answers({ lifestyle: ['vegan'] })).dietaryTags).toEqual(['vegan'])
  })

  it('reads vegetarian off the collagen follow-up', () => {
    expect(safetyConstraintsFrom(answers({ wellbeingAnswers: { collagenOk: 'veggie' } })).dietaryTags)
      .toEqual(['vegetarian'])
  })

  it('reads the optional off-type dietary list the factory also reads', () => {
    const a = { ...answers(), dietary: ['gluten-free'] } as unknown as QuizAnswers
    expect(safetyConstraintsFrom(a).dietaryTags).toEqual(['gluten-free'])
  })

  it('ignores an unrecognised dietary string rather than blocking every swap', () => {
    // A constraint no product can satisfy would silently remove lines instead of
    // swapping them — fail open on the tag, not on the member.
    const a = { ...answers(), dietary: ['made-up'] } as unknown as QuizAnswers
    expect(safetyConstraintsFrom(a).dietaryTags).toEqual([])
  })

  it('treats either stimulant opt-out as no stimulants', () => {
    expect(safetyConstraintsFrom(answers({ stimPreference: 'no' })).noStimulants).toBe(true)
    expect(safetyConstraintsFrom(answers({ caffeineLevel: 'none' })).noStimulants).toBe(true)
    expect(safetyConstraintsFrom(answers()).noStimulants).toBe(false)
  })

  it('is empty for a member with no answers on file', () => {
    expect(safetyConstraintsFrom(null)).toEqual(NO_CONSTRAINTS)
    expect(hasConstraints(NO_CONSTRAINTS)).toBe(false)
  })
})

describe('testing a product against constraints', () => {
  it('requires every tag', () => {
    const constraints = { dietaryTags: ['vegan' as const, 'gluten-free' as const], noStimulants: false }
    expect(meetsSafetyConstraints(product({ id: 'a', dietaryTags: ['vegan', 'gluten-free'] }), constraints)).toBe(true)
    expect(meetsSafetyConstraints(product({ id: 'b', dietaryTags: ['vegan'] }), constraints)).toBe(false)
  })

  it('accepts a vegan product for a vegetarian requirement', () => {
    const constraints = { dietaryTags: ['vegetarian' as const], noStimulants: false }
    expect(meetsSafetyConstraints(product({ id: 'a', dietaryTags: ['vegan'] }), constraints)).toBe(true)
  })

  it('excludes stimulants when asked to', () => {
    const constraints = { dietaryTags: [], noStimulants: true }
    expect(meetsSafetyConstraints(product({ id: 'a', hasStimulants: true }), constraints)).toBe(false)
    expect(meetsSafetyConstraints(product({ id: 'b', hasStimulants: false }), constraints)).toBe(true)
  })

  it('explains what failed, for the founder’s override warning', () => {
    const failures = failedConstraints(
      product({ id: 'a', dietaryTags: [], hasStimulants: true }),
      { dietaryTags: ['vegan'], noStimulants: true },
    )
    expect(failures).toEqual(['contains stimulants', 'not vegan'])
  })
})

describe('constraintsFor', () => {
  it('prefers the snapshot taken at checkout over re-deriving from answers', () => {
    // Their answers may have been edited since; what they agreed to at checkout
    // is what the swap must respect.
    const snapshot = { dietaryTags: ['vegan' as const], noStimulants: false, safetyFlags: [] }
    expect(constraintsFor({ safetyConstraints: snapshot }, answers({ lifestyle: [] }))).toEqual(snapshot)
  })

  it('falls back to the answers for subscriptions stored before the snapshot existed', () => {
    expect(constraintsFor({}, answers({ lifestyle: ['vegan'] })).dietaryTags).toEqual(['vegan'])
  })

  it('tops a pre-safetyFlags snapshot up from the answers', () => {
    // The snapshot predates the field, so it cannot say whether this member is
    // pregnant. The answers can, and topping up gets them the precise check
    // rather than the blunt one.
    const snapshot = { dietaryTags: ['vegan' as const], noStimulants: false }
    const merged = constraintsFor({ safetyConstraints: snapshot }, answers({ safetyFlags: ['pregnancy'] }))
    expect(merged).toEqual({ dietaryTags: ['vegan'], noStimulants: false, safetyFlags: ['pregnancy'] })
  })

  it('leaves safetyFlags undefined when there are no answers to top up from', () => {
    // Undefined is the signal that keeps the blunt check in force. Defaulting it
    // to [] here would silently hand the member full eligibility again.
    const snapshot = { dietaryTags: [], noStimulants: false }
    expect(constraintsFor({ safetyConstraints: snapshot }).safetyFlags).toBeUndefined()
  })
})

describe('safety-screen flags gate substitutions', () => {
  // The bug this covers: safetyFlags were applied when the stack was first built
  // but never carried into the snapshot a swap is judged against, so a pregnant
  // member could be auto-sent ashwagandha months later.
  const ashwagandha = product({ id: 'ashwa', contraindications: ['pregnancy'] })
  const plain = product({ id: 'plain' })

  it('refuses a product contraindicated against a flag the member ticked', () => {
    const constraints = { dietaryTags: [], noStimulants: false, safetyFlags: ['pregnancy' as const] }
    expect(meetsSafetyConstraints(ashwagandha, constraints)).toBe(false)
    expect(meetsSafetyConstraints(plain, constraints)).toBe(true)
  })

  it('allows it for a member who ticked nothing', () => {
    const constraints = { dietaryTags: [], noStimulants: false, safetyFlags: [] }
    expect(meetsSafetyConstraints(ashwagandha, constraints)).toBe(true)
  })

  it('ignores a flag the product is not contraindicated against', () => {
    const constraints = { dietaryTags: [], noStimulants: false, safetyFlags: ['shellfish' as const] }
    expect(meetsSafetyConstraints(ashwagandha, constraints)).toBe(true)
  })

  it('refuses anything contraindicated when the snapshot predates the field', () => {
    // Unknown flags must not read as "no flags" — that is the failure mode the
    // whole fix exists to close.
    const legacy = { dietaryTags: [], noStimulants: false }
    expect(meetsSafetyConstraints(ashwagandha, legacy)).toBe(false)
    expect(meetsSafetyConstraints(plain, legacy)).toBe(true)
  })

  it('carries the flags through from quiz answers', () => {
    expect(safetyConstraintsFrom(answers({ safetyFlags: ['pregnancy', 'shellfish'] })).safetyFlags)
      .toEqual(['pregnancy', 'shellfish'])
  })

  it('counts as a constraint, so the swap-risk copy fires', () => {
    expect(hasConstraints({ dietaryTags: [], noStimulants: false, safetyFlags: ['pregnancy'] })).toBe(true)
  })

  it('explains the block without naming the flag', () => {
    // A founder needs to know the product is ineligible, not which condition the
    // member declared — this string renders in the Founders Hub action queue.
    const failures = failedConstraints(ashwagandha, {
      dietaryTags: [],
      noStimulants: false,
      safetyFlags: ['pregnancy'],
    })
    expect(failures).toEqual(['not suitable for this member on safety grounds'])
    expect(failures.join(' ')).not.toMatch(/pregnan/i)
  })

  it('keeps the flag out of the member-facing description', () => {
    expect(describeConstraints({ dietaryTags: ['vegan'], noStimulants: false, safetyFlags: ['pregnancy'] }))
      .toBe('vegan')
  })
})
