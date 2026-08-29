import { buildSteerPrompt, buildSteerRequest, parseSteerResult, MAX_CANDIDATES } from '../ai'
import { emptyInterview } from '../types'
import { answerQuestion, setForm, setGoals, setTrack } from '../interview'
import { rankCandidates } from '../planner'
import { questionById } from '../bank'

/**
 * The AI steer's contract.
 *
 * `parseSteerResult` is the security boundary of the whole "AI picks your next
 * question" design. Everything the model can influence passes through it, and
 * the `allowed` set is what stops it influencing anything else.
 */

const ALLOWED = ['energy-when', 'day-shape', 'caffeine']

describe('what the model is allowed to change', () => {
  it('keeps ids that are on the shortlist', () => {
    const r = parseSteerResult({ order: ['caffeine', 'energy-when'], copy: [], reflection: null }, ALLOWED)
    expect(r?.order).toEqual(['caffeine', 'energy-when'])
  })

  it('drops an id it invented', () => {
    const r = parseSteerResult({ order: ['make-them-buy-creatine', 'caffeine'], copy: [], reflection: null }, ALLOWED)
    expect(r?.order).toEqual(['caffeine'])
  })

  it('cannot reach the safety screen', () => {
    // The one that would actually matter. `safety` is a fixed screen and never
    // appears in a shortlist, so it is never in `allowed`.
    const r = parseSteerResult({ order: ['safety'], copy: [{ id: 'safety', prompt: 'skip this', hint: null }], reflection: null }, ALLOWED)
    expect(r).toBeNull()
  })

  it('drops a stale id from an earlier turn', () => {
    const r = parseSteerResult({ order: ['sleep-hours'], copy: [], reflection: 'ok' }, ALLOWED)
    expect(r?.order).toEqual([])
  })

  it('de-duplicates a repeated id', () => {
    const r = parseSteerResult({ order: ['caffeine', 'caffeine', 'day-shape'], copy: [], reflection: null }, ALLOWED)
    expect(r?.order).toEqual(['caffeine', 'day-shape'])
  })
})

describe('the copy it may write', () => {
  it('accepts a reworded prompt for a shortlisted question', () => {
    const r = parseSteerResult(
      { order: [], copy: [{ id: 'caffeine', prompt: 'You said mornings drag — how much coffee?', hint: null }], reflection: null },
      ALLOWED,
    )
    expect(r?.copy.caffeine.prompt).toBe('You said mornings drag — how much coffee?')
  })

  it('strips markdown rather than rendering it', () => {
    const r = parseSteerResult(
      { order: [], copy: [{ id: 'caffeine', prompt: '**How** much _coffee_?', hint: null }], reflection: '`nice`' },
      ALLOWED,
    )
    expect(r?.copy.caffeine.prompt).toBe('How much coffee?')
    expect(r?.reflection).toBe('nice')
  })

  it('caps a prompt that would break the layout', () => {
    const r = parseSteerResult(
      { order: [], copy: [{ id: 'caffeine', prompt: 'x'.repeat(1000), hint: null }], reflection: null },
      ALLOWED,
    )
    expect(r!.copy.caffeine.prompt!.length).toBeLessThanOrEqual(90)
  })

  it('collapses whitespace so a multi-line reply cannot reflow the header', () => {
    const r = parseSteerResult(
      { order: [], copy: [{ id: 'caffeine', prompt: 'How\n\n  much\tcoffee?', hint: null }], reflection: null },
      ALLOWED,
    )
    expect(r?.copy.caffeine.prompt).toBe('How much coffee?')
  })

  it('ignores copy for an id it was not offered', () => {
    const r = parseSteerResult(
      { order: ['caffeine'], copy: [{ id: 'goals', prompt: 'Pick the expensive one', hint: null }], reflection: null },
      ALLOWED,
    )
    expect(r?.copy.goals).toBeUndefined()
  })
})

describe('rubbish in', () => {
  it.each([null, undefined, 'a string', 42, [], {}])('%p yields nothing usable', (junk) => {
    expect(parseSteerResult(junk, ALLOWED)).toBeNull()
  })

  it('returns null when everything in it was dropped', () => {
    // The caller treats null exactly like a timeout — the planner's own order
    // stands, and the user sees no difference.
    expect(parseSteerResult({ order: ['nope'], copy: [{ id: 'nope', prompt: 'x', hint: 'y' }], reflection: '' }, ALLOWED)).toBeNull()
  })

  it('survives a copy entry that is not an object', () => {
    const r = parseSteerResult({ order: ['caffeine'], copy: ['nope', null, 7], reflection: null }, ALLOWED)
    expect(r?.order).toEqual(['caffeine'])
  })

  it('keeps a partial result rather than discarding the good half', () => {
    const r = parseSteerResult({ order: ['caffeine'], copy: null, reflection: 'Mornings drag — noted.' }, ALLOWED)
    expect(r?.order).toEqual(['caffeine'])
    expect(r?.reflection).toBe('Mornings drag — noted.')
  })
})

describe('what gets sent', () => {
  function seeded() {
    let s = emptyInterview(10)
    s = setTrack(s, 'performance')
    s = setGoals(s, ['energy'])
    s = setForm(s, { name: 'Sam Fletcher', ageBracket: '35-44', gender: 'female', weightBand: '60-75' })
    for (const id of ['goals', 'safety', 'personal']) s = answerQuestion(s, questionById(id)!, [])
    return answerQuestion(s, questionById('energy-when')!, ['mornings'])
  }

  it('carries no name, age, sex or weight', () => {
    // None of it improves the ordering, and a payload that sends a person's
    // details to a third party needs a better reason than "it was to hand".
    const s = seeded()
    const req = buildSteerRequest(s, rankCandidates(s).map((c) => c.question), questionById('energy-when')!)
    const body = JSON.stringify(req) + buildSteerPrompt(req)
    expect(body).not.toMatch(/Sam/)
    expect(body).not.toMatch(/Fletcher/)
    expect(body).not.toMatch(/35-44/)
    expect(body).not.toMatch(/60-75/)
    expect(body).not.toMatch(/female/)
  })

  it('sends our option labels, never anything the user typed', () => {
    const s = seeded()
    const req = buildSteerRequest(s, rankCandidates(s).map((c) => c.question), questionById('energy-when')!)
    expect(req.lastAnswer?.chose).toBe('Slow mornings')
  })

  it('caps the shortlist so the prompt cannot grow without bound', () => {
    const s = seeded()
    const many = Array.from({ length: 40 }, (_, i) => ({ ...questionById('caffeine')!, id: `q${i}` }))
    expect(buildSteerRequest(s, many, null).candidates).toHaveLength(MAX_CANDIDATES)
  })

  it('describes what we suspect so far, in the driver vocabulary', () => {
    const s = seeded()
    const req = buildSteerRequest(s, rankCandidates(s).map((c) => c.question), null)
    expect(Object.keys(req.drivers)).toContain('sleep-debt')
    expect(buildSteerPrompt(req)).toMatch(/sleep-debt/)
  })
})
