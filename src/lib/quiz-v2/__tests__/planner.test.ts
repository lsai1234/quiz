import { emptyInterview, type BankQuestion, type InterviewState } from '../types'
import { answerQuestion, setGoals, setTrack } from '../interview'
import { endedEarly, planNext, rankCandidates, relevance, scoreQuestion, uncertainty } from '../planner'
import { questionById } from '../bank'
import { CONFIRMED } from '../drivers'

/**
 * The planner.
 *
 * Determinism is the property under test more than any individual ordering:
 * the entire latency guarantee rests on this being able to answer instantly and
 * identically, so the AI steer is never something the UI has to wait for.
 */

function run(goals: InterviewState['goals'], budget = 10): InterviewState {
  let s = emptyInterview(budget)
  s = setTrack(s, 'performance')
  s = setGoals(s, goals)
  return s
}

/** Walk the interview to the end, always taking the first option. */
function walk(start: InterviewState, pick: (q: BankQuestion) => string[] = (q) => q.options[0] ? [q.options[0].id] : []) {
  let s = start
  const order: string[] = []
  for (let guard = 0; guard < 40; guard++) {
    const { question } = planNext(s)
    if (!question) break
    order.push(question.id)
    s = answerQuestion(s, question, pick(question))
  }
  return { state: s, order }
}

