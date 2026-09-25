import { EMPTY_ANSWERS } from '../../types'
import { SCENES, flowReducer, initialFlow } from '../../flow'
import { MAX_PICKS, labelFor, pickToPatch, validatePicks } from '../understand'
import { REACT_SAFE, validateSceneCopy } from '../copy'

const energy = SCENES.find((s) => s.id === 'energy')!

describe('V3 tell Amp more: picks', () => {
  it('keeps only known kinds and values', () => {
    const picks = validatePicks({
      picks: [
        { kind: 'coffee', value: '3', label: '3 coffees a day' },
        { kind: 'food', value: 'oily-fish', label: 'Eats oily fish' },
        { kind: 'food', value: 'pizza', label: 'Pizza' },
        { kind: 'circuit', value: 'pregnancy', label: 'Pregnant' },
        { kind: 'energy', value: '11', label: 'x' },
        { kind: 'bedtime', value: '25:00', label: 'x' },
      ],
    })
    expect(picks.map((p) => `${p.kind}:${p.value}`)).toEqual(['coffee:3', 'food:oily-fish'])
  })

  it('has no way to touch the circuit check', () => {
    const everything = ['circuit', 'healthConsent', 'safety', 'pregnancy', 'medication'].map((kind) => ({ kind, value: 'x', label: 'x' }))
    expect(validatePicks({ picks: everything })).toEqual([])
  })

  it('rewrites an unusable label from the value', () => {
    const [p] = validatePicks({ picks: [{ kind: 'coffee', value: '2', label: 'Buy our caffeine stack' }] })
    expect(p.label).toBe(labelFor('coffee', '2'))
  })

  it('takes at most four, and no duplicates', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ kind: 'note', value: `Fact ${i}`, label: `Fact ${i}` }))
    expect(validatePicks({ picks: [...many, many[0]] })).toHaveLength(MAX_PICKS)
  })

  it('merges into the answers, never removing anything', () => {
    const a = { ...EMPTY_ANSWERS, plate: ['eggs' as const], caffeine: { coffee: 1, tea: 2, energy: 0 } }
    expect(pickToPatch({ kind: 'food', value: 'oily-fish', label: '' }, a, 'food')).toEqual({ plate: ['eggs', 'oily-fish'] })
    expect(pickToPatch({ kind: 'coffee', value: '3', label: '' }, a, 'caffeine')).toEqual({ caffeine: { coffee: 3, tea: 2, energy: 0 } })
    expect(pickToPatch({ kind: 'note', value: 'Night shifts', label: 'Night shifts · 3 a week' }, a, 'sleep')).toEqual({ notes: { sleep: 'Night shifts · 3 a week' } })
  })

  it('applies several picks in a row against the latest answers', () => {
    let s = initialFlow('c', 0, { route: 'deep' })
    s = flowReducer(s, { type: 'pick', pick: { kind: 'food', value: 'eggs', label: '' } })
    s = flowReducer(s, { type: 'pick', pick: { kind: 'food', value: 'fruit', label: '' } })
    expect(s.answers.plate).toEqual(['eggs', 'fruit'])
  })
})

describe('V4 Amp reacts', () => {
  it('keeps a short, clean reaction', () => {
    expect(validateSceneCopy({ question: 'Energy?', hint: 'Drag.', react: 'Four a week, solid.' }, energy)?.react).toBe('Four a week, solid.')
  })

  it('drops a reaction that mentions products, doses or results, keeping the rest', () => {
    for (const react of ['Creatine will help that.', 'Try 5g a day.', 'That will cure it.', 'x'.repeat(60)]) {
      const copy = validateSceneCopy({ question: 'Energy?', hint: 'Drag.', react }, energy)
      expect(copy).toEqual({ question: 'Energy?', hint: 'Drag.' })
    }
  })

  it('never reacts in its own words to the body map, the shelf or the circuit check', () => {
    expect(REACT_SAFE).not.toContain('body')
    expect(REACT_SAFE).not.toContain('shelf')
    expect(REACT_SAFE).not.toContain('circuit')
  })
})
