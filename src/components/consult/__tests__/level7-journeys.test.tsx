import { fireEvent, render, screen, within } from '@testing-library/react'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { scoreNeeds } from '@/lib/consult/engine'
import { initialFlow, resolveSceneDef, visibleScenes, type FlowState } from '@/lib/consult/flow'
import { journeyOf } from '@/lib/consult/journey'
import { pickToPatch, validatePicks } from '@/lib/consult/ai/understand'
import { EMPTY_ANSWERS, type ConsultAnswers, type SceneId } from '@/lib/consult/types'
import { resetQuizArm } from '@/lib/experiments/client'
import { AmpConsult } from '../AmpConsult'
import { heading, pressNext } from './drive'

/**
 * Batch 5: a 20-year-old building muscle and a 70-year-old keeping going get
 * different consults — different questions, words, widgets and places to
 * talk — not the same one with bigger text.
 */

const builder: ConsultAnswers = { ...EMPTY_ANSWERS, route: 'deep', goals: ['performance'], age: '18-24', sex: 'male' }
const ager: ConsultAnswers = { ...EMPTY_ANSWERS, route: 'deep', goals: ['ageing'], age: '65-plus', sex: 'female' }
const weight: ConsultAnswers = { ...EMPTY_ANSWERS, route: 'deep', goals: ['weight', 'energy'], age: '35-44', sex: 'female' }

const at = (sceneId: SceneId, answers: ConsultAnswers): FlowState => ({ ...initialFlow('c1', 0, { route: 'deep' }), sceneId, answers: { ...answers, comfortOffered: true } })

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetQuizArm()
})

