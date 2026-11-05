import { doseFor, withinLimits } from '../dose'
import { addActivity, changePrefs, moveSession, newPlan, rebuildSession, removeSession, rollWeek, setDone, setSets, swapExercise } from '../edit'
import { alternativesFor, buildWeek, candidatesFor, fits, mondayOf, sessionMinutes, SLOTS, templatesFor } from '../generate'
import { ACTIVITIES, EXERCISES, exerciseById } from '../library'
import { normalisePrefs, prefillPrefs } from '../prefs'
import { aiFrame, checkAiAnswer } from '../validate'
import { aiSessions, trainingSchema, trainingUserPrompt } from '../ai'
import { TRAINING_COPY } from '../copy'
import { normaliseGuideSeed } from '@/lib/guide/build'
import {
  AREAS,
  EQUIPMENT,
  EXPERIENCES,
  FOCUSES,
  MINUTES,
  SPLITS,
  type StrengthSession,
  type TrainingPrefs,
  type Weekday,
} from '../types'

const base: TrainingPrefs = {
  days: [0, 2, 4],
  minutes: 45,
  focus: 'muscle',
  split: 'auto',
  equipment: 'gym',
  experience: 'some',
  avoid: [],
  activities: [],
  trainAt: null,
}
const NOW = new Date('2026-11-04T09:00:00Z') // a Wednesday
const strength = (sessions: { type: string }[]) => sessions.filter((s): s is StrengthSession => s.type === 'strength')

describe('the library', () => {
  it('has unique ids, real ladders and four steps for every exercise', () => {
    const ids = EXERCISES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of EXERCISES) {
      expect(e.steps.length).toBeGreaterThanOrEqual(3)
      expect(e.cues.length).toBeGreaterThan(0)
      expect(e.mistakes.length).toBeGreaterThan(0)
      expect(e.tips.length).toBeGreaterThan(0)
      for (const step of [e.easier, e.harder]) {
        if (!step) continue
        expect(exerciseById(step)?.pattern).toBe(e.pattern)
      }
    }
  })

  it('never talks about health, injury or treatment', () => {
    const words = [
      ...EXERCISES.flatMap((e) => [e.name, e.kit, ...e.steps, ...e.cues, ...e.mistakes, ...e.tips]),
      ...Object.values(ACTIVITIES).flatMap((a) => [a.name, ...a.steps, ...a.tips]),
    ].join(' \n')
    expect(words).not.toMatch(/\b(health|healthy|injur\w*|cure|treat\w*|heal\w*|rehab\w*|immune|detox|fat loss|burn fat|prevent\w*|pain|doctor|physio)\b/i)
  })

  it('keeps rehab out of the plan: the copy only ever sends it to a physio', () => {
    const copy = JSON.stringify(TRAINING_COPY)
    for (const m of copy.match(/[^.]*rehab[^.]*/gi) ?? []) expect(m).toMatch(/physio/)
  })
})

