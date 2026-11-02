/**
 * The words on "Why this?" (Amp Consult and offer plan, Phase 8, Trace it
 * back). Scripted, one file, in the review pack. A need's name is only ever
 * shown with the approved claim that lets it be named beside the product
 * (`trace.ts`), so these names never stand on their own.
 */
import type { NeedId } from './knowledge'

export const TRACE_COPY = {
  button: 'Why this?',
  hide: 'Hide',
  heading: 'How this got into your stack',
  fromYourAnswers: 'From your answers',
  /** Under the drawing, how to read it. */
  key: 'Thicker lines counted for more.',
  claimLabel: 'What it’s approved to say',
} as const

export const NEED_LABEL: Record<NeedId, string> = {
  protein: 'Protein',
  strength: 'Strength',
  recovery: 'Recovery',
  hydration: 'Hydration',
  joints: 'Joints',
  collagen: 'Collagen',
  'low-sun': 'Low sunlight',
  omega: 'Omega-3',
  sleep: 'Sleep',
  stress: 'Stress',
  energy: 'Energy',
  focus: 'Focus',
  basics: 'The basics',
  'b12-iron': 'B12 and iron',
  gut: 'Gut',
  immunity: 'Immunity',
}
