import { emptyInterview } from '../types'
import { answerQuestion, previousQuestionId, rewindTo, setForm, setGoals, setTrack } from '../interview'
import { questionById } from '../bank'
import { CONFIRMED, NOTED, addDriver, rankedDrivers } from '../drivers'

const Q = (id: string) => questionById(id)!

function seeded() {
  let s = emptyInterview(10)
  s = setTrack(s, 'performance')
  s = setGoals(s, ['energy'])
  s = answerQuestion(s, Q('goals'), [])
  s = answerQuestion(s, Q('safety'), [])
  s = answerQuestion(s, Q('personal'), [])
  return s
}

describe('recording an answer', () => {
  it('accumulates evidence for the drivers an option implies', () => {
    const s = answerQuestion(seeded(), Q('energy-when'), ['mornings'])
    expect(s.drivers['sleep-debt']).toBeCloseTo(0.4)
    expect(s.drivers['unrefreshing-sleep']).toBeCloseTo(0.35)
  })

  it('adds up across questions and caps at total confidence', () => {
    let w = {}
    for (let i = 0; i < 10; i++) w = addDriver(w, 'sleep-debt', 0.4)
    expect(w).toEqual({ 'sleep-debt': 1 })
  })

  it('rules a driver out, and strips the evidence it had already gathered', () => {
    // Otherwise a driver could be cleared on one screen and still be scoring in
    // the engine from an earlier one.
    let s = answerQuestion(seeded(), Q('energy-when'), ['mornings'])
    expect(s.drivers['unrefreshing-sleep']).toBeGreaterThan(0)
    s = answerQuestion(s, Q('energy-mornings'), ['nights-fine'])
    expect(s.drivers['unrefreshing-sleep']).toBeUndefined()
    expect(s.drivers['sleep-debt']).toBeUndefined()
    expect(s.cleared).toContain('sleep-debt')
  })

  it('can clear one driver and raise another in the same tap', () => {
    let s = answerQuestion(seeded(), Q('energy-when'), ['mornings'])
    s = answerQuestion(s, Q('energy-mornings'), ['nights-fine'])
    // "Nights are fine" is not a dead end — it points somewhere else.
    expect(s.drivers['micronutrient-gap']).toBeGreaterThan(0)
  })

  it('records the same question once however many times it is answered', () => {
    let s = seeded()
    s = answerQuestion(s, Q('energy-when'), ['mornings'])
    s = answerQuestion(s, Q('energy-when'), ['afternoon'])
    expect(s.asked.filter((id) => id === 'energy-when')).toHaveLength(1)
    expect(s.picked['energy-when']).toEqual(['afternoon'])
  })
})

describe('stepping back', () => {
  it('discards the edited answer and everything chosen because of it', () => {
    let s = answerQuestion(seeded(), Q('energy-when'), ['mornings'])
    s = answerQuestion(s, Q('energy-mornings'), ['cant-switch-off'])
    expect(s.drivers['sleep-onset']).toBeGreaterThan(0)

    const back = rewindTo(s, 'energy-when')
    expect(back.asked).toEqual(['goals', 'safety', 'personal'])
    expect(back.drivers['sleep-onset']).toBeUndefined()
    expect(back.picked['energy-mornings']).toBeUndefined()
  })

  it('rebuilds rather than subtracting, so a changed answer leaves no residue', () => {
    // Evidence caps at 1 and so does not subtract cleanly. Rewinding recomputes
    // from the surviving answers, which is the only way a user who backs up and
    // picks differently is not left carrying weight from the path they left.
    let s = answerQuestion(seeded(), Q('energy-when'), ['mornings'])
    s = answerQuestion(s, Q('energy-mornings'), ['cant-switch-off'])

    let redone = rewindTo(s, 'energy-when')
    redone = answerQuestion(redone, Q('energy-when'), ['afternoon'])

    const fresh = answerQuestion(seeded(), Q('energy-when'), ['afternoon'])
    expect(redone.drivers).toEqual(fresh.drivers)
    expect(redone.cleared).toEqual(fresh.cleared)
  })

  it('keeps everything before the edited answer', () => {
    let s = answerQuestion(seeded(), Q('energy-when'), ['mornings'])
    s = answerQuestion(s, Q('energy-mornings'), ['cant-switch-off'])
    const back = rewindTo(s, 'energy-mornings')
    expect(back.drivers['sleep-debt']).toBeCloseTo(0.4)
  })

  it('is a no-op for a question that was never asked', () => {
    const s = seeded()
    expect(rewindTo(s, 'sleep-hours')).toBe(s)
  })

  it('names the question behind the current one', () => {
    const s = answerQuestion(seeded(), Q('energy-when'), ['mornings'])
    expect(previousQuestionId(s, 'energy-mornings')).toBe('energy-when')
    expect(previousQuestionId(s, 'safety')).toBe('goals')
    expect(previousQuestionId(emptyInterview(10), 'goals')).toBeNull()
  })
})

describe('goals and the form', () => {
  it('leads with the first goal tapped', () => {
    const s = setGoals(emptyInterview(10), ['energy', 'muscle'])
    expect(s.primaryGoal).toBe('energy')
    expect(setGoals(s, []).primaryGoal).toBeNull()
  })

  it('merges form fields without dropping the others', () => {
    let s = setForm(emptyInterview(10), { name: 'Sam' })
    s = setForm(s, { ageBracket: '35-44' })
    expect(s.form).toEqual({ name: 'Sam', ageBracket: '35-44', gender: null, weightBand: null })
  })
})

describe('which drivers count', () => {
  it('ignores anything below the noted threshold', () => {
    const ranked = rankedDrivers({ 'sleep-debt': NOTED - 0.01, 'stress-load': CONFIRMED })
    expect(ranked.map((d) => d.id)).toEqual(['stress-load'])
  })

  it('ranks strongest first', () => {
    const ranked = rankedDrivers({ 'sleep-debt': 0.4, 'stress-load': 0.9, 'joint-load': 0.6 })
    expect(ranked.map((d) => d.id)).toEqual(['stress-load', 'joint-load', 'sleep-debt'])
  })
})