describe('building a week', () => {
  it('gives every combination a full, valid week', () => {
    for (const focus of FOCUSES)
      for (const split of SPLITS)
        for (const equipment of EQUIPMENT)
          for (const experience of EXPERIENCES)
            for (const n of [1, 3, 4, 5, 6]) {
              const prefs: TrainingPrefs = { ...base, focus, split, equipment, experience, days: [0, 1, 2, 3, 4, 5, 6].slice(0, n) as Weekday[] }
              const week = strength(buildWeek(prefs, 0))
              expect(week).toHaveLength(n)
              for (const s of week) {
                expect(s.exercises.length).toBeGreaterThanOrEqual(2)
                expect(new Set(s.exercises.map((p) => p.id)).size).toBe(s.exercises.length)
                for (const p of s.exercises) {
                  const ex = exerciseById(p.id)!
                  expect(fits(ex, prefs)).toBe(true)
                  expect(withinLimits(ex, p, focus)).toBe(true)
                }
                expect(sessionMinutes(s)).toBeLessThanOrEqual(prefs.minutes + 10)
              }
            }
  })

  it('fits the length: a longer session has more in it', () => {
    const counts = MINUTES.map((minutes) => strength(buildWeek({ ...base, minutes }, 0))[0].exercises.length)
    expect([...counts].sort((a, b) => a - b)).toEqual(counts)
    expect(counts[3]).toBeGreaterThan(counts[0])
  })

  it('leaves out everything that loads an area they work around, everywhere', () => {
    for (const area of AREAS) {
      const prefs = { ...base, avoid: [area], focus: 'fitness' as const }
      for (const s of strength(buildWeek(prefs, 0))) {
        for (const id of [...s.exercises.map((p) => p.id), ...s.warmup]) expect(exerciseById(id)!.loads).not.toContain(area)
      }
    }
  })

  it('suggests a low-impact activity for endurance when knees are worked around', () => {
    const week = buildWeek({ ...base, focus: 'endurance', avoid: ['knees'] }, 0)
    const suggested = week.filter((s) => s.type === 'activity' && s.suggested)
    expect(suggested).toHaveLength(2)
    for (const s of suggested) expect(s.type === 'activity' && ACTIVITIES[s.activity].loads).toEqual([])
  })

  it('keeps the activities they do on their days, and plans around them', () => {
    const week = buildWeek({ ...base, activities: [{ day: 5, kind: 'sport', minutes: 90 }] }, 0)
    expect(week.find((s) => s.type === 'activity' && s.activity === 'sport')).toMatchObject({ day: 5, minutes: 90, suggested: false })
  })

  it('picks a split from the number of days', () => {
    expect(templatesFor(base, 4)).toEqual(['upper', 'lower', 'upper', 'lower'])
    expect(templatesFor({ ...base, split: 'ppl' }, 3)).toEqual(['push', 'pull', 'legs'])
    expect(templatesFor({ ...base, focus: 'fitness' }, 2)).toEqual(['full-a', 'conditioning'])
    expect(templatesFor({ ...base, focus: 'mobility' }, 2)).toEqual(['mobility', 'mobility'])
  })

  it('gives new lifters the simpler version first', () => {
    const squat = candidatesFor('squat', { equipment: 'gym', avoid: [], experience: 'new' })[0]
    expect(squat.level).toBe(1)
    expect(candidatesFor('hinge', { equipment: 'gym', avoid: [], experience: 'new' }).every((e) => e.level < 3)).toBe(true)
  })

  it('doses by focus: strength is heavier and fewer than endurance', () => {
    const ex = exerciseById('goblet-squat')!
    const s = doseFor(ex, 'strength', 'some')
    const e = doseFor(ex, 'endurance', 'some')
    expect(s.high).toBeLessThan(e.low)
    expect(s.restSec).toBeGreaterThan(e.restSec)
  })
})

