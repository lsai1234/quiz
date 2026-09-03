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

  it('neither budget nor formats is a step any more', () => {
    // Budget went when depth moved to the results screen; formats went because
    // the answer was a guess and the swap modal already changes any product.
    for (const track of ['performance', 'wellbeing'] as const) {
      const ids = activeSteps(track).map((s) => s.id)
      expect(ids).not.toContain('budget')
      expect(ids).not.toContain('formats')
    }
  })

  it('the CHRGD LQD drinks steps are gone with the feature', () => {
    for (const id of ['dailyDrinks', 'drinkVariety', 'workoutAddOns']) {
      expect(QUIZ_STEPS.some((s) => (s.id as string) === id)).toBe(false)
    }
  })

  it('caffeine + training-time are performance-only when answers are supplied', () => {
    const wellIds = activeSteps('wellbeing', { track: 'wellbeing' }).map((s) => s.id)
    const perfIds = activeSteps('performance', { track: 'performance' }).map((s) => s.id)
    expect(wellIds).not.toContain('caffeine')
    expect(wellIds).not.toContain('trainingTime')
    expect(perfIds).toContain('caffeine')
    expect(perfIds).toContain('trainingTime')
  })

  it('without answers the conditional steps stay in (stable first-screen count)', () => {
    const ids = activeSteps('wellbeing').map((s) => s.id)
    expect(ids).toContain('caffeine')
    expect(ids).toContain('trainingTime')
  })

  it('advertised question counts per path (review + deepDive excluded)', () => {
    const count = (track: 'performance' | 'wellbeing') =>
      activeSteps(track, { track }).filter((s) => s.id !== 'review' && s.id !== 'deepDive').length
    // Post-Phase-3 counts (budget removed; safety screen added; weight folded
    // into the personal step, so no extra step for it), less the formats step.
    expect(count('wellbeing')).toBe(6)    // goals, safety, personal, lifestyle, diet, supps
    expect(count('performance')).toBe(10) // + frequency, type, caffeine, trainingTime
  })
})

describe('stepCopy precedence', () => {
  it('the wellbeing override beats the base', () => {
    const supps = QUIZ_STEPS.find((s) => s.id === 'supps')!
    expect(stepCopy(supps, 'performance').q).toBe('Already using any of these?')
    expect(stepCopy(supps, 'wellbeing').q).toBe('Already taking any of these?')
  })
})
