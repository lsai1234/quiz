/**
 * "Try this week" (Amp Consult and offer plan, Phase 5): up to three free
 * habit fixes per person, from their top patterns, worked out from their own
 * answers. Scripted here, one file, in the review pack; never AI-written.
 *
 * Every fix:
 *   - says something to do, never what it will do for them (no outcome, no
 *     timeframe, nothing about health);
 *   - carries its source, NHS where there is one;
 *   - has an approval flag, and only approved fixes are shown
 *     (`approvedHabits`). All start unapproved: they go live once reviewed;
 *   - records how it would change the day ring, for Phase 8 (`ring`).
 *
 * Patterns with no claimable product (`habitOnlyPatterns`) are why these
 * exist: there the fix is the whole answer.
 */
import { clockWords } from './pinpoint/define'
import { pinpointed } from './pinpoint/effects'
import { leads } from './pinpoint/leads'
import { LIMITS } from './pinpoint/choose'
import type { PatternId } from './pinpoint/types'
import { caffeineCount } from './reactions'
import { readPlate } from './plate'
import type { ConsultAnswers, ConsultGoal } from './types'

/** How a fix would change the day ring (Phase 8). Times are minutes past midnight. */
export type RingChange =
  | { kind: 'lights-out'; at: number }
  | { kind: 'last-caffeine'; at: number; from: number | null }
  | { kind: 'daylight'; at: number; minutes: number }
  | { kind: 'protein-meal'; meal: 'breakfast'; grams: number }
  | { kind: 'fluids'; around: 'training' }
  | { kind: 'move'; at: number; minutes: number }

export interface HabitSource {
  label: string
  url: string
}

export interface HabitFix {
  id: string
  /** The patterns it is a fix for, best first. */
  patterns: PatternId[]
  /** Goals it is "what to try instead" for, when nothing we stock meets them. */
  goals: ConsultGoal[]
  /** Whether it can be worked out for this person at all. */
  applies: (a: ConsultAnswers) => boolean
  /** The line, from their answers. */
  text: (a: ConsultAnswers) => string
  ring: (a: ConsultAnswers) => RingChange | null
  source: HabitSource
  /** Reviewed and approved to show. Only approved fixes reach a customer. */
  approved: boolean
}

const NHS = {
  sleep: { label: 'NHS: How to get to sleep', url: 'https://www.nhs.uk/live-well/sleep-and-tiredness/how-to-get-to-sleep/' },
  tiredness: { label: 'NHS: Self-help tips to fight tiredness', url: 'https://www.nhs.uk/live-well/sleep-and-tiredness/self-help-tips-to-fight-fatigue/' },
  vitaminD: { label: 'NHS: Vitamin D', url: 'https://www.nhs.uk/conditions/vitamins-and-minerals/vitamin-d/' },
  insomnia: { label: 'NHS: Insomnia', url: 'https://www.nhs.uk/conditions/insomnia/' },
  activity: { label: 'NHS: Physical activity guidelines for adults aged 19 to 64', url: 'https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/' },
  older: { label: 'NHS: Physical activity guidelines for older adults', url: 'https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-older-adults/' },
  flexibility: { label: 'NHS: Flexibility exercises', url: 'https://www.nhs.uk/live-well/exercise/strength-and-flexibility-exercises/flexibility-exercises/' },
  water: { label: 'NHS: Water, drinks and your health', url: 'https://www.nhs.uk/live-well/eat-well/food-guidelines-and-food-labels/water-drinks-nutrition/' },
} as const
const BNF_PROTEIN = { label: 'British Nutrition Foundation: Protein', url: 'https://www.nutrition.org.uk/nutritional-information/protein/' }

/** Seven hours in bed asleep, and half an hour to drop off. */
const SLEEP_TARGET = 7 * 60 + 30
/** Last caffeine at least this long before bed. */
const CAFFEINE_GAP = 8 * 60

