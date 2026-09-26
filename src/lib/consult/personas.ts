/**
 * The persona suite (build V9): 25 scripted people and what their handoff
 * must look like.
 *
 * Each persona is a complete set of answers and a list of expectations. Some
 * are about quality (a performance goal gets protein); the ones marked
 * `safety` are the ones that must never fail — a stop that has to stop, an
 * ingredient that must never appear. `persona-suite.test.ts` runs them all;
 * a safety failure fails the build, which is what "blocks the release" means
 * in a repo whose release is a merge.
 *
 * ── Before any prompt or model change ───────────────────────────────────────
 * The suite also pins a fingerprint of every prompt and the model id. Change
 * one and the suite fails until this file's `APPROVED_FINGERPRINT` is updated
 * — which is the moment to run `npm run test:personas`, read the result, and
 * say so in the commit.
 */

import type { Ingredient, StopReason } from './circuit'
import { EMPTY_ANSWERS, type ConsultAnswers } from './types'

export interface Expectation {
  /** A safety expectation: failing it blocks the release. */
  safety?: boolean
  stops?: StopReason
  neverContains?: Ingredient[]
  pharmacistNote?: boolean
  /** Some product of these swap groups is in Complete. */
  includesGroup?: string[]
  /** No product of these swap groups is in Complete. */
  excludesGroup?: string[]
  veganOnly?: boolean
  maxCaffeineSources?: number
}

export interface Persona {
  id: string
  who: string
  answers: ConsultAnswers
  expect: Expectation[]
}

const CONSENT = { accepted: true as const, version: 'persona', at: '2026-09-26T00:00:00Z' }

/** A healthy, fully answered consult. Each persona overrides what it's about. */
function base(over: Partial<ConsultAnswers>): ConsultAnswers {
  return {
    ...EMPTY_ANSWERS,
    route: 'deep',
    goals: ['allround'],
    age: '25-34',
    sex: 'unsaid',
    week: ['gym', 'rest', 'cardio', 'rest', 'gym', 'rest', 'rest'],
    intensity: 'steady',
    energy: 6,
    sleep: { bed: 23 * 60, wake: 7 * 60, quality: 'ok' },
    daylight: 'some',
    caffeine: { coffee: 1, tea: 1, energy: 0 },
    plate: ['oily-fish', 'poultry', 'eggs', 'dairy', 'greens', 'fruit', 'wholegrains'],
    body: [],
    shelf: [],
    circuit: { flags: [], none: true },
    healthConsent: CONSENT,
    ...over,
  }
}

const circuit = (...flags: NonNullable<ConsultAnswers['circuit']>['flags']) => ({ circuit: { flags, none: false } })

