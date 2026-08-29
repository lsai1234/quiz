import type { QuizAnswers } from './types'

/**
 * A blank quiz.
 *
 * Lives here rather than in the store because two things that are not the store
 * need it: the v2 interview's projection, which builds a `QuizAnswers` out of
 * bank answers and must start from the same blank as v1, and the server route
 * that scores a projected profile. Importing a `'use client'` zustand store into
 * either would be wrong, and keeping a second copy of the blank would be worse —
 * a field added to one and not the other is a silent behaviour difference
 * between the two quizzes.
 */
export const defaultAnswers: QuizAnswers = {
  name: '',
  track: null,
  drinksMode: false,
  drinksPerDay: null,
  dailyDrinks: null,
  drinkVariety: null,
  workoutAddOns: [],
  primaryGoal: null,
  asNeeded: {},
  ageBracket: null,
  exactAge: null,
  gender: null,
  safetyFlags: [],
  weightBand: null,
  goals: [],
  trainingFrequency: null,
  trainingType: [],
  lifestyle: [],
  diet: null,
  currentSupplements: [],
  currentVitamins: [],
  tryOurs: [],
  wellbeingAnswers: {},
  dynamicAnswers: {},
  caffeineLevel: null,
  budget: null,
  stackPreference: null,
  trainingExperience: null,
  trainingFocus: null,
  stimPreference: null,
  trainingTime: null,
}
