/**
 * Quiz flow — step sequence, per-track inclusion, and the answer-guidance
 * metadata that drives the "how to answer" pill.
 */
import { QUIZ_STEPS, activeSteps, stepCopy, selectHint } from '@/lib/quiz-flow'

describe('selectHint', () => {
  it('maps every select mode to the right guidance (or none for forms)', () => {
    expect(selectHint('one')).toBe('Pick one')
    expect(selectHint('multi')).toBe('Pick all that apply')
    expect(selectHint('optional')).toBe('Pick any — or skip')
    expect(selectHint('form')).toBeNull()
  })
})

describe('step guidance metadata', () => {
  it('every step declares a select mode', () => {
    for (const step of QUIZ_STEPS) {
      expect(['one', 'multi', 'optional', 'form']).toContain(step.select)
    }
  })

  it('single-choice (auto-advance) steps are marked "one"', () => {
    for (const step of QUIZ_STEPS) {
      if (step.advance === 'auto') expect(step.select).toBe('one')
    }
  })

  it('the key multi/optional steps are labelled so users know they can pick several', () => {
    const mode = (id: string) => QUIZ_STEPS.find((s) => s.id === id)!.select
    expect(mode('goals')).toBe('multi')
    expect(mode('type')).toBe('multi')
    expect(mode('formats')).toBe('multi')
    expect(mode('lifestyle')).toBe('optional')
    expect(mode('supps')).toBe('optional')
    // Free-entry / summary steps show no pill.
    expect(mode('personal')).toBe('form')
    expect(mode('review')).toBe('form')
  })
})

describe('activeSteps', () => {
  it('wellbeing skips the training-only steps; performance keeps them', () => {
    const perf = activeSteps('performance').map((s) => s.id)
    const well = activeSteps('wellbeing').map((s) => s.id)
    expect(perf).toContain('frequency')
    expect(perf).toContain('type')
    expect(well).not.toContain('frequency')
    expect(well).not.toContain('type')
  })

  it('LQD drops the formats step on either track', () => {
    expect(activeSteps('performance', true).map((s) => s.id)).not.toContain('formats')
    expect(activeSteps('wellbeing', true).map((s) => s.id)).not.toContain('formats')
  })
})

describe('stepCopy precedence', () => {
  it('LQD override beats the wellbeing override beats the base', () => {
    const supps = QUIZ_STEPS.find((s) => s.id === 'supps')!
    expect(stepCopy(supps, 'performance', false).q).toBe('Already using any of these?')
    expect(stepCopy(supps, 'wellbeing', false).q).toBe('Already taking any of these?')
    const budget = QUIZ_STEPS.find((s) => s.id === 'budget')!
    expect(stepCopy(budget, 'wellbeing', true).q).toBe("What's your drinks budget?")
  })
})