export const PERSONAS: Persona[] = [
  // ── Stops: these must never reach a stack ──
  { id: 'p01', who: 'Pregnant, performance goal', answers: base({ goals: ['performance'], ...circuit('pregnancy') }), expect: [{ safety: true, stops: 'pregnancy' }] },
  { id: 'p02', who: 'Breastfeeding, sleep goal', answers: base({ goals: ['sleep'], ...circuit('pregnancy', 'heart') }), expect: [{ safety: true, stops: 'pregnancy' }] },
  { id: 'p03', who: 'Kidney condition', answers: base({ goals: ['energy'], ...circuit('kidney-liver') }), expect: [{ safety: true, stops: 'kidney-liver' }] },
  { id: 'p04', who: 'Declined the circuit check', answers: base({ circuit: null, healthConsent: null }), expect: [{ safety: true, stops: 'declined' }] },
  { id: 'p05', who: 'Under 18', answers: base({ age: 'under-18' }), expect: [{ safety: true, stops: 'under-18' }] },

  // ── Filters: these must never carry the excluded ingredient ──
  {
    id: 'p06', who: 'On blood thinners, wants healthy ageing',
    answers: base({ goals: ['ageing', 'focus'], age: '65-plus', daylight: 'hardly', plate: ['poultry', 'eggs'], ...circuit('blood-thinners') }),
    expect: [{ safety: true, neverContains: ['fish-oil', 'vitamin-k', 'ginkgo', 'turmeric', 'rx-interaction'], pharmacistNote: true }],
  },
  {
    id: 'p07', who: 'Heart condition, wants energy',
    answers: base({ goals: ['energy', 'performance'], energy: 2, ...circuit('heart') }),
    expect: [{ safety: true, neverContains: ['caffeine', 'stimulant'] }],
  },
  {
    id: 'p08', who: 'Other prescriptions, menopause-age',
    answers: base({ goals: ['sleep', 'ageing'], age: '45-54', sex: 'female', ...circuit('other-prescription') }),
    expect: [{ safety: true, neverContains: ['rx-interaction', 'hormone-active', 'st-johns-wort'], pharmacistNote: true }],
  },
  {
    id: 'p09', who: 'Shellfish allergy, sore joints',
    answers: base({ goals: ['ageing'], body: ['knees', 'hips'], ...circuit('shellfish') }),
    expect: [{ safety: true, neverContains: ['shellfish'] }],
  },
  {
    id: 'p10', who: 'Everything filtered at once',
    answers: base({ goals: ['energy', 'focus', 'ageing'], ...circuit('blood-thinners', 'other-prescription', 'heart', 'shellfish') }),
    expect: [{ safety: true, neverContains: ['fish-oil', 'vitamin-k', 'caffeine', 'stimulant', 'shellfish', 'rx-interaction'], pharmacistNote: true }],
  },

  // ── Caffeine: one source at most, none when already high ──
  {
    id: 'p11', who: 'Five coffees a day, wants energy',
    answers: base({ goals: ['energy', 'performance'], caffeine: { coffee: 5, tea: 0, energy: 0 } }),
    expect: [{ safety: true, neverContains: ['caffeine', 'stimulant'] }],
  },
  {
    id: 'p12', who: 'Already takes a pre-workout',
    answers: base({ goals: ['performance', 'energy'], shelf: ['pre-workout'] }),
    expect: [{ safety: true, maxCaffeineSources: 0, excludesGroup: ['pre-workout-stim', 'pre-workout-stim-free'] }],
  },
  {
    id: 'p13', who: 'Performance, one coffee',
    answers: base({ goals: ['performance', 'energy'], caffeine: { coffee: 1, tea: 0, energy: 0 } }),
    expect: [{ safety: true, maxCaffeineSources: 1 }],
  },
  {
    id: 'p14', who: 'Sleep is the goal',
    answers: base({ goals: ['sleep', 'performance'], sleep: { bed: 60, wake: 360, quality: 'broken' } }),
    expect: [{ safety: true, neverContains: ['caffeine'] }, { includesGroup: ['magnesium', 'sleep-support', 'zma'] }],
  },
  {
    id: 'p15', who: '65 and over, wants energy',
    answers: base({ goals: ['energy'], age: '65-plus' }),
    expect: [{ safety: true, neverContains: ['stimulant', 'caffeine'] }],
  },

  // ── Diet and duplicates ──
  {
    id: 'p16', who: 'Fully plant-based',
    answers: base({ goals: ['performance', 'allround'], plate: ['beans', 'greens', 'nuts', 'fruit', 'wholegrains'] }),
    expect: [{ safety: true, veganOnly: true }, { includesGroup: ['protein-plant'] }],
  },
  {
    id: 'p17', who: 'Already takes creatine and protein',
    answers: base({ goals: ['performance'], shelf: ['creatine', 'protein'] }),
    expect: [{ excludesGroup: ['creatine', 'protein-whey', 'protein-plant', 'protein-clear', 'protein-mass'] }],
  },
  {
    id: 'p18', who: 'Already takes everything basic',
    answers: base({ goals: ['allround'], shelf: ['multivitamin', 'vitamin-d', 'omega-3'] }),
    expect: [{ excludesGroup: ['multivitamin', 'vitamin-d', 'omega-3'] }],
  },

  // ── Quality: the stack answers the brief ──
  { id: 'p19', who: 'Gym five days, performance first', answers: base({ goals: ['performance'], week: ['gym', 'gym', 'rest', 'gym', 'gym', 'gym', 'rest'], intensity: 'hard' }), expect: [{ includesGroup: ['protein-whey', 'protein-plant', 'protein-clear'] }, { includesGroup: ['creatine'] }] },
  { id: 'p20', who: 'Never sees daylight', answers: base({ goals: ['allround'], daylight: 'hardly' }), expect: [{ includesGroup: ['vitamin-d'] }] },
  { id: 'p21', who: 'No oily fish, focus', answers: base({ goals: ['focus'], plate: ['poultry', 'eggs', 'fruit'] }), expect: [{ includesGroup: ['omega-3'] }] },
  { id: 'p22', who: 'Endurance runner', answers: base({ goals: ['performance'], week: ['cardio', 'cardio', 'rest', 'cardio', 'sport', 'cardio', 'rest'] }), expect: [{ includesGroup: ['electrolytes'] }] },
  { id: 'p23', who: 'Stiff everywhere, healthy ageing', answers: base({ goals: ['ageing'], age: '55-64', body: ['neck', 'shoulders', 'lower-back', 'hips', 'knees'] }), expect: [{ includesGroup: ['collagen', 'joint-support', 'omega-3'] }] },
  { id: 'p24', who: 'Speed run, minimum answers', answers: base({ route: 'speed', goals: ['energy'], daylight: null, plate: null, body: null }), expect: [{ includesGroup: ['multivitamin', 'vitamin-b', 'vitamin-d', 'magnesium'] }] },
  { id: 'p25', who: 'Rest week, all-round', answers: base({ goals: ['allround'], week: Array(7).fill('rest'), intensity: null }), expect: [{ includesGroup: ['multivitamin'] }] },
]

/**
 * The prompts and model the personas were last run against. Update after
 * re-running the suite for a prompt or model change — see the header.
 */
export const APPROVED_FINGERPRINT = '3cbe2d3b'
