'use client'

/**
 * Sample people for the results page's test views (`/?test=results&person=…`).
 * Loaded in the browser straight into the quiz store, built by the same
 * engine the quiz uses, and never sent anywhere: no AI, nothing saved.
 *
 * The quiz answers hold nothing about anyone's health. The consult person is
 * one of the consult's own sample personas (on blood thinners), so its
 * pharmacist's note shows; it is sample data, not a person.
 */
import { defaultAnswers } from '@/lib/quiz-answers'
import type { QuizAnswers } from '@/lib/types'
import type { SamplePerson } from './views'

const base: QuizAnswers = { ...defaultAnswers, name: 'Alex', ageBracket: '25-34', gender: 'not-specified', diet: 'mostly-good' }

export const SAMPLE_ANSWERS: Record<Exclude<SamplePerson, 'consult'>, QuizAnswers> = {
  gym: {
    ...base,
    track: 'performance',
    primaryGoal: 'muscle',
    goals: ['muscle', 'recovery', 'energy'],
    trainingFrequency: '3-4x',
    trainingType: ['strength'],
    caffeineLevel: 'medium',
    budget: '50-80',
    stackPreference: 'balanced',
    trainingExperience: 'intermediate',
    stimPreference: 'yes',
    trainingTime: 'evening',
  },
  runner: {
    ...base,
    track: 'performance',
    primaryGoal: 'performance',
    goals: ['performance', 'hydration', 'recovery'],
    trainingFrequency: '5-6x',
    trainingType: ['cardio'],
    caffeineLevel: 'low',
    budget: '30-50',
    stackPreference: 'balanced',
    trainingExperience: 'experienced',
    stimPreference: 'no',
    trainingTime: 'morning',
  },
  wellbeing: {
    ...base,
    track: 'wellbeing',
    primaryGoal: 'sleep-better',
    goals: ['sleep-better', 'less-stress', 'focus'],
    trainingFrequency: '1-2x',
    trainingType: ['mixed'],
    caffeineLevel: 'high',
    budget: '30-50',
    stackPreference: 'simple',
    trainingExperience: 'new',
    stimPreference: 'no',
    trainingTime: 'varies',
  },
  vegan: {
    ...base,
    track: 'performance',
    primaryGoal: 'muscle',
    goals: ['muscle', 'health'],
    lifestyle: ['vegan'],
    trainingFrequency: '3-4x',
    trainingType: ['strength', 'cardio'],
    caffeineLevel: 'none',
    budget: '50-80',
    stackPreference: 'complete',
    trainingExperience: 'intermediate',
    stimPreference: 'no',
    trainingTime: 'lunchtime',
  },
}

/** Load a sample person's results into the store. False when it couldn't be built. */
export async function loadSampleResults(person: string | null, plan: string | null): Promise<boolean> {
  const [{ useQuizStore }, { loadCatalogue }] = await Promise.all([import('@/lib/store'), import('@/lib/catalogue/load')])
  const store = useQuizStore.getState()
  const { products } = await loadCatalogue()
  if (!products.length) return false
  store.reset()

  if (person === 'consult') {
    const [{ PERSONAS }, { prepareResults, applyToResultsPage }] = await Promise.all([import('@/lib/consult/personas'), import('@/lib/consult/results')])
    const sample = PERSONAS.find((p) => p.id === 'p06')
    if (!sample) return false
    const bundle = prepareResults({ consultId: 'sample-consult', answers: sample.answers } as unknown as Parameters<typeof prepareResults>[0], products)
    applyToResultsPage(bundle)
  } else {
    const answers = SAMPLE_ANSWERS[(person ?? 'gym') as Exclude<SamplePerson, 'consult'>] ?? SAMPLE_ANSWERS.gym
    const [{ buildStackBlueprint }, { levelForStackPreference }] = await Promise.all([import('@/lib/stack-blueprint'), import('@/lib/stack-blueprint/pricing')])
    store.setAnswers(answers)
    store.setConsultExclusions(null)
    store.setStackLevel(levelForStackPreference(answers.stackPreference))
    store.setStackBlueprint(buildStackBlueprint(answers, products))
    store.setStackReady(true)
  }
  useQuizStore.getState().setPlanType(plan === 'monthly' ? 'subscription' : 'oneoff')
  return true
}
