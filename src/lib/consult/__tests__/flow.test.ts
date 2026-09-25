import {
  SCENES,
  applyPlaceholder,
  firstSceneIn,
  flowReducer,
  holds,
  initialFlow,
  isAnswered,
  sceneAfter,
  sectionProgress,
  visibleScenes,
  type FlowState,
} from '../flow'
import { EMPTY_ANSWERS, type ConsultAnswers } from '../types'

const start = () => initialFlow('c_test', 0)

/** Answer every scene with its first scripted option, driving Next each time. */
function runToEnd(state: FlowState = start()): FlowState {
  let s = state
  for (let guard = 0; guard < 40 && s.phase === 'scenes'; guard++) {
    const def = SCENES.find((d) => d.id === s.sceneId)!
    const option = def.placeholder?.options[0]
    if (option) s = flowReducer(s, { type: 'answer', patch: applyPlaceholder(option, s.answers) })
    s = flowReducer(s, { type: 'next' })
  }
  return s
}

describe('the script', () => {
  it('has the twelve scenes of the plan, in order', () => {
    expect(SCENES.map((s) => s.id)).toEqual([
      'goals', 'about', 'training', 'energy', 'sleep', 'daylight',
      'caffeine', 'food', 'body', 'shelf', 'review', 'circuit',
    ])
  })

  it('gives every scene a question', () => {
    for (const s of SCENES) expect(s.copy.question.length).toBeGreaterThan(0)
  })

  it('gives every collecting scene a scripted answer, so a full run needs no widget', () => {
    for (const s of SCENES.filter((d) => d.id !== 'review')) {
      expect(s.placeholder?.options.length).toBeGreaterThan(0)
    }
  })

  it('opens neutral: what are you after, not what is wrong', () => {
    expect(SCENES[0].copy.question).toBe('What are you after?')
  })

  it('runs the circuit check in calm mode, and only the circuit check', () => {
    expect(SCENES.filter((s) => s.mode === 'calm').map((s) => s.id)).toEqual(['circuit'])
  })
})

describe('a full run on scripts', () => {
  it('works end to end and finishes in analysis', () => {
    const end = runToEnd()
    expect(end.phase).toBe('analysis')
    expect(end.history).toEqual(SCENES.map((s) => s.id).slice(0, -1))
  })

  it('passes through the review and the circuit check before anything is decided', () => {
    const end = runToEnd()
    expect(end.history).toContain('review')
    expect(end.history[end.history.length - 1]).toBe('review')
    expect(end.answers.circuit).not.toBeNull()
  })

  it('fills the battery to 100% at the end', () => {
    expect(sectionProgress(runToEnd()).every((s) => s.fill === 1)).toBe(true)
  })
})

describe('Next', () => {
  it('will not advance an unanswered scene', () => {
    const s = flowReducer(start(), { type: 'next' })
    expect(s.sceneId).toBe('goals')
  })

  it('advances once answered, sliding forward', () => {
    let s = flowReducer(start(), { type: 'answer', patch: { goals: ['energy'] } })
    s = flowReducer(s, { type: 'next' })
    expect(s.sceneId).toBe('about')
    expect(s.direction).toBe('forward')
  })
})

describe('Back', () => {
  it('retraces the path and slides the other way', () => {
    let s = flowReducer(start(), { type: 'answer', patch: { goals: ['energy'] } })
    s = flowReducer(s, { type: 'next' })
    s = flowReducer(s, { type: 'back' })
    expect(s.sceneId).toBe('goals')
    expect(s.direction).toBe('back')
  })

  it('keeps answers when going back', () => {
    let s = flowReducer(start(), { type: 'answer', patch: { goals: ['energy', 'sleep'] } })
    s = flowReducer(s, { type: 'next' })
    s = flowReducer(s, { type: 'back' })
    expect(s.answers.goals).toEqual(['energy', 'sleep'])
  })

  it('does nothing on the first scene', () => {
    expect(flowReducer(start(), { type: 'back' }).sceneId).toBe('goals')
  })
})