describe('whose consult is it', () => {
  it('reads the journey off the goals and the age, and follows them when they change', () => {
    expect(journeyOf(builder)).toBe('builder')
    expect(journeyOf(ager)).toBe('ager')
    expect(journeyOf(weight)).toBe('weight')
    expect(journeyOf({ goals: ['energy'], age: '35-44' })).toBe('everyday')
    // Performance at 67 is still an older person's consult.
    expect(journeyOf({ goals: ['performance'], age: '65-plus' })).toBe('ager')
    // Before the age is in, a performance goal reads as a builder.
    expect(journeyOf({ goals: ['performance'], age: null })).toBe('builder')
    expect(journeyOf({ goals: ['focus', 'performance'], age: '45-54' })).toBe('everyday')
  })

  it('asks different questions: a builder is asked what the training is for, an older person what’s got harder', () => {
    const young = visibleScenes(builder)
    const old = visibleScenes(ager)
    expect(young).toContain('aim')
    expect(young).not.toContain('changes')
    expect(old).toContain('changes')
    expect(old).not.toContain('aim')
    expect(visibleScenes(weight)).not.toEqual(expect.arrayContaining(['aim']))
  })

  it('words the same scene for the person answering it', () => {
    const q = (a: ConsultAnswers) => resolveSceneDef('training', a).copy.question
    expect(q(builder)).toBe('What’s your training split?')
    expect(q(ager)).toBe('How active is a normal week?')
    expect(q(weight)).toBe('How much are you moving at the moment?')
    expect(q({ ...EMPTY_ANSWERS, goals: ['energy'], age: '35-44' })).toBe('What does your training look like?')
    expect(resolveSceneDef('body', builder).copy.question).toBe('Anything niggling from training?')
  })

  it('puts "Tell Amp" where talking suits that person: a builder’s split, an older person’s joints', () => {
    expect(resolveSceneDef('training', builder).tell?.example).toMatch(/Push, pull, legs/)
    expect(resolveSceneDef('training', ager).tell?.example).toMatch(/walk the dog/)
    expect(resolveSceneDef('body', ager).tell?.lead).toBe(true)
    expect(resolveSceneDef('body', builder).tell?.lead).toBe(false)
    expect(resolveSceneDef('food', weight).tell?.lead).toBe(true)
    expect(resolveSceneDef('food', ager).tell?.lead).toBe(false)
  })

  it('keeps what a goal adds, under the journey’s words: a builder with a sleep goal still gets the sleep hint', () => {
    const sleepy = { ...builder, goals: ['performance' as const, 'sleep' as const] }
    expect(resolveSceneDef('sleep', sleepy).copy.hint).toMatch(/Sleep's one of your goals/)
    expect(resolveSceneDef('sleep', sleepy).tell?.example).toMatch(/6am gym/)
    expect(resolveSceneDef('training', builder).detail).toBe(true)
  })
})

describe('in the consult', () => {
  it('a builder picks what they’re training for, and it shapes the needs', () => {
    render(<AmpConsult initial={at('aim', builder)} loadProducts={async () => MOCK_CATALOGUE} />)
    expect(heading()).toHaveTextContent('What are you training for?')
    const tile = screen.getByRole('radio', { name: /^Build muscle/ })
    fireEvent.click(tile)
    expect(tile).toHaveAttribute('aria-checked', 'true')
    const muscle = scoreNeeds({ ...builder, aim: 'muscle' })
    const endurance = scoreNeeds({ ...builder, aim: 'endurance' })
    expect(muscle.protein.total).toBeGreaterThan(endurance.protein.total)
    expect(endurance.hydration.total).toBeGreaterThan(muscle.hydration.total)
    expect(muscle.protein.sources.map((s) => s.why)).toContain('You’re training to build muscle')
  })

  it('an older person sees walks and gardening count, in words that fit', () => {
    render(<AmpConsult initial={at('training', ager)} />)
    expect(heading()).toHaveTextContent('How active is a normal week?')
    fireEvent.click(screen.getByRole('button', { name: /^Monday:/ }))
    const chips = within(screen.getByRole('group', { name: 'Monday: what you do' }))
    expect(chips.getByRole('button', { name: /Walk, swim or cycle/ })).toBeInTheDocument()
    expect(chips.getByRole('button', { name: /Gardening, golf, dancing/ })).toBeInTheDocument()
    fireEvent.click(chips.getByRole('button', { name: /Walk, swim or cycle/ }))
    expect(screen.getByRole('button', { name: 'Monday: Walk. Tap to change.' })).toBeInTheDocument()
  })

  it('an older person is asked what’s got harder; "Nothing’s changed" and blank are both answers', () => {
    render(<AmpConsult initial={at('changes', ager)} />)
    expect(heading()).toHaveTextContent('Anything harder than it used to be?')
    fireEvent.click(screen.getByRole('button', { name: /^Staying sharp/ }))
    expect(screen.getByRole('button', { name: /^Staying sharp/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /^Nothing’s changed/ }))
    expect(screen.getByRole('button', { name: /^Staying sharp/ })).toHaveAttribute('aria-pressed', 'false')
    pressNext()
    expect(heading()).toHaveTextContent('Already taking anything?')
  })

  it('only uses the journey’s own answers while they still apply', () => {
    // Answered as a builder, then the age changed: the aim no longer counts.
    const was = { ...builder, aim: 'muscle' as const }
    expect(scoreNeeds({ ...was, age: '65-plus' }).protein.sources.map((s) => s.why)).not.toContain('You’re training to build muscle')
    const sharp = scoreNeeds({ ...ager, changes: ['staying-sharp'] })
    expect(sharp.focus.sources.map((s) => s.why)).toContain('Staying sharp matters to you')
  })

  it('hears the new answers in words too', () => {
    const [aim, change] = validatePicks({ picks: [{ kind: 'aim', value: 'strength', label: '' }, { kind: 'change', value: 'getting-about', label: '' }] })
    expect(pickToPatch(aim, builder, 'aim')).toEqual({ aim: 'strength' })
    expect(pickToPatch(change, ager, 'changes')).toEqual({ changes: ['getting-about'] })
    expect(validatePicks({ picks: [{ kind: 'aim', value: 'bulk', label: '' }] })).toEqual([])
  })
})
