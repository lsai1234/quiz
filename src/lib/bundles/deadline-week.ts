import type { WorkoutBundle } from './types'

// ─── Deadline Week ────────────────────────────────────────────────────────────
// The stack for a flat-out week when training is the thing that keeps you sane.
// Deliberately claim-safe: NO stress/anxiety/cortisol claims (none authorised).
// Ashwagandha is framed only as part of an evening routine; the multivitamin and
// magnesium carry their authorised, general claims.

export const DEADLINE_WEEK: WorkoutBundle = {
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
  ],

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