const day = (m: number) => ((m % (24 * 60)) + 24 * 60) % (24 * 60)
/** Down to the half hour: a time a person would set. */
const halfHour = (m: number) => Math.floor(day(m) / 30) * 30

/** The last caffeine they told Pinpoint about, when they did. */
export function lastCaffeineAt(a: ConsultAnswers): number | null {
  for (const step of [...(a.pinpoint?.steps ?? [])].reverse()) {
    if (step.kind === 'probe' && step.probe === 'last-caffeine' && typeof step.minutes === 'number') return step.minutes
  }
  return null
}

export const HABITS: readonly HabitFix[] = [
  {
    id: 'lights-out',
    patterns: ['short-sleep', 'not-recovering', 'broken-nights'],
    goals: ['sleep'],
    applies: (a) => Boolean(a.sleep),
    text: (a) => `Lights out by ${clockWords(halfHour(a.sleep!.wake - SLEEP_TARGET))}: seven hours’ sleep before your ${clockWords(a.sleep!.wake)} alarm, with half an hour to drop off.`,
    ring: (a) => (a.sleep ? { kind: 'lights-out', at: halfHour(a.sleep.wake - SLEEP_TARGET) } : null),
    source: NHS.sleep,
    approved: false,
  },
  {
    id: 'caffeine-cut-off',
    patterns: ['wired', 'caffeine-train', 'short-sleep', 'broken-nights'],
    goals: ['sleep'],
    applies: (a) => Boolean(a.sleep) && caffeineCount(a.caffeine) >= 1,
    text: (a) => {
      const by = halfHour(a.sleep!.bed - CAFFEINE_GAP)
      const last = lastCaffeineAt(a)
      return last !== null && last > by
        ? `Move your last caffeine from ${clockWords(last)} to ${clockWords(by)}: eight hours before your ${clockWords(a.sleep!.bed)} bedtime.`
        : `Have your last caffeine by ${clockWords(by)}: eight hours before your ${clockWords(a.sleep!.bed)} bedtime.`
    },
    ring: (a) => (a.sleep ? { kind: 'last-caffeine', at: halfHour(a.sleep.bed - CAFFEINE_GAP), from: lastCaffeineAt(a) } : null),
    source: NHS.sleep,
    approved: false,
  },
  {
    id: 'daylight',
    patterns: ['indoor'],
    goals: ['ageing', 'allround'],
    applies: () => true,
    text: () => 'Get outside for 20 minutes in daylight before midday, most days: a walk, a coffee outside, the long way to the shop.',
    ring: () => ({ kind: 'daylight', at: 11 * 60, minutes: 20 }),
    source: NHS.vitaminD,
    approved: false,
  },
  {
    id: 'protein-breakfast',
    patterns: ['protein-gap', 'empty', 'eating-less', 'keeping-strong', 'plant-gap'],
    goals: ['weight'],
    applies: () => true,
    text: (a) =>
      a.plate && readPlate(a.plate).plantBased
        ? 'Put about 25g of protein in your breakfast: tofu, soya yoghurt with seeds, or beans on toast.'
        : 'Put about 25g of protein in your breakfast: eggs, Greek yoghurt, or beans on toast.',
    ring: () => ({ kind: 'protein-meal', meal: 'breakfast', grams: 25 }),
    source: BNF_PROTEIN,
    approved: false,
  },
  {
    id: 'afternoon-walk',
    patterns: ['crash'],
    goals: ['energy'],
    applies: () => true,
    text: () => 'When the afternoon dip comes, take a 10-minute walk and a glass of water before reaching for a snack or a coffee.',
    ring: () => ({ kind: 'move', at: 15 * 60, minutes: 10 }),
    source: NHS.tiredness,
    approved: false,
  },
  {
    id: 'fluids-around-training',
    patterns: ['sweat'],
    goals: ['performance'],
    applies: () => true,
    text: () => 'Drink water through the day, not just after: a glass before you train and more after long or hot sessions.',
    ring: () => ({ kind: 'fluids', around: 'training' }),
    source: NHS.water,
    approved: false,
  },
  {
    id: 'spread-the-week',
    patterns: ['weekend-warrior'],
    goals: [],
    applies: () => true,
    text: () => 'Move one of your weekend efforts to a weekday: two shorter sessions in the week, one longer one at the weekend.',
    ring: () => null,
    source: NHS.activity,
    approved: false,
  },
  {
    id: 'morning-mobility',
    patterns: ['stiff-starter'],
    goals: [],
    applies: () => true,
    text: () => 'Five minutes of gentle stretching before you get going in the morning: shoulders, hips and the backs of your legs.',
    ring: () => ({ kind: 'move', at: 7 * 60, minutes: 5 }),
    source: NHS.flexibility,
    approved: false,
  },
  {
    id: 'walk-and-think',
    patterns: ['staying-sharp'],
    goals: ['focus'],
    applies: () => true,
    text: () => 'Most days, a brisk 10-minute walk, and something that makes you think: a puzzle, a new recipe, a different route.',
    ring: () => ({ kind: 'move', at: 10 * 60, minutes: 10 }),
    source: NHS.older,
    approved: false,
  },
  {
    id: 'back-to-sleep',
    patterns: ['broken-nights'],
    goals: ['sleep'],
    applies: () => true,
    text: () => 'If you’re awake for more than 20 minutes in the night, get up and do something quiet in low light until you feel sleepy, then go back to bed.',
    ring: () => null,
    source: NHS.insomnia,
    approved: false,
  },
]

