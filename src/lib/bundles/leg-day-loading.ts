import type { PrebuiltBundle } from './types'
import { bundleBlueprint } from './builders'

// ─── Leg Day Loading ──────────────────────────────────────────────────────────
// The heavy lower-body session stack. Claim-safe throughout: performance and
// muscle-maintenance language only, no recovery "healing" or "repair" promises
// beyond the authorised protein claim.

export const LEG_DAY_LOADING: PrebuiltBundle = {
  slug: 'leg-day-loading',
  name: 'Leg Day Loading',
  tagline: 'Fuel it. Move it. Refuel it.',
  seriesName: 'Session Stacks',
  description:
    'The stack for the session you don’t skip. Energy and focus going in, ' +
    'creatine as the daily performance base, and protein to refuel after the ' +
    'heaviest sets of your week. Built around one honest idea: turn up prepared, ' +
    'leave having done the work.',
  honestyLine: 'No magic numbers on the bar. Just showing up loaded.',

  blueprint: bundleBlueprint({
    slug: 'leg-day-loading',
    name: 'Leg Day Loading',
    summary: 'Pre-workout, creatine and protein — the heavy-session trio, plus a lower-body workout to match.',
    primaryGoal: 'performance',
    secondaryGoals: ['muscle', 'energy'],
    profile: 'Lower-body strength focus — trains hard, refuels properly',
    estOneOff: 79.97,
    estSub: 52,
    cores: [
      {
        slotType: 'energy',
        title: 'Pre-Workout',
        description: 'Energy and focus into the session',
        productId: 'chrgd-pre-workout',
        swapGroup: 'pre-workout-stim',
        reason:
          'One scoop 20–30 minutes before you train, for energy and focus going ' +
          'into the heavy sets. Skip it late in the evening — the caffeine sticks ' +
          'around for hours.',
      },
      {
        slotType: 'performance',
        title: 'Performance',
        description: 'The daily strength base',
        productId: 'chrgd-creatine',
        swapGroup: 'creatine',
        reason:
          'Creatine increases physical performance in successive bursts of ' +
          'short-term, high-intensity exercise. Take it every day — not just on ' +
          'leg day — because it works by staying topped up.',
      },
      {
        slotType: 'protein',
        title: 'Protein',
        description: 'Refuel the big sets',
        productId: 'chrgd-whey-protein',
        swapGroup: 'protein-whey',
        reason:
          'Protein contributes to the growth and maintenance of muscle mass. A ' +
          'shake after training is the simple way to hit your target on the days ' +
          'you’ve worked hardest.',
      },
    ],
  }),

  addOns: [
    {
      slotId: 'leg-day-addon-bcaa',
      slotType: 'recovery',
      title: 'Intra-Session',
      productId: 'chrgd-bcaa',
      reason:
        'The optional sip-through-your-session add-on — amino acids and fluid to ' +
        'keep you going through a long lower-body workout.',
    },
  ],

  workout: {
    title: 'Heavy Lower',
    intro:
      'A straightforward strength session built around the squat and hinge. ' +
      'Progress the top sets when they move well; keep the accessories honest.',
    warmup: '6–8 min bike, then 2 light ramp-up sets of the first lift',
    exercises: [
      { name: 'Back squat', prescription: '4 × 5' },
      { name: 'Romanian deadlift', prescription: '3 × 8' },
      { name: 'Bulgarian split squat', prescription: '3 × 10 each leg' },
      { name: 'Leg press', prescription: '3 × 12' },
      { name: 'Seated calf raise', prescription: '4 × 15' },
      { name: 'Hanging knee raise', prescription: '3 × 12' },
    ],
    rule: 'Two hard sets beat five sloppy ones. Stop each set with clean reps left.',
    finisher: '90-second sled push or carry, ×3',
    postWorkout: 'Protein shake within the hour, then a real meal.',
  },

  howToUse: [
    { title: 'Pre-workout, 20 min out', detail: 'One scoop with water before you leave. Not after 4pm if you train late.' },
    { title: 'Creatine, every day', detail: 'One scoop daily — training or rest day. Consistency is the whole point.' },
    { title: 'Run Heavy Lower', detail: 'Work the top sets, keep the accessories clean. Log your numbers.' },
    { title: 'Protein after', detail: 'A shake straight after the session, then eat a proper meal later.' },
  ],

  disclaimer:
    'Lift within your ability and use a spotter or safety pins on the big lifts. ' +
    'Build load gradually — chasing numbers when you’re not ready is how people ' +
    'get hurt.',

  metaTitle: 'Leg Day Loading | CHRGD',
  metaDescription:
    'The heavy-session stack — pre-workout, creatine and protein — paired with a ' +
    'straightforward lower-body strength workout. Fuel it. Move it. Refuel it.',
}
