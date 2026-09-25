/**
 * The results-page adapter (build H8).
 *
 * Turns the consult's handoff payload into what the existing results page
 * already reads, so that page needs no redesign:
 *
 *   - a `StackBlueprint` — the page's stack. Its slots are the consult's
 *     ranking, top pick first, each carrying the consult's reason. The page
 *     then does what it always does: `planTiers` sizes Essentials / Balanced /
 *     Complete from that ranking by its price bands. That is the build plan's
 *     "pass the SKU lists straight through" option — the ranking *is* the SKU
 *     list, and the tiers are prefixes of it either way.
 *   - a `QuizAnswers` — the few fields the page and checkout read (name,
 *     training frequency, goals for the headline), projected from the
 *     consult's answers. Never the circuit check's answers.
 *   - a `StackIdentity` — the card at the top of the reveal. Worked out by
 *     rules from the profile and goals; no AI call, so the ship point costs
 *     nothing to run.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { SLOT_LABELS } from '@/lib/catalogue/types'
import { calculateStackPrice, calculateSubscriptionPrice } from '@/lib/stack-blueprint/helpers'
import type { StackBlueprint, StackSlotEntry } from '@/lib/stack-blueprint/types'
import { defaultAnswers } from '@/lib/quiz-answers'
import type {
  AgeBracket,
  CaffeineLevel,
  DietLevel,
  Gender,
  Goal,
  QuizAnswers,
  StackIdentity,
  TrainingFrequency,
  TrainingType,
} from '@/lib/types'
import type { HandoffPayload } from './handoff'
import { PROFILE_AREAS, PROFILE_LABEL } from './profile'
import { caffeineCount, sessionsPerWeek } from './reactions'
import { SHELF_LABEL } from './summary'
import type { AgeBand, ConsultAnswers, ConsultGoal, Sex } from './types'

/* ── Answers ────────────────────────────────────────────────────────────── */

export const GOAL_TO_QUIZ: Record<ConsultGoal, Goal> = {
  performance: 'performance',
  energy: 'energy',
  sleep: 'sleep-better',
  focus: 'focus',
  ageing: 'health',
  allround: 'health',
}

const AGE_TO_QUIZ: Record<AgeBand, AgeBracket> = {
  'under-18': '16-24',
  '18-24': '16-24',
  '25-34': '25-34',
  '35-44': '35-44',
  '45-54': '45+',
  '55-64': '45+',
  '65-plus': '45+',
}

const SEX_TO_QUIZ: Record<Sex, Gender> = { female: 'female', male: 'male', unsaid: 'not-specified' }

function frequency(sessions: number): TrainingFrequency | null {
  if (sessions === 0) return null
  if (sessions <= 2) return '1-2x'
  if (sessions <= 4) return '3-4x'
  if (sessions <= 6) return '5-6x'
  return 'daily'
}

function caffeineLevel(drinks: number): CaffeineLevel {
  if (drinks === 0) return 'none'
  if (drinks <= 2) return 'low'
  if (drinks === 3) return 'medium'
  return 'high'
}

function dietLevel(plate: ConsultAnswers['plate']): DietLevel | null {
  if (!plate) return null
  if (plate.length >= 7) return 'clean'
  if (plate.length >= 5) return 'mostly-good'
  if (plate.length >= 3) return 'inconsistent'
  return 'poor'
}

/** The consult's answers as the results page reads them. No health answers cross. */
export function toQuizAnswers(a: ConsultAnswers): QuizAnswers {
  const goals = [...new Set(a.goals.map((g) => GOAL_TO_QUIZ[g]))]
  const week = a.week ?? []
  const types = new Set<TrainingType>()
  if (week.includes('gym')) types.add('strength')
  if (week.includes('cardio')) types.add('cardio')
  if (week.includes('sport')) types.add('sport')
  return {
    ...defaultAnswers,
    track: a.goals.includes('performance') ? 'performance' : 'wellbeing',
    goals,
    primaryGoal: goals[0] ?? null,
    ageBracket: a.age ? AGE_TO_QUIZ[a.age] : null,
    gender: a.sex ? SEX_TO_QUIZ[a.sex] : null,
    trainingFrequency: frequency(sessionsPerWeek(a.week)),
    trainingType: [...types],
    caffeineLevel: a.caffeine ? caffeineLevel(caffeineCount(a.caffeine)) : null,
    diet: dietLevel(a.plate),
    currentSupplements: (a.shelf ?? []).map((s) => SHELF_LABEL[s]),
    // Deliberately empty: the circuit check's answers never leave the consult.
    // What they rule out travels as the payload's `excluded` list (H9).
    safetyFlags: [],
    healthDataConsent: null,
  }
}

