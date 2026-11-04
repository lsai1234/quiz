/**
 * The words of "Your day" (Option 3, built around your day): where each product
 * sits in the person's day. Scripted, one file, in the review pack
 * (`routineCopyRows`).
 *
 * Times and moments only. Nothing here says why a product is taken at a time or
 * what it does then: a product's moment is its "Best taken" setting (the
 * founders set it per product, from the label), placed on the day they gave.
 * The as-needed reasons the catalogue keeps (sleep, stress, immunity) are never
 * named; only "On hot days or after long sessions", which is about weather and
 * sweat, not health.
 */
import type { PourAnchor } from '@/lib/catalogue/types'

export const ROUTINE_COPY = {
  heading: 'Your day',
  sub: 'When to take each one, placed around your day.',
  subAssumed: 'When to take each one, placed around a 7am start and an 11pm bedtime.',
  /** A moment, by its "Best taken" setting. */
  moment: {
    morning: 'With breakfast',
    midday: 'With lunch',
    evening: 'With your evening meal',
    'wind-down': 'An hour before bed',
    'pre-workout': 'Before you train',
    'post-workout': 'After you train',
    'hot-days': 'On hot days or after long sessions',
    'run-down': 'When you choose',
  } satisfies Record<PourAnchor, string>,
  /** How often. */
  everyDay: 'Every day',
  mostDays: 'Most days',
  trainingDays: 'On training days',
  trainingDaysCount: (n: number) => `On your ${n} training day${n === 1 ? '' : 's'}`,
  trainingWeekdays: (days: string) => `On ${days}`,
  whenYouChoose: 'When you choose',
  /** How much, from the plan's usage setting. */
  servings: (n: number) => (n === 0.5 ? 'Half a serving' : n === 1 ? '1 serving' : `${n} servings`),
  /** The groups that have no time on the clock. */
  noTimeTraining: 'When you train',
  noTimeChoose: 'When you choose',
  weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const,
  /** Under the list: label directions win. */
  labelFirst: 'Always follow the directions on the label. These times fit them around your day.',
  /** The day's ends, on the ring. */
  wake: 'Wake',
  bed: 'Bed',
} as const
