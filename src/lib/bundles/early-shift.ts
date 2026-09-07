import type { WorkoutBundle } from './types'

// ─── Early Shift ──────────────────────────────────────────────────────────────
// The 6am-before-work stack. Stim-free energy so the caffeine timing never
// wrecks the rest of the day, hydration to wake the body up, protein to make
// breakfast easy. Claim-safe: no "burns fat", no "detox".

export const EARLY_SHIFT: WorkoutBundle = {
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

  /*
    No stack yet.

    The products that used to be written into this file are now a PRE-BUILT
    BUNDLE — a named stack authored in the Hub and shared by every session that
    sells it. Point this package at one there; until then it prices at nothing,
    readiness says so, and the shop leaves it off the shelf rather than showing
    a package nobody can buy.
  */
  productBundleSlug: null,

  workouts: [
    {
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
  ],

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
