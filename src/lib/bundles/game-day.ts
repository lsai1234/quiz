import type { PrebuiltBundle } from './types'
import { bundleBlueprint } from './builders'

// ─── Game Day ─────────────────────────────────────────────────────────────────
// The team-sport performance stack: hydration for high sweat-rate sports,
// energy and focus before kick-off, creatine as the daily base. Claim-safe:
// creatine's authorised performance claim only, hydration framed as a routine.

export const GAME_DAY: PrebuiltBundle = {
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

  blueprint: bundleBlueprint({
    slug: 'game-day',
    name: 'Game Day',
    summary: 'Electrolytes, pre-workout and creatine — the match-day trio, with a speed-and-agility session to match.',
    primaryGoal: 'hydration',
    secondaryGoals: ['performance', 'energy'],
    profile: 'Team-sport athlete — matches and training through the week',
    estOneOff: 67.97,
    estSub: 44,
    cores: [
      {
        slotType: 'hydration',
        title: 'Hydration',
        description: 'Replace what you sweat',
        productId: 'chrgd-electrolytes',
        swapGroup: 'electrolytes',
        reason:
          'High sweat-rate sports lose a lot of fluid and electrolytes. A serving ' +
          'before kick-off and another at half-time keeps your hydration routine ' +
          'on track through 90 minutes.',
      },
      {
        slotType: 'energy',
        title: 'Pre-Match',
        description: 'Energy and focus before you go on',
        productId: 'chrgd-pre-workout',
        swapGroup: 'pre-workout-stim',
        reason:
          'One scoop 20–30 minutes before kick-off for energy and focus. Take it ' +
          'earlier for morning games so it’s working when the whistle goes.',
      },
      {
        slotType: 'performance',
        title: 'Performance',
        description: 'The daily base for repeated sprints',
        productId: 'chrgd-creatine',
        swapGroup: 'creatine',
        reason:
          'Creatine increases physical performance in successive bursts of ' +
          'short-term, high-intensity exercise — exactly the repeated-sprint ' +
          'pattern of a match. Take it every day, not just on game day.',
      },
    ],
  }),

  addOns: [
    {
      slotId: 'game-day-addon-omega',
      slotType: 'health',
      title: 'Everyday Base',
      productId: 'chrgd-omega-3',
      reason:
        'The optional everyday-health add-on for a busy fixture list — omega-3 ' +
        'as part of your daily routine across a long season.',
    },
  ],

  workout: {
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
