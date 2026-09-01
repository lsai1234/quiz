import {
  armFor, armForRun, normaliseExperiment, parseBucket, parseArm, mintBucket,
  BUCKET_COUNT, DEFAULT_QUIZ_EXPERIMENT, type QuizExperimentConfig,
} from '../assignment'

const cfg = (patch: Partial<QuizExperimentConfig> = {}): QuizExperimentConfig => ({
  ...DEFAULT_QUIZ_EXPERIMENT,
  ...patch,
})

describe('armFor', () => {
  it('sends everyone to v1 when the experiment is off', () => {
    for (let b = 0; b < BUCKET_COUNT; b++) {
      expect(armFor(b, cfg({ mode: 'off' }))).toBe('v1')
    }
  })

  it('sends everyone to v2 in all-v2 mode', () => {
    for (let b = 0; b < BUCKET_COUNT; b++) {
      expect(armFor(b, cfg({ mode: 'all-v2' }))).toBe('v2')
    }
  })

  it('splits exactly at the configured percentage', () => {
    for (const split of [0, 1, 10, 50, 99, 100]) {
      const v2 = Array.from({ length: BUCKET_COUNT }, (_, b) =>
        armFor(b, cfg({ mode: 'split', split })),
      ).filter((a) => a === 'v2').length
      expect(v2).toBe(split)
    }
  })

  it('is stable — the same bucket always lands in the same arm', () => {
    const c = cfg({ mode: 'split', split: 37 })
    for (let b = 0; b < BUCKET_COUNT; b++) {
      const first = armFor(b, c)
      for (let i = 0; i < 5; i++) expect(armFor(b, c)).toBe(first)
    }
  })

  it('falls back to v1 when there is no bucket', () => {
    expect(armFor(null, cfg({ mode: 'split', split: 100 }))).toBe('v1')
  })

  it('lets a pinned arm win, even over off', () => {
    expect(armFor(99, cfg({ mode: 'off' }), 'v2')).toBe('v2')
    expect(armFor(0, cfg({ mode: 'all-v2' }), 'v1')).toBe('v1')
  })

  it('ignores a pinned value that is not an arm', () => {
    expect(armFor(0, cfg({ mode: 'off' }), null)).toBe('v1')
  })

  it('clamps a nonsense split rather than throwing', () => {
    expect(armFor(50, cfg({ mode: 'split', split: 999 }))).toBe('v2')
    expect(armFor(50, cfg({ mode: 'split', split: -20 }))).toBe('v1')
  })
})

describe('normaliseExperiment', () => {
  it('returns the default for anything unrecognisable', () => {
    for (const junk of [null, undefined, 'off', 42, []]) {
      expect(normaliseExperiment(junk)).toEqual(DEFAULT_QUIZ_EXPERIMENT)
    }
  })

  it('defaults to off, so a half-written settings row cannot switch it on', () => {
    expect(normaliseExperiment({ split: 100 }).mode).toBe('off')
  })

  it('keeps recognised values and clamps the rest', () => {
    expect(normaliseExperiment({
      mode: 'split', split: 30, aiSteer: false,
      budget: { performance: 999, wellbeing: 1 },
    })).toEqual({
      mode: 'split', split: 30, aiSteer: false,
      budget: { performance: 14, wellbeing: 6 },
    })
  })
})

describe('cookie parsing', () => {
  it('accepts only a bucket in range', () => {
    expect(parseBucket('0')).toBe(0)
    expect(parseBucket('99')).toBe(99)
    expect(parseBucket('100')).toBeNull()
    expect(parseBucket('-1')).toBeNull()
    expect(parseBucket('7x')).toBeNull()
    expect(parseBucket('')).toBeNull()
    expect(parseBucket(undefined)).toBeNull()
  })

  it('accepts only a known arm', () => {
    expect(parseArm('v2')).toBe('v2')
    expect(parseArm('V2')).toBeNull()
    expect(parseArm('v3')).toBeNull()
  })
})

describe('mintBucket', () => {
  it('always lands in range, and spreads across it', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 4000; i++) {
      const b = mintBucket()
      expect(Number.isInteger(b)).toBe(true)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(BUCKET_COUNT)
      seen.add(b)
    }
    // 4000 draws over 100 buckets: hitting fewer than 90 would mean it is not
    // spreading, and the split would be biased.
    expect(seen.size).toBeGreaterThan(90)
  })
})

/**
 * The drinks route, and the arm it has to run on.
 *
 * A v2-arm visitor who tapped the CHRGD LQD card lost drinks mode entirely:
 * v2 never asks the two drinks questions, and finishing it overwrote the flag
 * the hero had set. They were handed a stack of tubs. Nothing errored.
 */
describe('the arm a run can actually use', () => {
  it('sends a drinks run to v1 even when the visitor is in the v2 arm', () => {
    expect(armForRun('v2', { drinksMode: true })).toBe('v1')
  })

  it('leaves an ordinary run on whichever arm it was assigned', () => {
    expect(armForRun('v2', { drinksMode: false })).toBe('v2')
    expect(armForRun('v2', {})).toBe('v2')
    expect(armForRun('v1', { drinksMode: false })).toBe('v1')
  })

  it('treats a missing flag as not drinks', () => {
    expect(armForRun('v2', { drinksMode: null })).toBe('v2')
  })
})
