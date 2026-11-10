import { newPlan, rollWeek, setDone } from '../edit'
import { cooldownFor } from '../cooldown'
import { milestones, newGoal, tickMilestone, withGoalDone } from '../goals'
import { exerciseById } from '../library'
import { missedSessions, nextFreeDay, rehome } from '../missed'
import { applyProgrammeWeek, programmeStatus, startProgramme, testComparison, weekKind } from '../programme'
import { withLog } from '../progress'
import { progressView } from '../progress-view'
import type { StrengthSession, TrainingPlan, TrainingPrefs } from '../types'

const prefs: TrainingPrefs = { days: [0, 2, 4], minutes: 45, focus: 'muscle', split: 'auto', equipment: 'gym', experience: 'some', avoid: [], activities: [{ day: 5, kind: 'run', minutes: 30 }], trainAt: 18 * 60 }
const MON = new Date('2026-11-02T09:00:00Z')
const strength = (p: TrainingPlan) => p.sessions.filter((s): s is StrengthSession => s.type === 'strength')

describe('programmes', () => {
  it('shapes 8 and 12 weeks: foundation, a lighter fourth week, build, a test week at the end', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => weekKind(n, 8))).toEqual(['foundation', 'foundation', 'foundation', 'lighter', 'build', 'build', 'build', 'test'])
    expect([4, 8, 9, 12].map((n) => weekKind(n, 12))).toEqual(['lighter', 'lighter', 'build', 'test'])
  })

  it('makes week 4 lighter on the Monday, and puts the full sessions back the Monday after', () => {
    let plan = startProgramme(newPlan('u', prefs, MON), 8, '2026-11-02')
    const full = strength(plan).map((s) => s.exercises.map((e) => e.sets))
    plan = rollWeek(rollWeek(rollWeek(plan, new Date('2026-11-09T09:00:00Z')), new Date('2026-11-16T09:00:00Z')), new Date('2026-11-23T09:00:00Z'))
    expect(programmeStatus(plan.programme!, plan.weekOf)).toMatchObject({ week: 4, kind: 'lighter' })
    expect(strength(plan).every((s) => s.lighter)).toBe(true)
    expect(strength(plan).map((s) => s.exercises.map((e) => e.sets))).toEqual(full.map((xs) => xs.map((n) => Math.max(1, n - 1))))
    plan = rollWeek(plan, new Date('2026-11-30T09:00:00Z'))
    expect(strength(plan).map((s) => s.exercises.map((e) => e.sets))).toEqual(full)
    // Applying twice changes nothing.
    expect(applyProgrammeWeek(applyProgrammeWeek(plan))).toEqual(plan)
  })

  it('sets week 1 against the test week, only for lifts logged in both, and knows when it has finished', () => {
    let plan = startProgramme(newPlan('u', prefs, MON), 8, '2026-11-02')
    plan = withLog(plan, 'goblet-squat', { on: '2026-11-03', weightKg: 16, reps: 8 })
    plan = withLog(plan, 'goblet-squat', { on: '2026-12-22', weightKg: 22, reps: 8 })
    plan = withLog(plan, 'db-row', { on: '2026-11-03', weightKg: 14, reps: 10 })
    expect(testComparison(plan)).toEqual([{ exerciseId: 'goblet-squat', first: { weightKg: 16, reps: 8 }, test: { weightKg: 22, reps: 8 }, up: true }])
    expect(programmeStatus(plan.programme!, '2026-12-21').kind).toBe('test')
    expect(programmeStatus(plan.programme!, '2026-12-28')).toMatchObject({ week: null, finished: true })
  })
})

