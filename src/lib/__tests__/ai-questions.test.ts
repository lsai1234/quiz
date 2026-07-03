import {
  parseQuestionsResult,
  withDeepDiveSignals,
  fallbackQuestions,
  deepDiveKey,
  buildQuestionsPrompt,
  SIGNAL_TAGS,
  MAX_QUESTIONS,
} from '../ai-questions'
import { buildBlueprintPrompt } from '../ai-stack'
import type { QuizAnswers } from '@/lib/types'

function makeAnswers(overrides: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'Test User',
    track: 'performance',
    ageBracket: '25-34',
    exactAge: null,
    gender: 'male',
    goals: ['muscle', 'energy'],
    trainingFrequency: '3-4x',
    trainingType: ['strength'],
    lifestyle: ['desk-job'],
    diet: 'mostly-good',
    currentSupplements: [],
    currentVitamins: [],
    preferredFormats: [],
    wellbeingAnswers: {},
    dynamicAnswers: {},
    caffeineLevel: 'medium',
    budget: '50-80',
    stackPreference: 'balanced',
    trainingExperience: null,
    trainingFocus: null,
    stimPreference: null,
    trainingTime: null,
    ...overrides,
  }
}

const validQuestion = (id = 'energy-dip') => ({
  id,
  question: 'When does your energy usually dip?',
  hint: 'The pattern points to different support',
  options: [
    { id: 'morning', label: 'Slow mornings', sub: null, signals: ['poor-sleep'] },
    { id: 'afternoon', label: 'Afternoon slump', sub: 'Around 3pm', signals: [] },
    { id: 'steady', label: 'Fairly steady', sub: null, signals: [] },
  ],
})

describe('parseQuestionsResult', () => {
  it('accepts a valid payload and preserves content', () => {
    const parsed = parseQuestionsResult({ questions: [validQuestion()] })
    expect(parsed).toHaveLength(1)
    expect(parsed![0].id).toBe('energy-dip')
    expect(parsed![0].options).toHaveLength(3)
    expect(parsed![0].options[0].signals).toEqual(['poor-sleep'])
    expect(parsed![0].options[1].sub).toBe('Around 3pm')
    expect(parsed![0].options[0].sub).toBeUndefined()
  })

  it('returns null for garbage', () => {
    expect(parseQuestionsResult(null)).toBeNull()
    expect(parseQuestionsResult('nope')).toBeNull()
    expect(parseQuestionsResult({})).toBeNull()
    expect(parseQuestionsResult({ questions: 'x' })).toBeNull()
    expect(parseQuestionsResult({ questions: [] })).toBeNull()
  })

  it('drops questions with missing fields or too few options', () => {
    const bad1 = { ...validQuestion('a'), question: '' }
    const bad2 = { ...validQuestion('b'), options: [validQuestion().options[0]] }
    const parsed = parseQuestionsResult({ questions: [bad1, bad2, validQuestion('c')] })
    expect(parsed).toHaveLength(1)
    expect(parsed![0].id).toBe('c')
  })

  it('filters signals outside the whitelist', () => {
    const q = validQuestion()
    q.options[0].signals = ['poor-sleep', 'vegan', 'made-up-tag']
    const parsed = parseQuestionsResult({ questions: [q] })
    expect(parsed![0].options[0].signals).toEqual(['poor-sleep'])
  })

  it('dedupes question and option ids', () => {
    const parsed = parseQuestionsResult({ questions: [validQuestion('same'), validQuestion('same')] })
    expect(parsed).toHaveLength(1)

    const q = validQuestion()
    q.options = [q.options[0], { ...q.options[1], id: 'morning' }, q.options[2]]
    const parsed2 = parseQuestionsResult({ questions: [q] })
    expect(parsed2![0].options.map(o => o.id)).toEqual(['morning', 'steady'])
  })

  it('caps the number of questions', () => {
    const many = Array.from({ length: 6 }, (_, i) => validQuestion(`q-${i}`))
    const parsed = parseQuestionsResult({ questions: many })
    expect(parsed).toHaveLength(MAX_QUESTIONS)
  })

  it('strips markdown from text fields and normalises ids', () => {
    const q = validQuestion()
    q.question = '**When** does your energy dip?'
    q.id = 'Energy Dip!'
    const parsed = parseQuestionsResult({ questions: [q] })
    expect(parsed![0].question).toBe('When does your energy dip?')
    expect(parsed![0].id).toBe('energy-dip')
  })
})