describe('changing a plan', () => {
  const plan = () => newPlan('u1', base, NOW, 0)

  it('moves sessions with their exercises when the number of days stays the same', () => {
    const p = plan()
    const before = strength(p.sessions).map((s) => s.exercises.map((e) => e.id))
    const next = changePrefs(p, { days: [1, 3, 5] }, NOW)
    expect(strength(next.sessions).map((s) => s.day)).toEqual([1, 3, 5])
    expect(strength(next.sessions).map((s) => s.exercises.map((e) => e.id))).toEqual(before)
  })

  it('rebalances when the number of days changes', () => {
    const next = changePrefs(plan(), { days: [0, 1, 3, 4] }, NOW)
    expect(strength(next.sessions).map((s) => s.template)).toEqual(['upper', 'lower', 'upper', 'lower'])
  })

  it('does nothing for a change that changes nothing', () => {
    const p = plan()
    expect(changePrefs(p, { minutes: 45, focus: 'muscle' }, NOW)).toBe(p)
  })

  it('adds or takes away exercises for the length', () => {
    const p = plan()
    const longer = changePrefs(p, { minutes: 60 }, NOW)
    const shorter = changePrefs(p, { minutes: 20 }, NOW)
    expect(strength(longer.sessions)[0].exercises.length).toBeGreaterThan(strength(shorter.sessions)[0].exercises.length)
  })

  it('swaps every exercise to one their kit can do', () => {
    const next = changePrefs(plan(), { equipment: 'bodyweight' }, NOW)
    for (const s of strength(next.sessions)) for (const p of s.exercises) expect(exerciseById(p.id)!.equipment).toContain('bodyweight')
  })

  it('takes out what loads a new area to work around', () => {
    const next = changePrefs(plan(), { avoid: ['knees', 'shoulders'] }, NOW)
    for (const s of strength(next.sessions)) for (const p of s.exercises) expect(exerciseById(p.id)!.loads.some((a) => a === 'knees' || a === 'shoulders')).toBe(false)
  })

  it('re-doses on a new focus', () => {
    const next = changePrefs(plan(), { focus: 'strength' }, NOW)
    const first = strength(next.sessions)[0].exercises[0]
    expect(first.high).toBeLessThanOrEqual(6)
  })

  it('swaps only to a real alternative', () => {
    const p = plan()
    const s = strength(p.sessions)[0]
    const from = s.exercises[0].id
    const alt = alternativesFor(from, p.prefs, s.exercises.map((e) => e.id))[0]
    const swapped = swapExercise(p, s.id, from, alt.id, NOW)!
    expect(strength(swapped.sessions)[0].exercises[0].id).toBe(alt.id)
    expect(swapExercise(p, s.id, from, 'calf-raise', NOW)).toBeNull()
  })

  it('swaps two training sessions when one moves onto the other’s day', () => {
    const p = plan()
    const [a, b] = strength(p.sessions)
    const next = moveSession(p, a.id, b.day, NOW)
    expect(strength(next.sessions).find((s) => s.template === a.template)?.day).toBe(b.day)
    expect(strength(next.sessions).find((s) => s.template === b.template)?.day).toBe(a.day)
    expect(next.prefs.days).toEqual(p.prefs.days)
  })

  it('adds, moves and removes an activity', () => {
    let p = addActivity(plan(), { day: 6, kind: 'yoga', minutes: 60 }, NOW)
    const yoga = p.sessions.find((s) => s.type === 'activity' && s.activity === 'yoga')!
    p = moveSession(p, yoga.id, 5, NOW)
    expect(p.prefs.activities).toEqual([{ day: 5, kind: 'yoga', minutes: 60 }])
    const moved = p.sessions.find((s) => s.type === 'activity' && s.activity === 'yoga')!
    p = removeSession(p, moved.id, NOW)
    expect(p.prefs.activities).toEqual([])
    expect(p.sessions.some((s) => s.type === 'activity' && s.activity === 'yoga')).toBe(false)
  })

  it('gives the day back when a training session is removed', () => {
    const p = plan()
    const next = removeSession(p, strength(p.sessions)[1].id, NOW)
    expect(next.prefs.days).toEqual([0, 4])
    expect(strength(next.sessions)).toHaveLength(2)
  })

  it('ticks sets, and a session is done when every set is', () => {
    let p = plan()
    const s = strength(p.sessions)[0]
    for (const e of s.exercises) p = setSets(p, s.id, e.id, e.sets, NOW)
    expect(p.sessions.find((x) => x.id === s.id)?.done).toBe(true)
    p = setDone(p, s.id, false, NOW)
    expect(p.sessions.find((x) => x.id === s.id)?.done).toBe(false)
  })

  it('rebuilds one session with fresh exercises', () => {
    const p = { ...plan(), prefs: { ...base, experience: 'experienced' as const } }
    const s = strength(p.sessions)[0]
    const next = rebuildSession(p, s.id, NOW)
    expect(next.seed).toBe(p.seed + 1)
    expect(strength(next.sessions)[0].id).toBe(s.id)
  })

  it('starts a new week clean and keeps last week’s count', () => {
    let p = plan()
    p = setDone(p, p.sessions[0].id, true, NOW)
    const later = rollWeek(p, new Date('2026-11-10T09:00:00Z'))
    expect(later.weekOf).toBe('2026-11-09')
    expect(later.history[0]).toEqual({ weekOf: mondayOf(NOW), done: 1, planned: p.sessions.length })
    expect(later.sessions.every((s) => !s.done)).toBe(true)
    expect(rollWeek(later, new Date('2026-11-11T09:00:00Z'))).toBe(later)
  })
})

