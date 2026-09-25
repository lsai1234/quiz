import {
  DEFAULT_CONSULT_ROLLOUT,
  consultArmFor,
  heroOfferFor,
  normaliseConsultRollout,
  parseConsultArm,
} from '../consult'

describe('H11 consult rollout', () => {
  it('defaults to the consult as a third option', () => {
    expect(DEFAULT_CONSULT_ROLLOUT.mode).toBe('option')
    expect(heroOfferFor(10, DEFAULT_CONSULT_ROLLOUT)).toBe('both')
  })

  it('switches without a deploy: off, option and all apply to everyone', () => {
    for (let b = 0; b < 100; b += 7) {
      expect(heroOfferFor(b, { mode: 'off', split: 50 })).toBe('quiz-only')
      expect(heroOfferFor(b, { mode: 'option', split: 50 })).toBe('both')
      expect(heroOfferFor(b, { mode: 'all', split: 50 })).toBe('consult-only')
    }
  })

  it('splits traffic by bucket, in the proportion asked', () => {
    for (const split of [0, 10, 25, 50, 75, 100]) {
      const consult = Array.from({ length: 100 }, (_, b) => heroOfferFor(b, { mode: 'split', split })).filter((o) => o === 'consult-only').length
      expect(consult).toBe(split)
    }
  })

  it('keeps a visitor on the same side of the split', () => {
    expect(heroOfferFor(3, { mode: 'split', split: 50 })).toBe(heroOfferFor(3, { mode: 'split', split: 50 }))
  })

  it('reads the bucket from the other end from the quiz experiment, so the two splits don’t stack', () => {
    // The quiz's v2 half is buckets 0–49; the consult's half is 50–99.
    expect(heroOfferFor(0, { mode: 'split', split: 50 })).toBe('quiz-only')
    expect(heroOfferFor(99, { mode: 'split', split: 50 })).toBe('consult-only')
  })

  it('falls back to the quiz without a bucket', () => {
    expect(heroOfferFor(null, { mode: 'split', split: 100 })).toBe('quiz-only')
  })

  it('lets a pin win over every mode', () => {
    expect(heroOfferFor(0, { mode: 'off', split: 0 }, 'consult')).toBe('consult-only')
    expect(heroOfferFor(99, { mode: 'all', split: 100 }, 'quiz')).toBe('quiz-only')
  })

  it('normalises a bad stored setting rather than breaking the hero', () => {
    expect(normaliseConsultRollout(null)).toEqual(DEFAULT_CONSULT_ROLLOUT)
    expect(normaliseConsultRollout({ mode: 'everything', split: 400 })).toEqual({ mode: 'option', split: 100 })
    expect(parseConsultArm('nope')).toBeNull()
    expect(consultArmFor('consult-only')).toBe('consult')
  })
})