export const HABIT_BY_ID: Readonly<Record<string, HabitFix>> = Object.fromEntries(HABITS.map((h) => [h.id, h]))

export interface HabitLine {
  id: string
  text: string
  source: HabitSource
  ring: RingChange | null
}

/**
 * The patterns to draw fixes from, strongest first: what Pinpoint pinned, or
 * on the other routes the leads their core answers already point at.
 */
export function topPatterns(a: ConsultAnswers): PatternId[] {
  const pinned = pinpointed(a).map((l) => l.pattern.id)
  if (pinned.length) return pinned
  return leads(a)
    .filter((l) => l.p >= LIMITS.hunchAt)
    .sort((x, y) => y.p - x.p)
    .map((l) => l.pattern.id)
}

function line(h: HabitFix, a: ConsultAnswers): HabitLine {
  return { id: h.id, text: h.text(a), source: h.source, ring: h.ring(a) }
}

/**
 * Up to three fixes, in order: one per top pattern, then for goals nothing in
 * the stack meets. Every fix, approved or not; `approvedHabits` is what may be
 * shown. Deterministic: the same answers give the same fixes.
 */
export function habitsFor(a: ConsultAnswers, unmetGoals: readonly ConsultGoal[] = [], max = 3): HabitLine[] {
  const picked: HabitFix[] = []
  const take = (h: HabitFix | undefined) => {
    if (h && !picked.includes(h) && h.applies(a) && picked.length < max) picked.push(h)
  }
  for (const pattern of topPatterns(a)) take(HABITS.find((h) => h.patterns.includes(pattern) && !picked.includes(h) && h.applies(a)))
  for (const goal of unmetGoals) take(HABITS.find((h) => h.goals.includes(goal) && !picked.includes(h) && h.applies(a)))
  return picked.map((h) => line(h, a))
}

/** The fix for an unmet goal ("…so here's what to try instead"), or null. */
export function habitForGoal(a: ConsultAnswers, goal: ConsultGoal): HabitLine | null {
  const h = HABITS.find((x) => x.goals.includes(goal) && x.applies(a))
  return h ? line(h, a) : null
}

/** Only what has been reviewed and approved. */
export function approvedHabits<T extends { id: string }>(lines: readonly T[], approved: (id: string) => boolean = (id) => HABIT_BY_ID[id]?.approved === true): T[] {
  return lines.filter((l) => approved(l.id))
}
