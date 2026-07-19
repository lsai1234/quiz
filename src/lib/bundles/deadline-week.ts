import type { PrebuiltBundle } from './types'
import { bundleBlueprint } from './builders'

// ─── Deadline Week ────────────────────────────────────────────────────────────
// The stack for a flat-out week when training is the thing that keeps you sane.
// Deliberately claim-safe: NO stress/anxiety/cortisol claims (none authorised).
// Ashwagandha is framed only as part of an evening routine; the multivitamin and
// magnesium carry their authorised, general claims.

export const DEADLINE_WEEK: PrebuiltBundle = {
  slug: 'deadline-week',
  name: 'Deadline Week',
  tagline: 'Keep the routine. Ride out the week.',
  seriesName: 'Life Admin',
  description:
    'The week everything lands at once. This is the low-effort stack that keeps ' +
    'your basics covered when your schedule won’t: a daily multivitamin for the ' +
    'gaps a rushed week leaves, a stim-free lift so a quick session doesn’t cost ' +
    'you your evening, and an adaptogen as part of a proper wind-down.',
  honestyLine: 'It won’t clear your inbox. It’ll help you keep turning up while you do.',

  blueprint: bundleBlueprint({
    slug: 'deadline-week',
    name: 'Deadline Week',
    summary: 'Multivitamin, stim-free energy and an evening adaptogen — the keep-the-basics-covered stack for a flat-out week.',
    primaryGoal: 'health',
    secondaryGoals: ['energy', 'sleep-better'],
    profile: 'Busy stretch — training is the anchor, not the priority',
    estOneOff: 63.97,
    estSub: 41,
    cores: [
      {
        slotType: 'health',
        title: 'Daily Multivitamin',
        description: 'Cover the gaps a rushed week leaves',
        productId: 'chrgd-multivitamin',
        swapGroup: 'multivitamin',
        reason:
          'When meals get skipped and lunch is whatever’s nearest, a daily ' +
          'multivitamin helps cover the everyday vitamin and mineral gaps so your ' +
          'baseline doesn’t slide with your schedule.',
      },
      {
        slotType: 'energy',
        title: 'Stim-Free Pre-Workout',
        description: 'A quick session that won’t cost your evening',
        productId: 'chrgd-pre-workout-stim-free',
        swapGroup: 'pre-workout-stim-free',
        reason:
          'A caffeine-free lift so you can squeeze a session in late without it ' +
          'keeping you up — energy and focus for the workout, nothing lingering ' +
          'into an already short night.',
      },
      {
        slotType: 'sleep',
        title: 'Evening Wind-Down',
        description: 'Round the day off',
        productId: 'chrgd-ashwagandha',
        swapGroup: 'adaptogen',
        reason:
          'An adaptogen many people reach for during demanding stretches — make ' +
          'it a fixed part of your evening routine, alongside winding down properly ' +
          'and a consistent bedtime.',
      },
    ],
  }),

  addOns: [
    {
      slotId: 'deadline-week-addon-magnesium',
      slotType: 'sleep',
      title: 'Night Support',
      productId: 'chrgd-magnesium',
      reason:
        'The optional evening add-on. Magnesium contributes to normal muscle ' +
        'function and to the reduction of tiredness and fatigue — a simple ' +
        'addition to your wind-down when the week is heavy.',
    },
  ],

  workout: {
    title: 'Reset Circuit',
    intro:
      'A short, full-body circuit for when you’ve got 25 minutes and a busy head. ' +
      'Nothing technical — the goal is to move, break a sweat and clock off.',
    warmup: '3–4 min easy cardio, shoulder and hip circles',
    exercises: [
      { name: 'Bodyweight squat', prescription: '3 × 15' },
      { name: 'Incline press-up', prescription: '3 × 12' },
      { name: 'Dumbbell row', prescription: '3 × 12' },
      { name: 'Reverse lunge', prescription: '3 × 10 each leg' },
      { name: 'Dead bug', prescription: '3 × 10 each side' },
    ],
    rule: 'Steady, controlled reps. This is a reset, not a test — leave feeling better than you started.',
    finisher: '5-minute easy walk to cool down and clear your head',
    postWorkout: 'A glass of water, a proper meal, and an early night if you can.',
  },

  howToUse: [
    { title: 'Multivitamin with breakfast', detail: 'One dose in the morning with food — the same time every day so you don’t forget it.' },
    { title: 'Stim-free scoop when you train', detail: 'One scoop before a session, even a late one — no caffeine to keep you up.' },
    { title: 'Run the Reset Circuit', detail: '25 minutes, full body, low pressure. Movement over intensity this week.' },
    { title: 'Wind-down, every evening', detail: 'Ashwagandha as part of a real routine — screens down, lights low, consistent bedtime.' },
  ],

  disclaimer:
    'Supplements support a routine — they don’t replace sleep, rest or getting ' +
    'help when a week is genuinely too much. Speak to your GP before taking an ' +
    'adaptogen if you’re pregnant, breastfeeding or on medication.',

  metaTitle: 'Deadline Week | CHRGD',
  metaDescription:
    'The keep-the-basics-covered stack for a flat-out week — daily multivitamin, ' +
    'stim-free energy and an evening wind-down, with a 25-minute reset circuit.',
}