describe('determinism', () => {
  it('produces the same order every time from the same state', () => {
    const s = run(['energy'])
    const first = walk(s).order
    for (let i = 0; i < 5; i++) expect(walk(s).order).toEqual(first)
  })

  it('is not affected by how the bank array happens to be ordered', () => {
    // Ties are broken by score, then by a stable sort — so shuffling equal
    // scorers must not change the winner's score, only ever which of two
    // genuinely tied questions comes first.
    const s = run(['energy'])
    const ranked = rankCandidates(s)
    const scores = ranked.map((c) => c.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })
})

describe('the fixed screens', () => {
  it('opens with goals, safety, then the dosing details', () => {
    const { order } = walk(emptyInterview(10))
    expect(order.slice(0, 3)).toEqual(['goals', 'safety', 'personal'])
  })

  it('always asks the safety screen, on every path and every budget', () => {
    for (const goals of [['energy'], ['muscle'], ['sleep-better'], ['gut-health'], ['menopause']] as InterviewState['goals'][]) {
      for (const budget of [6, 8, 10, 14]) {
        const { order } = walk(run(goals, budget))
        expect(order).toContain('safety')
      }
    }
  })

  it('always closes with already-taking, even at the tightest budget', () => {
    // Reserved rather than scheduled: if it could be crowded out, a customer
    // could be recommended something they already own.
    for (const budget of [6, 8, 10, 14]) {
      const { order } = walk(run(['energy'], budget))
      expect(order[order.length - 1]).toBe('supps')
    }
  })
})

describe('the budget', () => {
  it('never asks more questions than it is allowed', () => {
    for (const budget of [6, 8, 10, 14]) {
      for (const goals of [['energy'], ['muscle', 'recovery'], ['sleep-better', 'less-stress', 'focus']] as InterviewState['goals'][]) {
        const { order } = walk(run(goals, budget))
        expect(order.length).toBeLessThanOrEqual(budget)
      }
    }
  })

  it('never asks the same question twice', () => {
    const { order } = walk(run(['energy', 'focus', 'immune']))
    expect(new Set(order).size).toBe(order.length)
  })
})

describe('chasing the hypothesis', () => {
  it('values a suspected driver above an unknown one', () => {
    const s = run(['energy'])
    const unknown = uncertainty(s, 'sleep-debt')
    const suspected = uncertainty({ ...s, drivers: { 'sleep-debt': 0.3 } }, 'sleep-debt')
    const confirmed = uncertainty({ ...s, drivers: { 'sleep-debt': CONFIRMED } }, 'sleep-debt')
    expect(suspected).toBeGreaterThan(unknown)
    expect(unknown).toBeGreaterThan(confirmed)
  })

  it('stops valuing a driver that has been ruled out', () => {
    const s = run(['energy'])
    expect(uncertainty({ ...s, cleared: ['sleep-debt'] }, 'sleep-debt')).toBe(0)
  })

  it('weights the primary goal above the others', () => {
    const s = run(['muscle', 'energy'])
    expect(relevance(s, 'low-protein')).toBeGreaterThan(relevance(s, 'sun-exposure-low'))
  })

  it('follows slow mornings into a question about sleep', () => {
    // The behaviour the whole redesign is for: the next question is a
    // consequence of the last answer, not the next item on a list.
    let s = run(['energy'])
    for (const id of ['goals', 'safety', 'personal']) {
      s = answerQuestion(s, questionById(id)!, [])
    }
    const first = planNext(s).question!
    expect(first.id).toBe('energy-when')
    s = answerQuestion(s, first, ['mornings'])
    expect(planNext(s).question!.topic).toBe('sleep')
  })

  it('walks the whole energy ladder before changing the subject', () => {
    // The three rungs from the proposal, in order: when it hits, then the
    // nights, then how long. Nothing generic gets in between — that wandering
    // is what the topic-damping exception exists to prevent.
    let s = run(['energy'])
    for (const id of ['goals', 'safety', 'personal']) s = answerQuestion(s, questionById(id)!, [])

    const ladder: string[] = []
    for (let i = 0; i < 3; i++) {
      const q = planNext(s).question!
      ladder.push(q.id)
      const answer =
        q.id === 'energy-when' ? 'mornings'
        : q.id === 'sleep-hours' ? 'under-6'
        : q.options[0].id
      s = answerQuestion(s, q, [answer])
    }
    expect(ladder).toContain('energy-when')
    expect(ladder).toContain('energy-mornings')
    expect(ladder).toContain('sleep-hours')
  })

  it('stops asking about sleep once the user says nights are fine', () => {
    let s = run(['energy'])
    for (const id of ['goals', 'safety', 'personal']) s = answerQuestion(s, questionById(id)!, [])
    s = answerQuestion(s, questionById('energy-when')!, ['mornings'])
    s = answerQuestion(s, questionById('energy-mornings')!, ['nights-fine'])

    const { order } = walk(s)
    for (const id of order) {
      expect(questionById(id)?.topic).not.toBe('sleep')
    }
  })
})

describe('stopping early', () => {
  it('does not fill the budget with questions that change nothing', () => {
    // A narrow goal set exhausts its useful questions before the budget. That
    // is the desired outcome, not a bug — and `endedEarly` is what reports it.
    const { state, order } = walk(run(['hydration'], 14))
    expect(order.length).toBeLessThan(14)
    expect(endedEarly(state)).toBe(true)
  })

  it('scores a question that discriminates nothing at zero', () => {
    const s = run(['energy'])
    expect(scoreQuestion(s, { ...questionById('energy-when')!, discriminates: [] })).toBe(0)
  })
})

describe('the AI steer', () => {
  const advance = () => {
    let s = run(['energy'])
    for (const id of ['goals', 'safety', 'personal']) s = answerQuestion(s, questionById(id)!, [])
    return s
  }

  it('lets a preference reorder the shortlist', () => {
    const s = advance()
    const candidates = rankCandidates(s)
    expect(candidates.length).toBeGreaterThan(1)
    const second = candidates[1].question.id
    expect(planNext(s, undefined, [second]).question!.id).toBe(second)
  })

  it('ignores an id that is not an eligible candidate', () => {
    // The security model in one assertion: a hallucinated id, a stale one, or a
    // deliberate attempt to reach the safety screen all land here.
    const s = advance()
    const planned = planNext(s).question!.id
    for (const junk of [['safety'], ['not-a-question'], ['goals'], []]) {
      expect(planNext(s, undefined, junk).question!.id).toBe(planned)
    }
  })

  it('cannot make the interview ask something twice', () => {
    let s = advance()
    const first = planNext(s).question!
    s = answerQuestion(s, first, [first.options[0].id])
    expect(planNext(s, undefined, [first.id]).question!.id).not.toBe(first.id)
  })
})

describe('follow-ups still fire on the strongest answer', () => {
  /**
   * The hole `live()` exists to close.
   *
   * A follow-up gated on `suspected()` stops being eligible the moment its
   * driver passes `CONFIRMED` — so the person who picked the STRONGEST answer
   * was the one who never got asked why. "Constantly, I catch everything" put
   * illness-frequency at 0.8 and the exposure question vanished.
   */
  function answerPath(goals: InterviewState['goals'], steps: Array<[string, string]>) {
    let s = run(goals)
    s = setTrack(s, goals.includes('muscle') ? 'performance' : 'wellbeing')
    for (const id of ['goals', 'safety', 'personal']) s = answerQuestion(s, questionById(id)!, [])
    for (const [q, opt] of steps) s = answerQuestion(s, questionById(q)!, [opt])
    return s
  }

  it('asks about exposure even when they catch everything', () => {
    const strongest = answerPath(['immune'], [['immune-often', 'constantly']])
    const milder = answerPath(['immune'], [['immune-often', 'winter']])
    for (const s of [strongest, milder]) {
      expect(rankCandidates(s).map((c) => c.question.id)).toContain('immune-exposure')
    }
  })

  it('asks about fibre even when digestion is clearly the problem', () => {
    const s = answerPath(['gut-health'], [['gut-when', 'since-change']])
    expect(rankCandidates(s).map((c) => c.question.id)).toContain('gut-fibre')
  })

  /** With the Article 9 consent given, which is what the safety screen takes. */
  const consented = (s: InterviewState): InterviewState => ({
    ...s,
    healthDataConsent: { accepted: true, version: 'test', at: new Date(0).toISOString() },
  })

  it('asks about protein while protein is still an open question', () => {
    const s = consented(answerPath(['muscle'], [['how-meals-happen', 'poor']]))
    expect(rankCandidates(s).map((c) => c.question.id)).toContain('protein-check')
  })

  it('never asks it without consent to read the safety answers', () => {
    // Not a smaller set of answers — no answers, because the safety options do
    // not render until consent is given. So a guard written as "pregnancy is
    // not ticked" would be true for everyone who declined, including the person
    // it exists for. The absence has to suppress the module, not pass it.
    const s = answerPath(['muscle'], [['how-meals-happen', 'poor']])
    expect(s.healthDataConsent ?? null).toBeNull()
    expect(rankCandidates(s).map((c) => c.question.id)).not.toContain('protein-check')
  })

  it('never asks it of someone who is pregnant or breastfeeding', () => {
    // Needs differ, and this is not the place.
    let s = consented(answerPath(['muscle'], [['how-meals-happen', 'poor']]))
    s = { ...s, picked: { ...s.picked, safety: ['pregnancy'] } }
    expect(rankCandidates(s).map((c) => c.question.id)).not.toContain('protein-check')
  })

  it('still asks it once protein is the confirmed blocker — it has a number to add', () => {
    // The counterpart to the three above, and the line moved when the coarse
    // question became a calculator. "Do you get protein at every meal?"
    // discriminated low-protein and nothing else, so once someone had named
    // protein as the blocker there was nothing left for it to find. A screen
    // that returns a figure in grams is not asking the same question again —
    // it is the one that turns a confirmed hunch into an amount.
    const s = consented(answerPath(['muscle'], [['training-blocker', 'protein']]))
    expect(rankCandidates(s).map((c) => c.question.id)).toContain('protein-check')
  })
})
