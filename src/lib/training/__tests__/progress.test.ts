import { lastTime, nextStep, normaliseLog, todays, withLog, LOG_KEEP } from '../progress'
import { trainingCalendar } from '../calendar'
import { newPlan } from '../edit'
import type { TrainingPrefs } from '../types'

const prefs: TrainingPrefs = { days: [0, 2, 4], minutes: 45, focus: 'muscle', split: 'auto', equipment: 'gym', experience: 'some', avoid: [], activities: [{ day: 6, kind: 'yoga', minutes: 60 }], trainAt: 18 * 60 + 30 }
const NOW = new Date('2026-11-05T09:00:00Z') // a Thursday

describe('logging a set', () => {
  it('keeps sensible numbers and turns junk away', () => {
    expect(normaliseLog({ weightKg: 22.6, reps: 10 })).toEqual({ weightKg: 22.5, reps: 10 })
    expect(normaliseLog({ weightKg: -5, reps: 'ten' })).toBeNull()
    expect(normaliseLog({ weightKg: 0, reps: 12 })).toEqual({ weightKg: null, reps: 12 })
    expect(normaliseLog({ weightKg: 9999, reps: 5 })).toEqual({ weightKg: null, reps: 5 })
  })

  it('keeps one entry a day, newest first, and a limited history', () => {
    let plan = newPlan('u', prefs, NOW)
    plan = withLog(plan, 'goblet-squat', { on: '2026-11-01', weightKg: 20, reps: 10 })
    plan = withLog(plan, 'goblet-squat', { on: '2026-11-05', weightKg: 20, reps: 8 })
    plan = withLog(plan, 'goblet-squat', { on: '2026-11-05', weightKg: 22.5, reps: 8 })
    expect(plan.log!['goblet-squat']).toHaveLength(2)
    expect(todays(plan, 'goblet-squat', '2026-11-05')?.weightKg).toBe(22.5)
    expect(lastTime(plan, 'goblet-squat', '2026-11-05')?.on).toBe('2026-11-01')
    for (let d = 10; d < 30; d++) plan = withLog(plan, 'plank', { on: `2026-10-${d}`, weightKg: null, reps: 30 })
    expect(plan.log!.plank.length).toBe(LOG_KEEP)
  })
})

describe('the next step', () => {
  it('adds a little weight once the top of the range is reached', () => {
    expect(nextStep({ id: 'back-squat', high: 10 }, { on: 'x', weightKg: 60, reps: 10 })).toEqual({ kind: 'weight', kg: 62.5 })
    expect(nextStep({ id: 'lateral-raise', high: 15 }, { on: 'x', weightKg: 8, reps: 15 })).toEqual({ kind: 'weight', kg: 9 })
  })
  it('aims for the same again below the top', () => {
    expect(nextStep({ id: 'back-squat', high: 10 }, { on: 'x', weightKg: 60, reps: 8 })).toEqual({ kind: 'same' })
  })
  it('adds a rep, then offers the harder version, without weight', () => {
    expect(nextStep({ id: 'push-up', high: 10 }, { on: 'x', weightKg: null, reps: 10 })).toEqual({ kind: 'reps', reps: 11 })
    expect(nextStep({ id: 'incline-push-up', high: 12 }, { on: 'x', weightKg: null, reps: 16 })).toMatchObject({ kind: 'harder', id: 'push-up' })
  })
  it('adds seconds to a hold, and says nothing before a first log', () => {
    expect(nextStep({ id: 'plank', high: 40 }, { on: 'x', weightKg: null, reps: 40 })).toEqual({ kind: 'seconds', seconds: 45 })
    expect(nextStep({ id: 'plank', high: 40 }, null)).toBeNull()
  })
})

describe('the calendar file', () => {
  it('has a weekly event for every session, at their time, starting on or after today', () => {
    const plan = newPlan('u', prefs, NOW)
    const ics = trainingCalendar(plan, 'https://example.com', NOW)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(plan.sessions.length)
    expect(ics).toContain('T183000')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=12')
    // Monday is gone this week: it starts next Monday.
    expect(ics).toContain('DTSTART;TZID=Europe/London:20261109T183000')
    // Saturday is still to come.
    expect(ics).toContain('DTSTART;TZID=Europe/London:20261107T183000')
    expect(ics).toContain('https://example.com/myhub/training')
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
  })
})