describe('the setup', () => {
  it('turns junk away and keeps a good setup', () => {
    expect(normalisePrefs(null)).toBeNull()
    expect(normalisePrefs({ ...base, focus: 'yoga' })).toBeNull()
    expect(normalisePrefs({ ...base, days: [], activities: [] })).toBeNull()
    const ok = normalisePrefs({ ...base, days: [4, 0, 0, 9], avoid: ['knees', 'elbows'], activities: [{ day: 1, kind: 'run', minutes: 999 }, { day: 1, kind: 'run' }] })
    expect(ok?.days).toEqual([0, 4])
    expect(ok?.avoid).toEqual(['knees'])
    expect(ok?.activities).toEqual([{ day: 1, kind: 'run', minutes: 180 }])
  })

  it('fills in from their answers: their days, focus and experience, with sport on its own day', () => {
    const draft = prefillPrefs({
      day: { wake: 420, bed: 1380, trainAt: 1080, trainDays: 5, trainWeekdays: [0, 1, 2, 3, 5], assumed: false },
      goals: ['muscle'],
      training: { types: ['strength', 'sport'], experience: 'intermediate', focus: 'hypertrophy' },
    })
    expect(draft.focus).toBe('muscle')
    expect(draft.experience).toBe('some')
    expect(draft.equipment).toBe('gym')
    expect(draft.days).toEqual([0, 1, 2, 3])
    expect(draft.activities).toEqual([{ day: 5, kind: 'sport', minutes: ACTIVITIES.sport.minutes }])
    expect(draft.trainAt).toBe(1080)
  })

  it('leaves kit and experience for them to choose when the answers don’t say', () => {
    const draft = prefillPrefs({ day: null, goals: [], training: null })
    expect(draft.equipment).toBeNull()
    expect(draft.experience).toBeNull()
    expect(draft.days).toEqual([0, 2, 4])
  })

  it('carries the training answers on the guide seed, and nothing else new', () => {
    const seed = normaliseGuideSeed({ goals: ['muscle'], training: { types: ['strength', 'nonsense'], experience: 'new', focus: 'powerlifting', symptoms: ['x'] } })
    expect(seed.training).toEqual({ types: ['strength'], experience: 'new', focus: 'powerlifting' })
    expect(normaliseGuideSeed({ goals: [] })).not.toHaveProperty('training')
  })
})

describe('AI picks, the checker decides', () => {
  const prefs: TrainingPrefs = { ...base, avoid: ['knees'], activities: [{ day: 5, kind: 'run', minutes: 30 }] }
  const frame = aiFrame(prefs, 0)
  const rulesAnswer = () => ({
    sessions: strength(buildWeek(prefs, 0)).map((s) => ({
      day: s.day,
      exercises: s.exercises.map((p) => ({ id: p.id, sets: p.sets, low: p.low, high: p.high, rest_seconds: p.restSec })),
    })),
  })

  it('never offers AI anything that loads an area they work around, and never names the area', () => {
    for (const f of frame) for (const c of f.candidates) expect(c.loads).not.toContain('knees')
    const prompt = trainingUserPrompt(prefs, frame)
    expect(prompt).not.toMatch(/"knees"|avoid|readiness|"name"|email/i)
    const schema = JSON.stringify(trainingSchema(frame))
    expect(schema).toContain('"enum"')
  })

  it('accepts an answer inside the frame', () => {
    const v = checkAiAnswer(rulesAnswer(), frame, prefs)
    expect(v.ok).toBe(true)
  })

  it('rejects anything off the library, on the wrong day, doubled or over the limits', () => {
    const off = rulesAnswer()
    off.sessions[0].exercises[0].id = 'back-squat'
    expect(checkAiAnswer(off, frame, prefs)).toEqual({ ok: false, reason: 'off-library' })
    const day = rulesAnswer()
    day.sessions[0].day = 6
    expect(checkAiAnswer(day, frame, prefs)).toEqual({ ok: false, reason: 'day' })
    const twice = rulesAnswer()
    twice.sessions[0].exercises[1] = { ...twice.sessions[0].exercises[0] }
    expect(checkAiAnswer(twice, frame, prefs)).toEqual({ ok: false, reason: 'duplicate' })
    const heavy = rulesAnswer()
    heavy.sessions[0].exercises[0].sets = 12
    expect(checkAiAnswer(heavy, frame, prefs)).toEqual({ ok: false, reason: 'limits' })
    expect(checkAiAnswer({ sessions: [] }, frame, prefs)).toEqual({ ok: false, reason: 'session-count' })
  })

  it('uses a good answer, and falls back on a bad one or an error', async () => {
    const good = await aiSessions(prefs, 0, undefined, async () => JSON.stringify(rulesAnswer()))
    expect(good?.sessions).toHaveLength(3)
    expect(await aiSessions(prefs, 0, undefined, async () => '{"sessions":[]}')).toBeNull()
    expect(
      await aiSessions(prefs, 0, undefined, async () => {
        throw new Error('timeout')
      }),
    ).toBeNull()
  })

  it('sends no store, a strict schema and only the setup', async () => {
    let sent: Record<string, unknown> | null = null
    await aiSessions(prefs, 0, 2, async (body) => {
      sent = body
      return null
    })
    expect(sent).toMatchObject({ store: false, response_format: { type: 'json_schema', json_schema: { strict: true } } })
    const user = (sent!.messages as { role: string; content: string }[])[1].content
    expect(JSON.parse(user).sessions).toHaveLength(1)
  })
})
