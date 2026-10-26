/**
 * The circuit check's words, in one place: on screen in `scenes/CircuitCheck.tsx`
 * and listed for pharmacist and legal review in `docs/consult-review-pack.csv`.
 * The item labels themselves are `CIRCUIT_LABEL` and `SYMPTOM_LABEL` (`summary.ts`),
 * which the review card shares.
 */
import type { CircuitFlag } from './types'

export const CIRCUIT_COPY = {
  question: 'Does any of this apply to you?',
  questionTicking: 'Tick the ones that apply',
  none: 'None of these',
  some: 'Yes, some do',
  consent: 'Use my answers here to keep unsuitable products out.',
  consentDetail: 'It’s health information, so only with my say-so: never shared, never used for marketing, never sent to AI.',
  consentNeeded: 'Tick this, so I can use your answer.',
  mentionedEarlier: 'You mentioned this on the first screen.',
  tailor: 'Use this to tailor my recommendations.',
  tailorDetail: 'Optional. Without it, it only keeps unsuitable products out.',
  symptomsQuestion: 'Anything you’ve noticed since starting it?',
  symptomsNone: 'None of these',
  decline: 'I’d rather not answer these',
} as const

/** The groups the items are ticked under. */
export const CIRCUIT_GROUPS: { label: string; flags: CircuitFlag[] }[] = [
  { label: 'Pregnancy', flags: ['pregnancy'] },
  { label: 'Medicines', flags: ['blood-thinners', 'weight-meds', 'other-prescription'] },
  { label: 'Conditions', flags: ['heart', 'kidney-liver'] },
  { label: 'Allergy', flags: ['shellfish'] },
]

/** Shorter words for the at-a-glance list; the ticked answer keeps its full label. */
export const CIRCUIT_SHORT: Record<CircuitFlag, string> = {
  pregnancy: 'Pregnant, breastfeeding or trying',
  'blood-thinners': 'Blood thinners',
  'weight-meds': 'Weight-loss medication',
  'other-prescription': 'Other prescriptions',
  heart: 'Heart or blood pressure',
  'kidney-liver': 'Kidney or liver',
  shellfish: 'Shellfish',
}
