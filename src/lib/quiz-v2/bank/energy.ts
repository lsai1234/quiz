import type { BankQuestion } from '../types'
import { chose, choseAny, cleared, hasGoal, suspected, trains, weight } from './predicates'

/**
 * The energy ladder — the interview's flagship, and the clearest case for the
 * whole redesign.
 *
 * "More energy" is the most-picked goal and the least informative one. Someone
 * sleeping five hours and someone on four coffees with no breakfast both tap
 * it, and v1 sends them near-identical boxes. Three questions here separate
 * them: when it hits, what surrounds it, and then one question that confirms
 * whichever cause is leading.
 *
 * The third rung is the point. When caffeine is the leading suspect it asks
 * about intake and timing — which is what actually decides whether a stimulant
 * belongs in the box — INSTEAD OF v1's generic four-bucket tolerance question,
 * not as well as it. Same tap count, far more signal. That is the shape of the
 * whole redesign: not more questions, better-aimed ones.
 */

export const ENERGY_QUESTIONS: BankQuestion[] = [
  {
    id: 'energy-when',
    topic: 'energy',
    section: 'YOUR ENERGY',
    // "When does it hit you?" needed the eyebrow to make sense, and the eyebrow
    // is 10px of 35%-white. Every prompt in the bank now stands on its own.
    prompt: 'When does your energy dip?',
    hint: 'The pattern says more than the tiredness does.',
    select: 'single',
    summary: 'When their energy dips — the fork the rest of the energy ladder hangs off.',
    discriminates: [
      'sleep-debt', 'unrefreshing-sleep', 'glycaemic-dip', 'caffeine-crash',
      'training-load', 'under-fuelled', 'micronutrient-gap', 'stress-load',
    ],
    requires: (s) => hasGoal(s, 'energy', 'cutting', 'focus', 'health', 'performance'),
    options: [
      {
        id: 'mornings',
        label: 'Slow mornings',
        sub: 'It takes hours to get going',
        drivers: { 'sleep-debt': 0.4, 'unrefreshing-sleep': 0.35 },
      },
      {
        id: 'afternoon',
        label: 'Mid-afternoon wall',
        sub: 'Fine until about three',
        drivers: { 'glycaemic-dip': 0.4, 'caffeine-crash': 0.35 },
      },
      {
        id: 'evening',
        label: 'Nothing left by evening',
        sub: 'Runs out before the day does',
        drivers: { 'training-load': 0.3, 'under-fuelled': 0.35 },
      },
      {
        id: 'all-day',
        label: 'Flat the whole way through',
        sub: 'No real peak at all',
        drivers: { 'micronutrient-gap': 0.4, 'stress-load': 0.3 },
      },
    ],
  },

  {
    id: 'energy-mornings',
    topic: 'sleep',
    section: 'SLEEP',
    prompt: 'How is your sleep at the moment?',
    hint: 'Slow mornings usually start the night before.',
    select: 'single',
    summary: 'Which kind of sleep problem is behind slow mornings — or rules sleep out.',
    discriminates: ['sleep-onset', 'sleep-maintenance', 'unrefreshing-sleep', 'micronutrient-gap'],
    requires: (s) =>
      chose(s, 'energy-when', 'mornings') ||
      (suspected(s, 'sleep-debt', 'unrefreshing-sleep') && !cleared(s, 'sleep-onset')),
    options: [
      {
        id: 'cant-switch-off',
        label: "Can't switch off",
        sub: 'Lie there with the day still running',
        drivers: { 'sleep-onset': 0.65, 'wired-evening': 0.4 },
        signals: ['poor-sleep'],
        answers: { wellbeingAnswers: { sleepQuality: 'switch-off' } },
      },
      {
        id: 'wake-through',
        label: 'Wake through the night',
        sub: 'Get off fine, then surface',
        drivers: { 'sleep-maintenance': 0.65 },
        signals: ['poor-sleep'],
        answers: { wellbeingAnswers: { sleepQuality: 'wake-night' } },
      },
      {
        id: 'wake-tired',
        label: 'Sleep enough, still wake tired',
        sub: 'The hours are there, the rest is not',
        drivers: { 'unrefreshing-sleep': 0.65, 'micronutrient-gap': 0.3 },
        signals: ['poor-sleep'],
        answers: { wellbeingAnswers: { sleepQuality: 'wake-tired' } },
      },
      {
        id: 'nights-fine',
        label: 'Nights are fine, actually',
        sub: 'Sleep is not the problem',
        // Ruling sleep out is as useful as ruling it in — and without this the
        // planner would keep spending questions on it.
        clears: ['sleep-onset', 'sleep-maintenance', 'unrefreshing-sleep', 'sleep-debt'],
        drivers: { 'micronutrient-gap': 0.35 },
        answers: { wellbeingAnswers: { sleepQuality: 'fine' } },
      },
    ],
  },

  {
    id: 'energy-afternoon',
    topic: 'nutrition',
    section: 'FOOD',
    prompt: 'What do you usually eat before the afternoon?',
    hint: 'An afternoon wall is usually built earlier in the day.',
    select: 'single',
    summary: 'What causes the afternoon crash — fuelling, caffeine, or neither.',
    discriminates: ['under-fuelled', 'caffeine-crash', 'glycaemic-dip', 'micronutrient-gap'],
    requires: (s) => chose(s, 'energy-when', 'afternoon'),
    options: [
      {
        id: 'coffee-only',
        label: 'Coffee, and not much else',
        sub: 'Breakfast rarely happens',
        drivers: { 'under-fuelled': 0.6, 'caffeine-crash': 0.55 },
      },
      {
        id: 'big-lunch',
        label: 'A big lunch, then gone',
        sub: 'Straight down after eating',
        drivers: { 'glycaemic-dip': 0.65 },
      },
      {
        id: 'too-busy',
        label: 'Too busy to eat properly',
        sub: 'Whatever is nearest, if anything',
        drivers: { 'under-fuelled': 0.6, 'micronutrient-gap': 0.35 },
        signals: ['high-stress'],
      },
      {
        id: 'steady-meals',
        label: 'Three proper meals',
        sub: 'Eating is not the issue',
        clears: ['under-fuelled', 'glycaemic-dip'],
        drivers: { 'micronutrient-gap': 0.3 },
      },
    ],
  },

  {
    id: 'sleep-hours',
    topic: 'sleep',
    section: 'SLEEP',
    prompt: 'On a normal night, how long do you sleep?',
    hint: 'Not time in bed — time actually asleep.',
    select: 'single',
    summary: 'Grades sleep debt from suspected to measured.',
    discriminates: ['sleep-debt'],
    requires: (s) => suspected(s, 'sleep-debt') || weight(s, 'unrefreshing-sleep') > 0,
    options: [
      {
        id: 'under-6',
        label: 'Under 6 hours',
        drivers: { 'sleep-debt': 0.8 },
        signals: ['poor-sleep'],
      },
      { id: '6-7', label: '6 to 7 hours', drivers: { 'sleep-debt': 0.45 } },
      { id: '7-8', label: '7 to 8 hours', drivers: { 'sleep-debt': 0.1 } },
      { id: 'over-8', label: 'More than 8', clears: ['sleep-debt'] },
    ],
  },

  {
    id: 'caffeine',
    topic: 'energy',
    section: 'CAFFEINE',
    prompt: 'How much caffeine, and how late?',
    hint: 'Decides whether a stimulant belongs in your stack at all.',
    select: 'single',
    summary: 'Caffeine intake AND timing in one screen. Sets caffeineLevel; gates stimulants.',
    // This is the question that earns the redesign its keep. v1 asks a
    // four-bucket tolerance question and separately asks when you train. This
    // asks the thing both were proxies for, on one screen: how much, and how
    // late. Timing is what makes a stimulant recommendation safe or reckless.
    discriminates: ['caffeine-crash', 'wired-evening', 'sleep-onset'],
    requires: (s) =>
      trains(s) || suspected(s, 'caffeine-crash') || hasGoal(s, 'energy', 'sleep-better'),
    // One axis, four rungs, no overlap. The first cut had "three or more a day"
    // sitting next to "something after 4pm" — most people who do one do the
    // other, so the answer told us nothing about which. It also had no rung for
    // someone who has the occasional coffee, who had to choose between "I avoid
    // it" and "a coffee or two daily", neither of which was true.
    options: [
      {
        id: 'none',
        label: 'I avoid it entirely',
        sub: 'Stim-free, always',
        clears: ['caffeine-crash'],
        answers: { caffeineLevel: 'none', stimPreference: 'no' },
      },
      {
        id: 'occasional',
        label: 'The odd coffee',
        sub: 'Not every day',
        answers: { caffeineLevel: 'low' },
      },
      {
        id: 'daily-early',
        label: 'Every day, nothing after lunch',
        sub: 'One or two in the morning',
        answers: { caffeineLevel: 'medium', trainingTime: 'morning' },
      },
      {
        id: 'daily-late',
        label: 'Every day, including late afternoon',
        sub: 'Coffee or an energy drink to get through',
        drivers: { 'caffeine-crash': 0.65, 'wired-evening': 0.55, 'sleep-onset': 0.4 },
        answers: { caffeineLevel: 'high', trainingTime: 'evening' },
      },
    ],
  },

  {
    id: 'energy-evening',
    topic: 'daily',
    section: 'YOUR DAY',
    prompt: 'What drains you most during the day?',
    hint: 'Different demands need different support.',
    select: 'single',
    summary: 'What the evening flat-out is actually costing them.',
    discriminates: ['training-load', 'stress-load', 'sedentary-slump', 'under-fuelled'],
    requires: (s) => chose(s, 'energy-when', 'evening'),
    options: [
      {
        id: 'training',
        label: 'Training, mostly',
        drivers: { 'training-load': 0.55, 'recovery-debt': 0.35 },
      },
      {
        id: 'work-pressure',
        label: 'Work — it never really stops',
        drivers: { 'stress-load': 0.6 },
        signals: ['high-stress'],
      },
      {
        id: 'on-feet',
        label: 'On my feet all day',
        drivers: { 'under-fuelled': 0.35, 'hydration-deficit': 0.3 },
      },
      {
        id: 'nothing-obvious',
        label: 'Nothing obvious, and that is the odd part',
        drivers: { 'micronutrient-gap': 0.5 },
      },
    ],
  },

  {
    id: 'energy-flat',
    topic: 'daily',
    section: 'YOUR ENERGY',
    prompt: 'How long have you felt this flat?',
    hint: 'A recent change and a long-running one point different ways.',
    select: 'single',
    summary: 'Duration of an all-day flatness — recent vs long-running.',
    discriminates: ['micronutrient-gap', 'stress-load', 'illness-frequency', 'sun-exposure-low'],
    requires: (s) => chose(s, 'energy-when', 'all-day'),
    options: [
      {
        id: 'weeks',
        label: 'A few weeks',
        sub: 'Something changed recently',
        drivers: { 'stress-load': 0.45, 'illness-frequency': 0.3 },
      },
      {
        id: 'winter',
        label: 'It comes back every winter',
        sub: 'And lifts when the light does',
        drivers: { 'sun-exposure-low': 0.7, 'micronutrient-gap': 0.4 },
      },
      {
        id: 'months',
        label: 'Months, honestly',
        drivers: { 'micronutrient-gap': 0.55, 'stress-load': 0.35 },
      },
      {
        id: 'always',
        label: 'As long as I can remember',
        drivers: { 'micronutrient-gap': 0.5 },
      },
    ],
  },

  {
    id: 'day-shape',
    topic: 'daily',
    section: 'YOUR DAY',
    prompt: 'Where do you spend most of your day?',
    hint: 'Where you spend it changes what your body runs short of.',
    select: 'single',
    summary: 'Sedentary vs active vs shift work. Broad, cheap, useful on every path.',
    discriminates: ['sedentary-slump', 'screen-fatigue', 'sun-exposure-low', 'sleep-debt'],
    requires: (s) => !choseAny(s, 'energy-evening', 'on-feet'),
    // Deliberately one axis. There used to be a "full-on, rarely a quiet
    // moment" option in here, which is an answer about pressure rather than
    // about where the day is spent — and it overlapped every other option,
    // since a desk day can be full-on too. Pressure is asked properly by
    // `stress-when` and `energy-evening`.
    options: [
      {
        id: 'desk',
        label: 'At a desk, mostly indoors',
        drivers: { 'sedentary-slump': 0.5, 'screen-fatigue': 0.45, 'sun-exposure-low': 0.4 },
        signals: ['desk-job'],
      },
      {
        id: 'moving',
        label: 'On my feet and moving',
        drivers: { 'hydration-deficit': 0.25 },
      },
      {
        id: 'shifts',
        label: 'Shifts or irregular hours',
        drivers: { 'sleep-debt': 0.4, 'unrefreshing-sleep': 0.35 },
        signals: ['shift-work'],
      },
      {
        id: 'varies',
        label: 'It changes day to day',
        drivers: { 'sleep-debt': 0.2 },
      },
    ],
  },
]
