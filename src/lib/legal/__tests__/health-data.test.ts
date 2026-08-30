import { healthConsentIsCurrent, sanitiseHealthData } from '@/lib/legal/health-data'
import { HEALTH_DATA_VERSION } from '@/lib/legal/content'
import type { QuizAnswers } from '@/lib/types'

const current = { accepted: true as const, version: HEALTH_DATA_VERSION, at: '2026-08-30T10:00:00.000Z' }

function answers(over: Partial<QuizAnswers> = {}): Partial<QuizAnswers> {
  return { safetyFlags: [], ...over }
}

describe('healthConsentIsCurrent', () => {
  it('accepts a consent to the version we are serving', () => {
    expect(healthConsentIsCurrent(current)).toBe(true)
  })

  it('rejects an absent consent', () => {
    expect(healthConsentIsCurrent(null)).toBe(false)
    expect(healthConsentIsCurrent(undefined)).toBe(false)
  })

  it('rejects a consent to a superseded version', () => {
    // Agreeing to an earlier notice is not agreeing to this one — otherwise a
    // change in what we do with the data rides in on an old tick.
    expect(healthConsentIsCurrent({ ...current, version: '2019-01-01' })).toBe(false)
  })
})

describe('sanitiseHealthData', () => {
  it('keeps the flags when a current consent came with them', () => {
    const input = answers({ safetyFlags: ['pregnancy'], healthDataConsent: current })
    expect(sanitiseHealthData(input).safetyFlags).toEqual(['pregnancy'])
  })

  it('strips flags that arrive with no consent', () => {
    const input = answers({ safetyFlags: ['pregnancy', 'medication'] })
    expect(sanitiseHealthData(input).safetyFlags).toEqual([])
  })

  it('strips flags consented under a superseded version', () => {
    const input = answers({
      safetyFlags: ['shellfish'],
      healthDataConsent: { ...current, version: '2019-01-01' },
    })
    expect(sanitiseHealthData(input).safetyFlags).toEqual([])
  })

  it('does not mutate the input', () => {
    const input = answers({ safetyFlags: ['pregnancy'] })
    sanitiseHealthData(input)
    expect(input.safetyFlags).toEqual(['pregnancy'])
  })

  it('returns the same object when there is nothing to strip', () => {
    // The common path — no flags at all — should not allocate.
    const input = answers()
    expect(sanitiseHealthData(input)).toBe(input)
  })

  it('leaves everything else on the answers alone', () => {
    const input = answers({ safetyFlags: ['pregnancy'], goals: ['sleep-better'], name: 'Sam' })
    const out = sanitiseHealthData(input)
    expect(out.goals).toEqual(['sleep-better'])
    expect(out.name).toBe('Sam')
  })
})
