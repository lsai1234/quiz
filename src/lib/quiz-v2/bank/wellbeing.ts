import type { BankQuestion } from '../types'
import { chose, hasGoal, olderThan45, suspected } from './predicates'

/**
 * The everyday-wellness ladders: sleep, stress and focus, immunity, gut, skin,
 * and the hormonal one.
 *
 * ── The line these questions do not cross ───────────────────────────────────
 * Every question here asks about routine, habit and context. None asks about
 * symptoms, conditions, medication, pain or diagnosis. That is a hard rule
 * (`docs/QUIZ_V2_ADAPTIVE.md` B8), and it bites hardest on menopause and gut
 * health, where the obvious question is a clinical one. The answer in both
 * cases is to ask what is happening to the person's *day* — sleep, energy,
 * what they avoid eating — and let the goal they already picked carry the rest.
 * A supplement brand asking a stranger to describe symptoms is doing medicine
 * badly; asking what their evenings are like is not.
 */

export const WELLBEING_QUESTIONS: BankQuestion[] = [
  // ── Sleep ────────────────────────────────────────────────────────────────
  {
    id: 'sleep-shape',
    topic: 'sleep',
    section: 'YOUR SLEEP',
    prompt: "What's the problem with it?",
    hint: 'Falling asleep and staying asleep want completely different things.',
    select: 'single',
    summary: 'Which of the four sleep problems this is. The highest-value single question on the wellbeing track.',
    discriminates: ['sleep-onset', 'sleep-maintenance', 'unrefreshing-sleep', 'sleep-debt'],
    requires: (s) => hasGoal(s, 'sleep-better') && !s.asked.includes('energy-mornings'),
    options: [
      {
        id: 'getting-off',
        label: 'Getting to sleep',
        sub: 'Lie there for ages',
        drivers: { 'sleep-onset': 0.75, 'wired-evening': 0.4 },
        signals: ['poor-sleep'],
        answers: { wellbeingAnswers: { sleepQuality: 'switch-off' } },
      },
      {
        id: 'staying-asleep',
        label: 'Staying asleep',
        sub: 'Awake at 3am, most nights',
        drivers: { 'sleep-maintenance': 0.75 },
        signals: ['poor-sleep'],
        answers: { wellbeingAnswers: { sleepQuality: 'wake-night' } },
      },
      {
        id: 'not-restorative',
        label: 'It does not seem to count',
        sub: 'Eight hours and still wrecked',
        drivers: { 'unrefreshing-sleep': 0.75, 'micronutrient-gap': 0.3 },
        signals: ['poor-sleep'],
        answers: { wellbeingAnswers: { sleepQuality: 'wake-tired' } },
      },
      {
        id: 'not-enough',
        label: 'There is just not enough of it',
        sub: 'Life gets in the way',
        drivers: { 'sleep-debt': 0.7 },
        signals: ['poor-sleep'],
      },
    ],
  },

  {
    id: 'evening-shape',
    topic: 'sleep',
    section: 'YOUR EVENINGS',
    prompt: 'What does the hour before bed look like?',
    hint: 'The wind-down decides a lot of what happens after it.',
    select: 'single',
    summary: 'Whether the sleep-onset problem is stimulation, stress or screens.',
    discriminates: ['wired-evening', 'screen-fatigue', 'stress-load', 'caffeine-crash'],
    requires: (s) => suspected(s, 'sleep-onset', 'wired-evening') || chose(s, 'sleep-shape', 'getting-off'),
    options: [
      {
        id: 'screens',
        label: 'Phone or telly, right up to it',
        drivers: { 'screen-fatigue': 0.6, 'wired-evening': 0.45 },
      },
      {
        id: 'working',
        label: 'Still working, or thinking about it',
        drivers: { 'stress-load': 0.6, 'wired-evening': 0.6 },
        signals: ['high-stress'],
        answers: { wellbeingAnswers: { stressPattern: 'evening-wired' } },
      },
      {
        id: 'training-late',
        label: 'Training or out late',
        drivers: { 'wired-evening': 0.5 },
        answers: { trainingTime: 'evening' },
      },
      {
        id: 'calm',
        label: 'Genuinely winding down',
        clears: ['wired-evening', 'screen-fatigue'],
      },
    ],
  },

  // ── Stress and focus ─────────────────────────────────────────────────────
  {
    id: 'stress-when',
    topic: 'stress',
    section: 'YOUR HEAD',
    prompt: 'When is it worst?',
    hint: 'The timing points at completely different support.',
    select: 'single',
    summary: 'When stress or brain fog peaks — morning, afternoon, evening or constant.',
    discriminates: ['stress-load', 'wired-evening', 'glycaemic-dip', 'unrefreshing-sleep', 'screen-fatigue'],
    requires: (s) => hasGoal(s, 'less-stress', 'focus'),
    options: [
      {
        id: 'morning-fog',
        label: 'Mornings are a fog',
        drivers: { 'unrefreshing-sleep': 0.5, 'sleep-debt': 0.35 },
        answers: { wellbeingAnswers: { stressPattern: 'morning-fog' } },
      },
      {
        id: 'afternoon',
        label: 'Afternoon — I lose the thread',
        drivers: { 'glycaemic-dip': 0.45, 'screen-fatigue': 0.4 },
        answers: { wellbeingAnswers: { stressPattern: 'afternoon-crash' } },
      },
      {
        id: 'evening',
        label: "Evening — wired, can't settle",
        drivers: { 'wired-evening': 0.65, 'stress-load': 0.5 },
        signals: ['high-stress'],
        answers: { wellbeingAnswers: { stressPattern: 'evening-wired' } },
      },
      {
        id: 'constant',
        label: 'Honestly, all day',
        drivers: { 'stress-load': 0.7 },
        signals: ['high-stress'],
        answers: { wellbeingAnswers: { stressPattern: 'all-day' } },
      },
    ],
  },

  {
    id: 'screen-hours',
    topic: 'daily',
    section: 'YOUR DAY',
    prompt: 'How much of the day is on a screen?',
    hint: 'Sustained screen work has its own cost.',
    select: 'single',
    summary: 'Screen load, for the focus track.',
    discriminates: ['screen-fatigue', 'sedentary-slump', 'sun-exposure-low'],
    requires: (s) => hasGoal(s, 'focus') && suspected(s, 'screen-fatigue'),
    options: [
      {
        id: 'most',
        label: 'Nearly all of it',
        drivers: { 'screen-fatigue': 0.7, 'sedentary-slump': 0.5, 'sun-exposure-low': 0.45 },
        signals: ['desk-job'],
      },
      { id: 'half', label: 'About half', drivers: { 'screen-fatigue': 0.4 }, signals: ['desk-job'] },
      { id: 'little', label: 'Not much', clears: ['screen-fatigue'] },
    ],
  },

  // ── Immunity ─────────────────────────────────────────────────────────────
  {
    id: 'immune-often',
    topic: 'immunity',
    section: 'IMMUNITY',
    prompt: 'How often do you get run down?',
    hint: 'Frequency tells us whether this is maintenance or catch-up.',
    select: 'single',
    summary: 'How often they get ill — grades the immunity goal.',
    discriminates: ['illness-frequency', 'micronutrient-gap'],
    requires: (s) => hasGoal(s, 'immune', 'health'),
    options: [
      {
        id: 'constantly',
        label: 'Constantly — I catch everything',
        drivers: { 'illness-frequency': 0.8, 'micronutrient-gap': 0.45 },
        signals: ['run-down'],
      },
      {
        id: 'every-few-weeks',
        label: 'Every few weeks',
        drivers: { 'illness-frequency': 0.6, 'micronutrient-gap': 0.35 },
        signals: ['run-down'],
      },
      {
        id: 'winter',
        label: 'A couple of times a winter',
        drivers: { 'illness-frequency': 0.35, 'sun-exposure-low': 0.4 },
      },
      { id: 'rarely', label: 'Rarely — just keeping it that way', clears: ['illness-frequency'] },
    ],
  },

  {
    id: 'immune-exposure',
    topic: 'immunity',
    section: 'IMMUNITY',
    prompt: "What's around you most days?",
    hint: 'Exposure is half of it.',
    select: 'single',
    summary: 'Exposure load — kids, commuting, travel.',
    discriminates: ['illness-frequency', 'sun-exposure-low', 'sleep-debt'],
    requires: (s) => suspected(s, 'illness-frequency'),
    options: [
      {
        id: 'kids',
        label: 'Young children',
        sub: 'Nursery or primary school',
        drivers: { 'illness-frequency': 0.5, 'sleep-debt': 0.4 },
        signals: ['run-down'],
      },
      {
        id: 'commute',
        label: 'A busy commute or office',
        drivers: { 'illness-frequency': 0.4, 'sun-exposure-low': 0.35 },
        signals: ['desk-job'],
      },
      { id: 'travel', label: 'A lot of travel', drivers: { 'illness-frequency': 0.4 } },
      { id: 'home', label: 'Mostly at home', drivers: { 'sun-exposure-low': 0.3 } },
    ],
  },

  // ── Gut ──────────────────────────────────────────────────────────────────
  {
    id: 'gut-when',
    topic: 'gut',
    section: 'DIGESTION',
    prompt: 'When does your digestion give you trouble?',
    hint: 'Habits and timing, not symptoms — we are not a clinic.',
    select: 'single',
    summary: 'When digestion is unsettled. Deliberately about timing, never symptoms.',
    discriminates: ['gut-disruption', 'glycaemic-dip', 'stress-load'],
    requires: (s) => hasGoal(s, 'gut-health'),
    options: [
      {
        id: 'after-meals',
        label: 'After most meals',
        drivers: { 'gut-disruption': 0.7 },
      },
      {
        id: 'stress',
        label: 'When things get stressful',
        drivers: { 'gut-disruption': 0.5, 'stress-load': 0.55 },
        signals: ['high-stress'],
      },
      {
        id: 'since-change',
        label: 'Since something changed',
        sub: 'Travel, antibiotics, a new routine',
        drivers: { 'gut-disruption': 0.75 },
      },
      {
        id: 'general',
        label: 'Nothing specific — just want it working better',
        drivers: { 'gut-disruption': 0.35 },
      },
    ],
  },

  {
    id: 'gut-fibre',
    topic: 'nutrition',
    section: 'DIGESTION',
    prompt: 'Fruit, veg and wholegrains — realistically?',
    hint: 'Fibre first; a probiotic works better on top of it than instead of it.',
    select: 'single',
    summary: 'Fibre intake, so a probiotic is not recommended over the obvious fix.',
    discriminates: ['gut-disruption', 'micronutrient-gap'],
    requires: (s) => suspected(s, 'gut-disruption'),
    options: [
      {
        id: 'plenty',
        label: 'Plenty, most days',
        drivers: { 'gut-disruption': 0.2 },
      },
      { id: 'some', label: 'Some, not consistently', drivers: { 'micronutrient-gap': 0.35 } },
      {
        id: 'barely',
        label: 'Barely any, if I am honest',
        drivers: { 'gut-disruption': 0.4, 'micronutrient-gap': 0.6 },
      },
    ],
  },

  // ── Skin, hair and nails ─────────────────────────────────────────────────
  {
    id: 'skin-change',
    topic: 'skin',
    section: 'SKIN, HAIR & NAILS',
    prompt: 'Has something changed, or is this maintenance?',
    hint: 'A recent change and a long-standing wish need different things.',
    select: 'single',
    summary: 'Whether the skin goal is a recent change or general upkeep.',
    discriminates: ['hormonal-shift', 'micronutrient-gap', 'stress-load', 'sun-exposure-low'],
    requires: (s) => hasGoal(s, 'skin-hair-nails'),
    options: [
      {
        id: 'recent',
        label: 'Changed in the last few months',
        drivers: { 'stress-load': 0.4, 'micronutrient-gap': 0.4 },
      },
      {
        id: 'with-age',
        label: 'Gradually, with age',
        drivers: { 'hormonal-shift': 0.35 },
      },
      {
        id: 'stress-linked',
        label: 'It tracks how stressed I am',
        drivers: { 'stress-load': 0.6 },
        signals: ['high-stress'],
      },
      { id: 'maintenance', label: 'Nothing wrong — keeping it that way' },
    ],
  },

  // ── Hormonal ─────────────────────────────────────────────────────────────
  {
    id: 'hormonal-day',
    topic: 'hormonal',
    section: 'YOUR DAY',
    prompt: 'What is it affecting most?',
    hint: 'Whichever part of the day this touches is where we start.',
    select: 'single',
    // One question, deliberately shallow, and about the day rather than the
    // body. The goal the person selected already tells us what this is; asking
    // them to itemise it would be a symptom checklist, which this quiz does not
    // do. See the note at the top of this file.
    summary: 'Which part of daily life a hormonal change is affecting. Deliberately shallow and non-clinical.',
    discriminates: ['sleep-maintenance', 'stress-load', 'micronutrient-gap', 'hormonal-shift'],
    requires: (s) => hasGoal(s, 'menopause') || (olderThan45(s) && hasGoal(s, 'health') && s.form.gender === 'female'),
    options: [
      {
        id: 'nights',
        label: 'My nights',
        drivers: { 'sleep-maintenance': 0.6, 'hormonal-shift': 0.7 },
        signals: ['poor-sleep'],
      },
      {
        id: 'mood',
        label: 'How I feel day to day',
        drivers: { 'stress-load': 0.5, 'hormonal-shift': 0.7 },
      },
      {
        id: 'energy',
        label: 'My energy',
        drivers: { 'micronutrient-gap': 0.45, 'hormonal-shift': 0.7 },
      },
      {
        id: 'all',
        label: 'All of it, frankly',
        drivers: { 'hormonal-shift': 0.8, 'stress-load': 0.4, 'sleep-maintenance': 0.4 },
      },
    ],
  },

  // ── Daylight ─────────────────────────────────────────────────────────────
  {
    id: 'daylight',
    topic: 'daily',
    section: 'YOUR DAY',
    prompt: 'How much daylight do you actually get?',
    hint: 'The UK makes this the most common gap there is.',
    select: 'single',
    summary: 'Daylight exposure. Cheap, broadly applicable, drives vitamin D.',
    discriminates: ['sun-exposure-low'],
    requires: (s) => suspected(s, 'sun-exposure-low') || hasGoal(s, 'health', 'immune', 'energy'),
    options: [
      {
        id: 'barely',
        label: 'Dark when I leave, dark when I get back',
        drivers: { 'sun-exposure-low': 0.8 },
        signals: ['desk-job'],
      },
      { id: 'lunch', label: 'A walk at lunch, most days', drivers: { 'sun-exposure-low': 0.3 } },
      { id: 'plenty', label: 'I am outside a lot', clears: ['sun-exposure-low'] },
    ],
  },
]
