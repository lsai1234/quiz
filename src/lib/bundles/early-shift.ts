import type { PrebuiltBundle } from './types'
import { bundleBlueprint } from './builders'

// ─── Early Shift ──────────────────────────────────────────────────────────────
// The 6am-before-work stack. Stim-free energy so the caffeine timing never
// wrecks the rest of the day, hydration to wake the body up, protein to make
// breakfast easy. Claim-safe: no "burns fat", no "detox".

export const EARLY_SHIFT: PrebuiltBundle = {
  slug: 'early-shift',
  name: 'Early Shift',
  tagline: 'Up. Out. Done before work.',
  seriesName: 'Session Stacks',
  description:
    'For the 6am crowd who train before the day starts. A stim-free lift so you ' +
    'get energy and focus without a caffeine hit that lingers till lunch, ' +
    'electrolytes to wake the body up, and protein to turn breakfast into one ' +
    'less thing to think about.',
  honestyLine: 'The hardest rep is the alarm. Everything after is downhill.',

  blueprint: bundleBlueprint({
    slug: 'early-shift',
    name: 'Early Shift',
    summary: 'Stim-free pre-workout, electrolytes and protein — an early session that won’t follow you into the day.',
    primaryGoal: 'energy',
    secondaryGoals: ['hydration', 'muscle'],
    profile: 'Early-morning trainer, fits a session in before work',
    estOneOff: 74.97,
    estSub: 48,
    cores: [
      {
        slotType: 'energy',
        title: 'Stim-Free Pre-Workout',
        description: 'Energy without the all-day caffeine',
        productId: 'chrgd-pre-workout-stim-free',
        swapGroup: 'pre-workout-stim-free',
        reason:
          'A caffeine-free lift so you get the focus of a pre-workout at 6am ' +
          'without stimulants that hang around and disturb your evening — ideal ' +
          'before an early session.',
      },
      {
        slotType: 'hydration',
        title: 'Hydration',
        description: 'Wake the body up',
        productId: 'chrgd-electrolytes',
        swapGroup: 'electrolytes',
        reason:
          'You wake up mildly dehydrated. A serving of electrolytes first thing ' +
          'is a simple way to start your hydration routine before you train.',
      },
      {
        slotType: 'protein',
        title: 'Protein',
        description: 'Breakfast, sorted',
        productId: 'chrgd-whey-protein',
        swapGroup: 'protein-whey',
        reason:
          'Protein contributes to the growth and maintenance of muscle mass — a ' +
          'shake on the way out the door covers it when there’s no time to cook.',
      },
    ],
  }),

  addOns: [
    {
      slotId: 'early-shift-addon-magnesium',
      slotType: 'sleep',
      title: 'Evening Wind-Down',
      productId: 'chrgd-magnesium',
      reason:
        'Early mornings only work if the nights do. Magnesium contributes to ' +
        'normal muscle function and to the reduction of tiredness and fatigue — ' +
        'take it in the evening to round the day off.',
    },
  ],

  workout: {
    title: 'Express Full Body',
    intro:
      'A tight, efficient session for when the clock is against you. Supersets ' +
      'keep it moving — in and out in 35–40 minutes.',
    warmup: '4–5 min brisk walk or skipping to raise the heart rate',
    exercises: [
      { name: 'Goblet squat', prescription: '3 × 10' },
      { name: 'Push-up (or dumbbell press)', prescription: '3 × 12' },
      { name: 'One-arm dumbbell row', prescription: '3 × 10 each side' },
      { name: 'Kettlebell swing', prescription: '3 × 15' },
      { name: 'Plank', prescription: '3 × 40 seconds' },
    ],
    rule: 'Superset the pairs, short rests, keep the intensity up — it’s a quick one.',
    finisher: '5 rounds: 20s hard bike / 40s easy',
    postWorkout: 'Protein shake on the commute, breakfast at your desk.',
  },

  howToUse: [
    { title: 'Electrolytes first', detail: 'Mix a serving as soon as you’re up — before coffee, before the session.' },
    { title: 'Stim-free scoop', detail: 'One scoop 15–20 minutes before you train, so nothing lingers into your workday.' },
    { title: 'Run Express Full Body', detail: 'Supersets, short rests — done in under 40 minutes.' },
    { title: 'Protein on the go', detail: 'Shake it in the car or at your desk on the way into the day.' },
  ],

  disclaimer:
    'Ease into early training if you’re new to it, and don’t train fasted if it ' +
    'leaves you light-headed. A stim-free pre-workout still isn’t a substitute ' +
    'for sleep.',

  metaTitle: 'Early Shift | CHRGD',
  metaDescription:
    'The 6am-before-work stack — stim-free pre-workout, electrolytes and protein ' +
    '— with an express full-body workout you can finish in 40 minutes.',
}
