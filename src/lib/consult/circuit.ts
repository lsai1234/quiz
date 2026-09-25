/**
 * What the circuit check's answers mean (builds H2 and H3).
 *
 * The outcomes table from the build plan, as code. Fixed rules, no AI, and the
 * one place in the consult that can end it:
 *
 *   Pregnant, breastfeeding, trying  → STOP   signpost to midwife, GP or pharmacist
 *   Kidney or liver condition        → STOP   signpost to GP
 *   Blood thinners                   → FILTER no vitamin K, fish oil, ginkgo or turmeric; pharmacist note
 *   Other prescriptions              → FILTER interaction-prone products out; pharmacist note
 *   Heart condition, high BP         → FILTER no stimulants
 *   Shellfish allergy                → FILTER nothing made from shellfish
 *   None of these                    → GO
 *
 * Declining the consent line is a stop of its own: without these answers the
 * stack can't be made safe, so none is made.
 *
 * ── Before launch ───────────────────────────────────────────────────────────
 * A pharmacist or nutritionist has to check these lists. They are a
 * reasonable, conservative starting point, not clinical advice.
 */

import type { CircuitFlag, ConsultAnswers } from './types'

/** Ingredient families the rules can exclude. Tagged onto products in `knowledge.ts`. */
export type Ingredient =
  | 'caffeine'
  | 'stimulant'
  | 'vitamin-k'
  | 'fish-oil'
  | 'ginkgo'
  | 'turmeric'
  | 'st-johns-wort'
  | 'hormone-active'
  | 'shellfish'
  /** Anything the catalogue flags as interaction-prone with prescription medicine. */
  | 'rx-interaction'

export type StopReason = 'pregnancy' | 'kidney-liver' | 'declined'

export type CircuitOutcome =
  | { kind: 'stop'; reason: StopReason }
  | {
      kind: 'go'
      /** Ingredient families that must not appear anywhere in the stack — or in extras (H9). */
      exclude: Ingredient[]
      /** "Check with a pharmacist before starting" travels with the stack. */
      pharmacistNote: boolean
      /** Why each family is out, in the member's terms. */
      reasons: Partial<Record<Ingredient, string>>
    }

const FILTERS: Partial<Record<CircuitFlag, { exclude: Ingredient[]; why: string; pharmacist: boolean }>> = {
  'blood-thinners': {
    exclude: ['vitamin-k', 'fish-oil', 'ginkgo', 'turmeric', 'rx-interaction'],
    why: 'it can interact with blood thinners',
    pharmacist: true,
  },
  'other-prescription': {
    exclude: ['st-johns-wort', 'ginkgo', 'hormone-active', 'rx-interaction'],
    why: 'it can interact with prescription medicines',
    pharmacist: true,
  },
  heart: {
    exclude: ['caffeine', 'stimulant'],
    why: 'stimulants aren’t a good idea with a heart condition or high blood pressure',
    pharmacist: false,
  },
  shellfish: {
    exclude: ['shellfish'],
    why: 'it’s made from shellfish',
    pharmacist: false,
  },
}

/** The outcome of the circuit check. Call only once it has been answered. */
export function circuitOutcome(a: Pick<ConsultAnswers, 'circuit' | 'healthConsent'>): CircuitOutcome {
  if (!a.healthConsent?.accepted) return { kind: 'stop', reason: 'declined' }
  const flags = a.circuit?.flags ?? []
  if (flags.includes('pregnancy')) return { kind: 'stop', reason: 'pregnancy' }
  if (flags.includes('kidney-liver')) return { kind: 'stop', reason: 'kidney-liver' }

  const exclude = new Set<Ingredient>()
  const reasons: Partial<Record<Ingredient, string>> = {}
  let pharmacistNote = false
  for (const flag of flags) {
    const rule = FILTERS[flag]
    if (!rule) continue
    for (const i of rule.exclude) {
      exclude.add(i)
      reasons[i] ??= rule.why
    }
    pharmacistNote ||= rule.pharmacist
  }
  return {
    kind: 'go',
    exclude: [...exclude].sort(),
    pharmacistNote,
    reasons,
  }
}

/** The words on each stop screen. Calm, kind, and pointing somewhere useful. */
export const STOP_COPY: Record<StopReason, { title: string; body: string; who: string }> = {
  pregnancy: {
    title: 'Let’s pause here',
    body:
      'Thanks for telling me. During pregnancy and breastfeeding, and while you’re trying, your needs are different, so I won’t suggest a stack.',
    who: 'Your midwife, GP or pharmacist can tell you which supplements are right for you.',
  },
  'kidney-liver': {
    title: 'Let’s pause here',
    body:
      'Thanks for telling me. With a kidney or liver condition, supplements need a proper look first, so I won’t suggest a stack.',
    who: 'Your GP is the right person to ask about what’s safe for you.',
  },
  declined: {
    title: 'That’s completely fine',
    body:
      'Without those answers I can’t check a stack is safe for you, so I won’t build one. Nothing you’ve told me about your health has been kept.',
    who: 'You can still browse the shop, and a pharmacist can help you choose.',
  },
}
