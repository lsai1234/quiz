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
    expect(mode('formats')).toBe('multi')
    expect(mode('lifestyle')).toBe('optional')
    expect(mode('supps')).toBe('optional')
    // Main training style is single-select now (the old multi-select was inert).
    expect(mode('type')).toBe('one')
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

  it('LQD drops the formats and budget steps on either track', () => {
    for (const track of ['performance', 'wellbeing'] as const) {
      const ids = activeSteps(track, true).map((s) => s.id)
      expect(ids).not.toContain('formats')
      expect(ids).not.toContain('budget') // pace sizes the package instead
    }
  })

  it('drinkVariety is gone (near-inert question removed)', () => {
    expect(QUIZ_STEPS.some((s) => (s.id as string) === 'drinkVariety')).toBe(false)
    expect(activeSteps('wellbeing', true).map((s) => s.id)).not.toContain('drinkVariety')
  })

  it('caffeine + training-time are performance-only when answers are supplied', () => {
    const wellIds = activeSteps('wellbeing', false, { track: 'wellbeing' }).map((s) => s.id)
    const perfIds = activeSteps('performance', false, { track: 'performance' }).map((s) => s.id)
    expect(wellIds).not.toContain('caffeine')
    expect(wellIds).not.toContain('trainingTime')
    expect(perfIds).toContain('caffeine')
    expect(perfIds).toContain('trainingTime')
  })

  it('without answers the conditional steps stay in (stable first-screen count)', () => {
    const ids = activeSteps('wellbeing', false).map((s) => s.id)
    expect(ids).toContain('caffeine')
    expect(ids).toContain('trainingTime')
  })

  it('advertised question counts per path (review + deepDive excluded)', () => {
    const count = (track: 'performance' | 'wellbeing', drinks: boolean) =>
      activeSteps(track, drinks, { track }).filter((s) => s.id !== 'review' && s.id !== 'deepDive').length
    // Post-Phase-2 counts (budget removed → depth chosen on the results screen).
    // Safety + bodyweight arrive in Phase 3.
    expect(count('wellbeing', false)).toBe(6)    // goals, personal, lifestyle, diet, supps, formats
    expect(count('performance', false)).toBe(10) // + frequency, type, caffeine, trainingTime
    expect(count('wellbeing', true)).toBe(6)     // goals, dailyDrinks, personal, lifestyle, diet, supps
    expect(count('performance', true)).toBe(11)  // + workoutAddOns, frequency, type, caffeine, trainingTime
  })
})

describe('stepCopy precedence', () => {
  it('LQD override beats the wellbeing override beats the base', () => {
    const supps = QUIZ_STEPS.find((s) => s.id === 'supps')!
    expect(stepCopy(supps, 'performance', false).q).toBe('Already using any of these?')
    expect(stepCopy(supps, 'wellbeing', false).q).toBe('Already taking any of these?')
    const review = QUIZ_STEPS.find((s) => s.id === 'review')!
    expect(stepCopy(review, 'wellbeing', true).q).toBe('Quick check before we pour.')
  })
})