describe('withDeepDiveSignals', () => {
  it('unions whitelisted signals into lifestyle without duplicates', () => {
    const answers = makeAnswers({
      lifestyle: ['desk-job'],
      dynamicAnswers: {
        q1: { optionId: 'a', question: 'Q1', answer: 'A1', signals: ['poor-sleep', 'desk-job'] },
        q2: { optionId: 'b', question: 'Q2', answer: 'A2', signals: ['high-stress'] },
      },
    })
    const merged = withDeepDiveSignals(answers)
    expect(merged.lifestyle.sort()).toEqual(['desk-job', 'high-stress', 'poor-sleep'])
    // original untouched
    expect(answers.lifestyle).toEqual(['desk-job'])
  })

  it('ignores tags outside the whitelist (vegan can never be inferred)', () => {
    const answers = makeAnswers({
      lifestyle: [],
      dynamicAnswers: {
        q1: { optionId: 'a', question: 'Q1', answer: 'A1', signals: ['vegan', 'nonsense'] },
      },
    })
    expect(withDeepDiveSignals(answers).lifestyle).toEqual([])
  })

  it('is a no-op without deep-dive answers', () => {
    const answers = makeAnswers({ dynamicAnswers: undefined })
    expect(withDeepDiveSignals(answers)).toBe(answers)
  })
})

describe('fallbackQuestions', () => {
  it.each(['performance', 'wellbeing', null] as const)('returns a valid bank for track %s', (track) => {
    const qs = fallbackQuestions(track)
    expect(qs.length).toBeGreaterThan(0)
    for (const q of qs) {
      expect(q.options.length).toBeGreaterThanOrEqual(2)
      for (const o of q.options) {
        for (const s of o.signals) expect(SIGNAL_TAGS).toContain(s)
      }
    }
  })
})

describe('deepDiveKey', () => {
  it('is stable across goal order and irrelevant fields', () => {
    const a = makeAnswers({ goals: ['muscle', 'energy'], budget: '30-50' })
    const b = makeAnswers({ goals: ['energy', 'muscle'], budget: '80-plus' })
    expect(deepDiveKey(a)).toBe(deepDiveKey(b))
  })

  it('changes when generation-relevant answers change', () => {
    const a = makeAnswers()
    expect(deepDiveKey(a)).not.toBe(deepDiveKey(makeAnswers({ goals: ['recovery'] })))
    expect(deepDiveKey(a)).not.toBe(deepDiveKey(makeAnswers({ lifestyle: ['poor-sleep'] })))
    expect(deepDiveKey(a)).not.toBe(deepDiveKey(makeAnswers({ track: 'wellbeing' })))
    expect(deepDiveKey(a)).not.toBe(deepDiveKey(makeAnswers({ diet: 'poor' })))
  })
})

describe('buildQuestionsPrompt', () => {
  it('describes the profile and the allowed signals', () => {
    const prompt = buildQuestionsPrompt(makeAnswers())
    expect(prompt).toContain('build muscle')
    expect(prompt).toContain('desk-job')
    for (const t of SIGNAL_TAGS) expect(prompt).toContain(t)
  })

  it('never assumes training on the wellbeing track', () => {
    const prompt = buildQuestionsPrompt(makeAnswers({ track: 'wellbeing', trainingFrequency: null }))
    expect(prompt).toContain('do not assume they train')
  })
})

describe('buildBlueprintPrompt deep-dive transcript', () => {
  it('includes the Q&A transcript when present', () => {
    const answers = makeAnswers({
      dynamicAnswers: {
        q1: { optionId: 'a', question: 'When does your energy dip?', answer: 'Mid-afternoon slump', signals: [] },
      },
    })
    const prompt = buildBlueprintPrompt(answers, [])
    expect(prompt).toContain('DEEPER CONTEXT')
    expect(prompt).toContain('When does your energy dip? → Mid-afternoon slump')
  })

  it('omits the section when there are no deep-dive answers', () => {
    const prompt = buildBlueprintPrompt(makeAnswers(), [])
    expect(prompt).not.toContain('DEEPER CONTEXT')
  })
})
