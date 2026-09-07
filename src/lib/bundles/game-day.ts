import type { WorkoutBundle } from './types'

// ─── Game Day ─────────────────────────────────────────────────────────────────
// The team-sport performance stack: hydration for high sweat-rate sports,
// energy and focus before kick-off, creatine as the daily base. Claim-safe:
// creatine's authorised performance claim only, hydration framed as a routine.

export const GAME_DAY: WorkoutBundle = {
  slug: 'game-day',
  name: 'Game Day',
  tagline: 'Hydrated. Sharp. Ready for kick-off.',
  seriesName: 'Session Stacks',
  description:
    'Built for football, rugby, 5-a-side and everything with a whistle. ' +
    'Electrolytes for the sweat you’ll lose, energy and focus before you go on, ' +
    'and creatine as the daily base for the repeated sprints a match demands. ' +
    'Turn up ready, not running on empty.',
  honestyLine: 'It won’t win you the game. It’ll make sure you’re not the reason you lost it.',

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
      title: 'Speed & Agility',
      intro:
        'A pitch-side session for the days between matches: short sprints, changes ' +
        'of direction and a bit of power. Full recovery between efforts — this is ' +
        'quality, not conditioning.',
      warmup: '8–10 min jog, dynamic leg swings and open/close-the-gate drills',
      exercises: [
        { name: 'Acceleration sprints (20m)', prescription: '6 × full effort' },
        { name: 'Lateral shuffle + sprint', prescription: '4 each direction' },
        { name: '5-10-5 pro agility drill', prescription: '5 reps' },
        { name: 'Broad jump', prescription: '4 × 3' },
        { name: 'Nordic hamstring curl', prescription: '3 × 5' },
      ],
      rule: 'Walk back and fully recover between sprints. Tired sprinting just teaches you to be slow.',
      finisher: '3 × 30m strides at 80% to finish loose',
      postWorkout: 'Electrolytes and water in, protein or a meal within a couple of hours.',
    },
  ],

  howToUse: [
    { title: 'Electrolytes before & during', detail: 'A serving before kick-off, top up at half-time and keep water on the sideline.' },
    { title: 'Pre-match scoop', detail: 'One scoop 20–30 minutes before you go on — earlier for morning fixtures.' },
    { title: 'Creatine, daily', detail: 'One scoop every day through the week, not just on match day.' },
    { title: 'Train between games', detail: 'Run Speed & Agility on a mid-week day with full recovery between efforts.' },
  ],

  disclaimer:
    'Warm up thoroughly before sprinting and don’t sprint through a niggle. If ' +
    'you play in heat, prioritise fluids and pace yourself — supplements don’t ' +
    'replace sensible hydration and rest.',

  metaTitle: 'Game Day | CHRGD',
  metaDescription:
    'The team-sport stack — electrolytes, pre-workout and creatine — with a ' +
    'speed-and-agility session for the days between matches. Hydrated. Sharp. Ready.',
}
