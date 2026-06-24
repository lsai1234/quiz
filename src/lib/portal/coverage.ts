/**
 * Catalogue coverage — does the product range actually back what the quiz can
 * recommend? Checks every quiz goal and every stack slot against the current
 * products, flagging gaps (nothing backs it) and thin areas (no alternative /
 * no subscription option).
 */
import { STACK_SLOTS, SLOT_LABELS, type StackSlot } from '@/lib/catalogue/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { ALL_GOALS, type Goal } from '@/lib/types'

export type CoverageStatus = 'ok' | 'warn' | 'fail'

export interface CoverageItem {
  key: string
  label: string
  kind: 'goal' | 'slot'
  productCount: number
  subscriptionCount: number
  status: CoverageStatus
  note?: string
  productTitles: string[]
}

export interface CatalogueCoverage {
  goals: CoverageItem[]
  slots: CoverageItem[]
  gaps: number // nothing backs it
  thin: number // only one / no subscription option
}

const GOAL_LABELS: Record<Goal, string> = {
  muscle: 'Build muscle', energy: 'Energy', performance: 'Performance', hydration: 'Hydration',
  recovery: 'Recovery', health: 'General health', cutting: 'Cutting / fat loss', bulking: 'Bulking',
  'sleep-better': 'Better sleep', 'less-stress': 'Less stress', focus: 'Focus', immune: 'Immunity',
  'skin-hair-nails': 'Skin, hair & nails', menopause: 'Menopause', 'gut-health': 'Gut health',
}

function item(key: string, label: string, kind: 'goal' | 'slot', matches: CatalogueProduct[]): CoverageItem {
  const subs = matches.filter((p) => p.subscriptionEligible)
  let status: CoverageStatus = 'ok'
  let note: string | undefined
  if (matches.length === 0) {
    status = 'fail'
    note = 'Nothing in the range backs this — the quiz can recommend it with no product to match.'
  } else if (matches.length === 1) {
    status = 'warn'
    note = 'Only one product — nothing to swap to if it doesn’t suit.'
  } else if (subs.length === 0) {
    status = 'warn'
    note = 'No subscription-eligible option — can’t be put on a plan.'
  }
  return { key, label, kind, productCount: matches.length, subscriptionCount: subs.length, status, note, productTitles: matches.map((p) => p.title) }
}

export function catalogueCoverage(products: CatalogueProduct[]): CatalogueCoverage {
  // Subscription-only refills aren't quiz-recommendable, so exclude them.
  const offerable = products.filter((p) => !p.isSubscriptionOnly)

  const goals = ALL_GOALS.map((g) => item(`goal:${g}`, GOAL_LABELS[g], 'goal', offerable.filter((p) => p.goals.includes(g))))
  const slots = STACK_SLOTS.map((s) => item(`slot:${s}`, SLOT_LABELS[s], 'slot', offerable.filter((p) => p.stackSlots.includes(s))))

  const all = [...goals, ...slots]
  return {
    goals,
    slots,
    gaps: all.filter((i) => i.status === 'fail').length,
    thin: all.filter((i) => i.status === 'warn').length,
  }
}