describe('editing from the review', () => {
  it('returns to the review with everything else intact', () => {
    const atReview = (() => {
      let s = start()
      while (s.sceneId !== 'review') {
        const def = SCENES.find((d) => d.id === s.sceneId)!
        s = flowReducer(s, { type: 'answer', patch: applyPlaceholder(def.placeholder!.options[0], s.answers) })
        s = flowReducer(s, { type: 'next' })
      }
      return s
    })()
    const before = atReview.answers

    let s = flowReducer(atReview, { type: 'jump', sceneId: 'energy', returnTo: 'review' })
    expect(s.sceneId).toBe('energy')
    expect(s.direction).toBe('back')
    s = flowReducer(s, { type: 'answer', patch: { energy: 9 } })
    s = flowReducer(s, { type: 'next' })

    expect(s.sceneId).toBe('review')
    expect(s.returnTo).toBeNull()
    expect(s.answers).toEqual({ ...before, energy: 9 })
  })
})

describe('jumping', () => {
  it('lands on the first scene of a section', () => {
    expect(firstSceneIn('rest', EMPTY_ANSWERS)).toBe('sleep')
  })

  it('refuses a scene that is not shown', () => {
    const speed = initialFlow('c', 0, { route: 'speed' })
    expect(flowReducer(speed, { type: 'jump', sceneId: 'daylight' }).sceneId).toBe(speed.sceneId)
  })
})

describe('branching', () => {
  it('evaluates conditions from JSON', () => {
    const a: ConsultAnswers = { ...EMPTY_ANSWERS, goals: ['ageing'], age: '55-64' }
    expect(holds({ answer: 'goals', includes: 'ageing' }, a)).toBe(true)
    expect(holds({ answer: 'age', in: ['55-64', '65-plus'] }, a)).toBe(true)
    expect(holds({ answer: 'route', equals: 'speed' }, a)).toBe(false)
    expect(holds({ all: [{ answer: 'goals', includes: 'ageing' }, { not: { answer: 'route', equals: 'speed' } }] }, a)).toBe(true)
    expect(holds({ any: [{ answer: 'route', equals: 'speed' }, { answer: 'age', equals: '18-24' }] }, a)).toBe(false)
  })

  it('drops the deep-charge scenes on a speed run', () => {
    const speed = visibleScenes({ ...EMPTY_ANSWERS, route: 'speed' })
    expect(speed).not.toContain('daylight')
    expect(speed).toContain('review')
    expect(speed).toContain('circuit')
  })

  it('resumes after a scene an edit has branched away', () => {
    expect(sceneAfter('daylight', { ...EMPTY_ANSWERS, route: 'speed' })).toBe('caffeine')
  })
})

describe('answered?', () => {
  it('reads a body map left blank as "all good" once you move on', () => {
    let s = initialFlow('c', 0)
    s = { ...s, sceneId: 'body' }
    expect(isAnswered('body', s.answers)).toBe(true)
    expect(s.answers.body).toBeNull()
    s = flowReducer(s, { type: 'next' })
    expect(s.sceneId).toBe('shelf')
    expect(s.answers.body).toEqual([])
  })

  it('keeps sore spots that were tapped', () => {
    let s: FlowState = { ...initialFlow('c', 0), sceneId: 'body' }
    s = flowReducer(s, { type: 'answer', patch: { body: ['knees'] } })
    s = flowReducer(s, { type: 'next' })
    expect(s.answers.body).toEqual(['knees'])
  })

  it('never reads an empty circuit check as "none of these"', () => {
    expect(isAnswered('circuit', { ...EMPTY_ANSWERS, circuit: { flags: [], none: false } })).toBe(false)
    expect(isAnswered('circuit', { ...EMPTY_ANSWERS, circuit: { flags: [], none: true } })).toBe(true)
  })
})

describe('placeholders', () => {
  it('number goals in the order tapped and stop at three', () => {
    const goals = SCENES[0].placeholder!.options
    let a = EMPTY_ANSWERS
    for (const o of goals) a = { ...a, ...applyPlaceholder(o, a) }
    expect(a.goals).toEqual(['performance', 'energy', 'sleep'])
  })
})
