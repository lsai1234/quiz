import { lastFelt, newPlan, prefsForMode, rollWeek, setFelt, setLighter, setSets, setWeekMode, trainerEdit } from '../edit'
import { bestBefore, isPersonalBest, nextStep, withLog } from '../progress'
import { exerciseById } from '../library'
import type { StrengthSession, TrainingPrefs } from '../types'

const prefs: TrainingPrefs = { days: [0, 2, 4], minutes: 60, focus: 'muscle', split: 'auto', equipment: 'gym', experience: 'some', avoid: [], activities: [{ day: 6, kind: 'yoga', minutes: 60 }], trainAt: 18 * 60 }
const NOW = new Date('2026-11-04T09:00:00Z') // a Wednesday
const strength = (p: ReturnType<typeof newPlan>) => p.sessions.filter((s): s is StrengthSession => s.type === 'strength')

describe('how it felt', () => {
  it('keeps one rating a day, and moves next time’s target', () => {
    let plan = newPlan('u', prefs, NOW)
    plan = setFelt(plan, 'back-squat', 'hard', new Date('2026-11-02T18:00:00Z'))
    plan = setFelt(plan, 'back-squat', 'easy', NOW)
    plan = setFelt(plan, 'back-squat', 'right', NOW)
    expect(plan.felt!['back-squat']).toHaveLength(2)
    expect(lastFelt(plan, 'back-squat', '2026-11-04')).toBe('hard')
    const last = { on: '2026-11-02', weightKg: 60, reps: 10 }
    // Hard holds it, even at the top of the range.
    expect(nextStep({ id: 'back-squat', high: 10 }, last, 'hard')).toEqual({ kind: 'same' })
    // Easy moves on, even short of the top.
    expect(nextStep({ id: 'back-squat', high: 12 }, last, 'easy')).toEqual({ kind: 'weight', kg: 62.5 })
    // About right (or no rating) follows the log.
    expect(nextStep({ id: 'back-squat', high: 12 }, last, 'right')).toEqual({ kind: 'same' })
  })
})

describe('a busy week, or away', () => {
  it('rebuilds the sessions not yet done, keeps done ones, and goes back to normal', () => {
    let plan = newPlan('u', prefs, NOW)
    const first = strength(plan)[0]
    plan = setSets(plan, first.id, first.exercises[0].id, 99, NOW)
    plan = { ...plan, sessions: plan.sessions.map((s) => (s.id === first.id ? { ...s, done: true } : s)) }
    const away = setWeekMode(plan, 'away', NOW)
    expect(away.weekMode?.kind).toBe('away')
    for (const s of strength(away).filter((x) => !x.done)) {
      for (const e of s.exercises) expect(exerciseById(e.id)?.equipment).toContain('bodyweight')
    }
    // The done session is untouched.
    expect(strength(away).find((s) => s.id === first.id)).toEqual(strength(plan).find((s) => s.id === first.id))
    // Back to normal: the week as it was, done ticks kept.
    const back = setWeekMode(away, null, NOW)
    expect(back.weekMode).toBeNull()
    expect(strength(back).map((s) => s.exercises.map((e) => e.id))).toEqual(strength(plan).map((s) => s.exercises.map((e) => e.id)))
    expect(strength(back).find((s) => s.id === first.id)?.done).toBe(true)
  })

  it('busy means shorter sessions', () => {
    expect(prefsForMode(prefs, 'busy').minutes).toBe(30)
    const plan = newPlan('u', prefs, NOW)
    const busy = setWeekMode(plan, 'busy', NOW)
    const before = strength(plan).reduce((n, s) => n + s.exercises.length, 0)
    const after = strength(busy).reduce((n, s) => n + s.exercises.length, 0)
    expect(after).toBeLessThan(before)
  })

  it('ends with the week: Monday puts the plan back', () => {
    const plan = setWeekMode(newPlan('u', prefs, NOW), 'away', NOW)
    const rolled = rollWeek(plan, new Date('2026-11-09T09:00:00Z'))
    expect(rolled.weekMode).toBeNull()
    const saved = strength({ ...plan, sessions: plan.weekMode!.saved })
    expect(strength(rolled).map((s) => s.exercises.map((e) => e.id))).toEqual(saved.map((s) => s.exercises.map((e) => e.id)))
  })
})

describe('not feeling it today', () => {
  it('takes a set off each exercise and the top of the range, and can be switched back', () => {
    const plan = newPlan('u', prefs, NOW)
    const s = strength(plan)[0]
    const lighter = setLighter(plan, s.id, true, NOW)
    const l = strength(lighter).find((x) => x.id === s.id)!
    expect(l.lighter).toBeTruthy()
    l.exercises.forEach((e, i) => {
      expect(e.sets).toBe(Math.max(1, s.exercises[i].sets - 1))
      expect(e.high).toBe(s.exercises[i].low)
    })
    const back = setLighter(lighter, s.id, false, NOW)
    expect(strength(back).find((x) => x.id === s.id)!.exercises.map((e) => e.sets)).toEqual(s.exercises.map((e) => e.sets))
    // Next week it's gone.
    expect(strength(rollWeek(lighter, new Date('2026-11-09T09:00:00Z'))).find((x) => x.id === s.id)!.lighter).toBeNull()
  })
})

describe('the trainer’s changes', () => {
  it('changes sets and reps within bounds, swaps only to what suits them, and says who and why', () => {
    const plan = newPlan('u', prefs, NOW)
    const s = strength(plan)[0]
    const ex = s.exercises[0]
    const by = { name: 'Sam', reason: 'Fewer sets while your knee settles', at: NOW.toISOString() }
    const changed = trainerEdit(plan, { sessionId: s.id, exerciseId: ex.id, sets: 99, low: 6, high: 4 }, by, NOW)!
    const e = strength(changed).find((x) => x.id === s.id)!.exercises.find((x) => x.id === ex.id)!
    expect(e).toMatchObject({ sets: 8, low: 6, high: 6, changedBy: by })
    expect(strength(changed).find((x) => x.id === s.id)!.changedBy).toEqual(by)
    expect(trainerEdit(plan, { sessionId: s.id, exerciseId: ex.id, swapTo: 'not-an-exercise' }, by, NOW)).toBeNull()
  })
})

describe('personal bests', () => {
  it('beat the best before today on weight, or reps at the same weight', () => {
    let plan = newPlan('u', prefs, NOW)
    plan = withLog(plan, 'back-squat', { on: '2026-10-20', weightKg: 60, reps: 8 })
    plan = withLog(plan, 'back-squat', { on: '2026-10-27', weightKg: 62.5, reps: 6 })
    const best = bestBefore(plan, 'back-squat', '2026-11-04')
    expect(best).toMatchObject({ weightKg: 62.5 })
    expect(isPersonalBest({ weightKg: 65, reps: 5 }, best)).toBe(true)
    expect(isPersonalBest({ weightKg: 62.5, reps: 7 }, best)).toBe(true)
    expect(isPersonalBest({ weightKg: 60, reps: 12 }, best)).toBe(false)
    expect(isPersonalBest({ weightKg: 60, reps: 8 }, null)).toBe(false)
  })
})
