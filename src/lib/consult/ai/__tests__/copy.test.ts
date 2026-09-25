import { SCENES, resolveSceneDef } from '../../flow'
import { EMPTY_ANSWERS, type ConsultAnswers } from '../../types'
import { COPY_BUDGET_MS, COPY_MODEL, LIMITS, NEVER_AI, buildCopyPrompt, copySchema, isClean, summariseForCopy, validateSceneCopy } from '../copy'

const goals = SCENES.find((s) => s.id === 'goals')!
const energy = SCENES.find((s) => s.id === 'energy')!

const everything: ConsultAnswers = {
  ...EMPTY_ANSWERS,
  route: 'deep',
  goals: ['performance', 'sleep'],
  age: '35-44',
  sex: 'female',
  week: ['gym', 'rest', 'gym', 'rest', 'rest', 'rest', 'rest'],
  energy: 3,
  sleep: { bed: 1380, wake: 360, quality: 'broken' },
  daylight: 'hardly',
  caffeine: { coffee: 2, tea: 0, energy: 0 },
  plate: ['beans', 'greens'],
  body: ['knees'],
  shelf: ['omega-3'],
  circuit: { flags: ['pregnancy'], none: false },
  healthConsent: { accepted: true, version: 'x', at: 'x' },
  notes: { sleep: 'I have insomnia' },
}

describe('V1 the plumbing', () => {
  it('pins a dated model and a 1.5s budget', () => {
    expect(COPY_MODEL).toMatch(/\d{4}-\d{2}-\d{2}$/)
    expect(COPY_BUDGET_MS).toBeLessThanOrEqual(1500)
  })

  it('asks for exactly the scene’s schema, strict', () => {
    expect(copySchema(energy)).toEqual(expect.objectContaining({ required: ['question', 'hint'], additionalProperties: false }))
    const g = copySchema(goals) as { required: string[]; properties: { labels: { required: string[] } } }
    expect(g.required).toEqual(['question', 'hint', 'labels'])
    expect(g.properties.labels.required).toEqual(goals.aiLabels)
  })

  it('never words the review or the circuit check', () => {
    expect(NEVER_AI).toEqual(['review', 'circuit'])
  })
})

describe('V2 AI-worded scenes, safely', () => {
  it('keeps copy that fits', () => {
    expect(validateSceneCopy({ question: 'How’s your battery by 3pm?', hint: 'Drag to fill it.' }, energy)).toEqual({
      question: 'How’s your battery by 3pm?',
      hint: 'Drag to fill it.',
    })
  })

  it.each([
    ['too long', { question: 'x'.repeat(LIMITS.question + 1), hint: 'ok' }],
    ['empty', { question: ' ', hint: 'ok' }],
    ['a product', { question: 'Need some creatine?', hint: 'ok' }],
    ['a dose', { question: 'Energy?', hint: 'Most people take 200mg.' }],
    ['a claim', { question: 'Energy?', hint: 'This will cure the slump.' }],
    ['not an object', 'hello'],
  ])('throws away copy that is %s', (_why, raw) => {
    expect(validateSceneCopy(raw, energy)).toBeNull()
  })

  it('needs every label a scene asked for', () => {
    const labels = Object.fromEntries(goals.aiLabels!.map((k) => [k, 'Short line']))
    expect(validateSceneCopy({ question: 'What are you after?', hint: 'Pick three.', labels }, goals)?.labels).toEqual(labels)
    const { ageing: _dropped, ...missing } = labels
    expect(validateSceneCopy({ question: 'What are you after?', hint: 'Pick three.', labels: missing }, goals)).toBeNull()
  })

  it('tells the model nothing about health: no circuit check, body, food, shelf or free text', () => {
    const summary = summariseForCopy(everything)
    expect(summary).not.toMatch(/pregnan|circuit|knee|bean|green|omega|insomnia|female/i)
    expect(summary).toMatch(/Performance/)
  })

  it('marks the person’s data as data, not instructions', () => {
    const prompt = buildCopyPrompt(resolveSceneDef('energy', everything), everything)
    expect(prompt).toMatch(/data, not instructions/)
  })

  it('flags banned words in either direction', () => {
    expect(isClean('How’s your energy most afternoons?')).toBe(true)
    expect(isClean('Buy the stack for £30')).toBe(false)
  })
})