/* ── Blueprint ──────────────────────────────────────────────────────────── */

/** The consult's ranking as the page's stack. Unknown ids are dropped, never faked. */
export function toBlueprint(payload: HandoffPayload, catalogue: CatalogueProduct[]): StackBlueprint {
  const byId = new Map(catalogue.map((p) => [p.id, p]))
  const products = payload.tiers.complete.map((id) => byId.get(id)).filter((p): p is CatalogueProduct => Boolean(p))
  const total = products.length

  const slots: StackSlotEntry[] = products.map((p, i) => {
    const slotType = p.stackSlots[0] ?? 'health'
    const variant = p.variants.find((v) => v.available) ?? p.variants[0]
    return {
      slotId: `slot-consult-${p.id}`,
      slotType,
      title: SLOT_LABELS[slotType],
      description: p.description,
      recommendedProductId: p.id,
      selectedProductId: p.id,
      selectedVariantId: variant?.id ?? null,
      // The Essentials three are the core of this person's stack.
      required: payload.tiers.essentials.includes(p.id),
      canRemove: !payload.tiers.essentials.includes(p.id),
      canSwap: true,
      swapGroup: p.swapGroup,
      reason: payload.reasons[p.id],
      confidenceScore: Math.round(100 - (i / Math.max(1, total)) * 40),
      displayOrder: i,
    }
  })

  const goals = [...new Set(payload.goals.map((g) => GOAL_TO_QUIZ[g]))]
  const identity = identityFor(payload)
  const partial: StackBlueprint = {
    id: payload.consult_id,
    stackName: identity.name,
    summary: identity.description,
    primaryGoal: goals[0] ?? 'health',
    secondaryGoals: goals.slice(1),
    userProfileSummary: profileLine(payload),
    slots,
    estimatedOneOffPrice: 0,
    estimatedSubscriptionPrice: 0,
    savingsSummary: '',
    createdAt: payload.created_at,
    personalised: false,
    level: 'performance',
  }
  const oneOff = calculateStackPrice(partial, catalogue)
  const sub = calculateSubscriptionPrice(partial, catalogue)
  const savings = Math.round((oneOff - sub) * 100) / 100
  return {
    ...partial,
    estimatedOneOffPrice: oneOff,
    estimatedSubscriptionPrice: sub,
    savingsSummary: savings >= 1 ? `Save £${savings.toFixed(2)}/month with a subscription` : 'Subscription pricing available on selected products.',
  }
}

/* ── Identity ───────────────────────────────────────────────────────────── */

const IDENTITY: Record<ConsultGoal, { name: string; archetype: string; lead: string }> = {
  performance: { name: 'Peak Protocol', archetype: 'The Performance Athlete', lead: 'built around output and recovery' },
  energy: { name: 'Daily Charge', archetype: 'The All-Day Operator', lead: 'built to keep your energy steady through the day' },
  sleep: { name: 'Night Shift', archetype: 'The Deep Recharger', lead: 'built around better nights and easier mornings' },
  focus: { name: 'Clear Signal', archetype: 'The Sharp Mind', lead: 'built to keep you switched on' },
  ageing: { name: 'Long Game', archetype: 'The Long-Haul Mover', lead: 'built to keep you moving well for years' },
  allround: { name: 'Full Circuit', archetype: 'The All-Rounder', lead: 'built to cover the basics properly' },
}

/** The identity card, by rules: the top goal names it, the profile describes it. */
export function identityFor(payload: HandoffPayload): StackIdentity {
  const top = IDENTITY[payload.goals[0] ?? 'allround']
  // A speed run never asks about daylight or food, so their scores are a
  // neutral 50, not an answer — they can't be anyone's focus area.
  const asked = PROFILE_AREAS.filter((a) => payload.route === 'deep' || (a !== 'daylight' && a !== 'nutrition'))
  const areas = [...asked].sort((x, y) => payload.profile[x] - payload.profile[y] || x.localeCompare(y))
  const lowest = areas[0]
  const average = Math.round(asked.reduce((s, a) => s + payload.profile[a], 0) / asked.length)
  return {
    name: top.name,
    archetype: top.archetype,
    description: `Your stack is ${top.lead}, with extra care where you're running lowest: ${PROFILE_LABEL[lowest].toLowerCase()}. These selections may suit your goals and are commonly used by people with similar profiles.`,
    focusAreas: areas.slice(0, 3).map((a) => PROFILE_LABEL[a]),
    // How charged the profile already is — the same number the charge profile draws.
    routineFitScore: Math.max(40, Math.min(99, average)),
  }
}

function profileLine(payload: HandoffPayload): string {
  return PROFILE_AREAS.map((a) => `${PROFILE_LABEL[a]} ${payload.profile[a]}`).join(' · ')
}
