import {
  NO_CONSTRAINTS,
  constraintsFor,
  failedConstraints,
  hasConstraints,
  meetsSafetyConstraints,
  safetyConstraintsFrom,
} from '@/lib/changes/safety'
import type { QuizAnswers } from '@/lib/types'
import { product } from './fixtures'

function answers(over: Partial<QuizAnswers> = {}): QuizAnswers {
  return { lifestyle: [], wellbeingAnswers: {}, stimPreference: null, caffeineLevel: null, ...over } as QuizAnswers
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
    const snapshot = { dietaryTags: ['vegan' as const], noStimulants: false }
    expect(constraintsFor({ safetyConstraints: snapshot }, answers())).toBe(snapshot)
  })

  it('falls back to the answers for subscriptions stored before the snapshot existed', () => {
    expect(constraintsFor({}, answers({ lifestyle: ['vegan'] })).dietaryTags).toEqual(['vegan'])
  })
})
