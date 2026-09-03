import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { QuizAnswers, StackIdentity } from '@/lib/types'
import { buildSharePayload } from './payload'
import type { ShareCardPayload } from './types'

/**
 * The stacks the card has to survive.
 *
 * One list, used by the render test, `/styleguide/share`, and the sample card a
 * partner downloads — so the cards a founder signs off are the same cards CI
 * renders, and the asset a partner posts is a stack the engine would really
 * produce. A preview page with its own happy-path fixture is a preview page that
 * stays green while the card breaks for a real customer.
 *
 * These are built from the real engine and the mock catalogue rather than
 * hand-written payloads: the interesting failures are in the shapes the engine
 * actually produces — a nine-slot stack, a wellbeing stack with no training
 * language, a name twice as long as the design assumed — and none of them appear
 * if the fixture is one tidy stack somebody typed.
 */

function answers(o: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'Sam Whitlock', track: 'performance', primaryGoal: null,
    asNeeded: {}, ageBracket: '25-34', exactAge: null, gender: 'male',
    safetyFlags: [], weightBand: null, goals: ['health'],
    trainingFrequency: '3-4x', trainingType: [], lifestyle: [], diet: 'mostly-good',
    currentSupplements: [], currentVitamins: [], tryOurs: [],
    wellbeingAnswers: {}, dynamicAnswers: {}, caffeineLevel: 'medium', budget: '50-80',
    stackPreference: 'balanced', trainingExperience: 'intermediate', trainingFocus: null,
    stimPreference: 'yes', trainingTime: null, ...o,
  }
}

const IDENTITY: StackIdentity = {
  name: 'Iron Foundations',
  archetype: 'The Strength Builder',
  description: '',
  focusAreas: ['Performance Output', 'Faster Recovery', 'Daily Energy'],
  routineFitScore: 88,
}

export interface SharePersona {
  id: string
  /** What this persona is here to break. */
  note: string
  payload: ShareCardPayload
}

interface Spec {
  id: string
  note: string
  answers: QuizAnswers
  identity: StackIdentity | null
  code?: string
  showFirstName?: boolean
}

const SPECS: Spec[] = [
  {
    id: 'complete',
    note: 'Nine slots. Exercises the overflow line on every format.',
    answers: answers({
      goals: ['muscle', 'energy'], trainingFrequency: '5-6x', trainingType: ['strength'],
      trainingFocus: 'hypertrophy', trainingExperience: 'experienced',
      budget: '80-plus', stackPreference: 'complete', caffeineLevel: 'high',
    }),
    identity: IDENTITY,
    code: 'SARAH20',
  },
  {
    id: 'essentials',
    note: 'A short stack — no overflow line, and the lineup has to not look sparse.',
    answers: answers({ goals: ['health'], budget: 'under-30', stackPreference: 'simple' }),
    identity: { ...IDENTITY, name: 'Daily Base', archetype: 'The Everyday Athlete', routineFitScore: 74 },
  },
  {
    id: 'wellbeing',
    note: 'No training language anywhere on the card.',
    answers: answers({
      track: 'wellbeing', goals: ['sleep-better', 'less-stress'], gender: 'female',
      ageBracket: '35-44', trainingFrequency: null, budget: null, stackPreference: null,
    }),
    identity: {
      ...IDENTITY, name: 'Quiet Hours', archetype: 'The Wind-Down',
      focusAreas: ['Restful Sleep', 'Everyday Calm', 'Immune Support'], routineFitScore: 81,
    },
  },
  {
    id: 'no-identity',
    note: 'The AI identity call failed or is unconfigured. No archetype, no chips, no ring.',
    answers: answers({ goals: ['muscle'], trainingFrequency: '3-4x', trainingType: ['strength'] }),
    identity: null,
  },
  {
    id: 'long-everything',
    note: 'The longest name, the longest products, and an opt-in first name. Breaks layouts.',
    answers: answers({
      name: 'Alexandria Fitzgerald-Montgomery',
      goals: ['muscle', 'recovery', 'hydration'], trainingFrequency: '5-6x',
      trainingType: ['strength'], budget: '80-plus', stackPreference: 'complete',
    }),
    identity: {
      ...IDENTITY,
      name: 'Uncompromising Foundations',
      archetype: 'The Methodical Powerbuilder',
      focusAreas: ['Sustained Performance Output', 'Accelerated Recovery', 'Daily Energy Balance'],
      routineFitScore: 96,
    },
    code: 'ALEXANDRIA25',
    showFirstName: true,
  },
]

/** Every persona, built. */
export function sharePersonas(): SharePersona[] {
  return SPECS.map((spec) => ({
    id: spec.id,
    note: spec.note,
    payload: buildSharePayload(
      buildStackBlueprint(spec.answers, MOCK_CATALOGUE),
      spec.identity,
      MOCK_CATALOGUE,
      {
        customerName: spec.answers.name,
        showFirstName: spec.showFirstName,
        code: spec.code,
        // Fixed, so a preview page and a snapshot do not differ by the clock.
        now: () => new Date('2026-08-17T09:00:00.000Z'),
      },
    ),
  }))
}