describe('goals', () => {
  it('a lift goal ticks quarter points from the log, and refuses a target below their best', () => {
    let plan = withLog(newPlan('u', prefs, MON), 'goblet-squat', { on: '2026-11-01', weightKg: 16, reps: 8 })
    expect(newGoal(plan, { kind: 'lift', exerciseId: 'goblet-squat', targetKg: 12 }, MON)).toBeNull()
    expect(newGoal(plan, { kind: 'lift', exerciseId: 'plank', targetKg: 20 }, MON)).toBeNull()
    const goal = newGoal(plan, { kind: 'lift', exerciseId: 'goblet-squat', targetKg: 24 }, MON)!
    plan = { ...plan, goal }
    expect(milestones(plan, goal).map((m) => m.value)).toEqual([18, 20, 22, 24])
    plan = withLog(plan, 'goblet-squat', { on: '2026-11-10', weightKg: 20, reps: 8 })
    expect(milestones(plan, goal).map((m) => m.done)).toEqual([true, true, false, false])
    plan = withGoalDone(withLog(plan, 'goblet-squat', { on: '2026-11-24', weightKg: 24, reps: 6 }), new Date('2026-11-24T19:00:00Z'))
    expect(plan.goal?.doneOn).toBe('2026-11-24')
  })

  it('counts runs done and weeks with three sessions as totals, never in a row; 5 km is theirs to tick', () => {
    let plan: TrainingPlan = { ...newPlan('u', prefs, MON), goal: newGoal(newPlan('u', prefs, MON), { kind: 'run-5k' }, MON)! }
    const run = plan.sessions.find((s) => s.type === 'activity')!
    plan = setDone(plan, run.id, true, new Date('2026-11-07T10:00:00Z'))
    expect(milestones(plan, plan.goal!).filter((m) => m.done).map((m) => m.id)).toEqual(['runs-1'])
    plan = tickMilestone(plan, 'ran-5k', MON)
    expect(milestones(plan, plan.goal!).find((m) => m.id === 'ran-5k')?.done).toBe(true)
    // A milestone the log decides can't be ticked by hand.
    expect(tickMilestone(plan, 'runs-10', MON)).toBe(plan)

    const three = { ...newPlan('u', prefs, MON), goal: newGoal(newPlan('u', prefs, MON), { kind: 'three-a-week' }, MON)! }
    const withWeeks = { ...three, history: [{ weekOf: '2026-11-30', done: 3, planned: 4 }, { weekOf: '2026-11-23', done: 1, planned: 4 }, { weekOf: '2026-11-16', done: 4, planned: 4 }] }
    expect(milestones(withWeeks, withWeeks.goal).map((m) => m.done)).toEqual([true, false, false, false])
  })
})

describe('a missed session finds a home', () => {
  it('moves to the next free day this week, goes back on Monday, or is dropped with nothing to catch up', () => {
    const plan = newPlan('u', prefs, MON) // Mon, Wed, Fri strength; Sat run
    const mon = plan.sessions.find((s) => s.day === 0)!
    expect(missedSessions(plan, 3, '2026-11-02').map((s) => s.id)).toEqual(expect.arrayContaining([mon.id]))
    expect(nextFreeDay(plan, 3)).toBe(3) // Thursday
    const moved = rehome(plan, mon.id, 3, MON)
    expect(moved.sessions.find((s) => s.id === mon.id)).toMatchObject({ day: 3, movedFrom: 0 })
    expect(missedSessions(moved, 3, '2026-11-02').some((s) => s.id === mon.id)).toBe(false)
    const next = rollWeek(moved, new Date('2026-11-09T09:00:00Z'))
    expect(next.sessions.find((s) => s.id === mon.id)).toMatchObject({ day: 0, movedFrom: null })

    const dropped = rehome(plan, mon.id, null, MON)
    expect(dropped.sessions.find((s) => s.id === mon.id)?.skipped).toBe(true)
    expect(rollWeek(dropped, new Date('2026-11-09T09:00:00Z')).sessions.find((s) => s.id === mon.id)?.skipped).toBe(false)
  })
})

describe('warm-up and cool-down', () => {
  it('stretches what the session worked, never anything that loads an area they work around', () => {
    const plan = newPlan('u', { ...prefs, avoid: ['lower-back'] }, MON)
    for (const s of strength(plan)) {
      const c = cooldownFor(s, plan.prefs)
      expect(c.cooldown.length).toBeGreaterThan(0)
      for (const id of [...c.cooldown, ...c.addOns]) {
        expect(exerciseById(id)?.role).toBe('mobility')
        expect(exerciseById(id)?.loads).not.toContain('lower-back')
      }
      if (c.ramp) expect(s.exercises.some((e) => e.id === c.ramp)).toBe(true)
    }
  })
})

describe('the progress page', () => {
  it('counts this month against last, finds personal bests with dates, and the muscles ticked this week', () => {
    let plan = newPlan('u', prefs, new Date('2026-11-16T09:00:00Z'))
    plan = { ...plan, history: [{ weekOf: '2026-11-09', done: 3, planned: 4 }, { weekOf: '2026-10-26', done: 2, planned: 4 }] }
    plan = withLog(plan, 'goblet-squat', { on: '2026-10-28', weightKg: 16, reps: 8 })
    plan = withLog(plan, 'goblet-squat', { on: '2026-11-11', weightKg: 18, reps: 8 })
    const first = strength(plan)[0]
    plan = { ...plan, sessions: plan.sessions.map((s) => (s.id === first.id && s.type === 'strength' ? { ...s, done: true, exercises: s.exercises.map((e) => ({ ...e, doneSets: e.sets })) } : s)) }
    const v = progressView(plan, new Date('2026-11-18T09:00:00Z'))
    expect(v.thisMonth).toEqual({ sessions: 4, bests: 1 })
    expect(v.lastMonth).toEqual({ sessions: 2, bests: 0 })
    expect(v.bests[0]).toMatchObject({ exerciseId: 'goblet-squat', entry: { on: '2026-11-11' } })
    expect(v.lifts[0].points.map((p) => p.value)).toEqual([16, 18])
    expect(Object.values(v.worked).some((n) => (n ?? 0) > 0)).toBe(true)
  })
})
