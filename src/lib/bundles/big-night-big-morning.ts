import type { WorkoutBundle } from './types'

// ─── Big Night, Big Morning ───────────────────────────────────────────────────
// The first creator-led prebuilt bundle: the weekend reset stack. All customer
// copy sticks to authorised-claim-safe language — hydration routine / reset /
// back on track. Never "cures", "prevents", "detoxes" or "fixes" anything.

export const BIG_NIGHT_BIG_MORNING: WorkoutBundle = {
  slug: 'big-night-big-morning',
  name: 'Big Night, Big Morning',
  tagline: 'Hydrate. Move. Refuel. Reset.',
  seriesName: 'Sunday Reset Sessions',
  description:
    'Built for the morning after the night before — when you want to hydrate, ' +
    'move, refuel and get back on track. Electrolytes for your hydration ' +
    'routine, creatine as the daily training non-negotiable, and protein to ' +
    'refuel after the session. No overcomplicated routine. No miracle claims. ' +
    'Just the essentials for people who still show up.',
  honestyLine: 'Not a hangover cure. Just the get-back-on-track stack.',

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
      title: 'Full Body Reset',
      intro:
        'A low-barrier, saveable session for when you feel rough but still want ' +
        'to do something. Nothing heroic — no ego lifting, no maxing out. Save it ' +
        'for your next Sunday reset.',
      warmup: '8–10 min incline walk or easy bike',
      exercises: [
        { name: 'Goblet squat', prescription: '3 × 10' },
        { name: 'Dumbbell bench press', prescription: '3 × 8' },
        { name: 'Lat pulldown', prescription: '3 × 10' },
        { name: 'Romanian deadlift', prescription: '3 × 8' },
        { name: 'Cable row', prescription: '2 × 12' },
        { name: 'Farmer carries', prescription: '3 × 30 seconds' },
      ],
      rule: 'Leave 2–3 reps in the tank on every set. No maxing out today.',
      finisher: '5–8 min easy bike or walk',
      postWorkout: 'Protein shake now, proper meal later.',
    },
  ],

  howToUse: [
    { title: 'Wake up, water first', detail: 'Before coffee, before anything — get a big glass of water in.' },
    { title: 'Mix your electrolytes', detail: 'One serving of the Electrolyte Mix before training. Keep water with you throughout.' },
    { title: 'Easy full-body session', detail: 'Run the Full Body Reset workout below. Low pressure — today is about moving, not PBs.' },
    { title: 'Creatine, daily', detail: 'One scoop, every day — training or not. Consistency is the whole point.' },
    { title: 'Protein after training', detail: 'A shake straight after, then a proper meal when your appetite comes back.' },
  ],

  disclaimer:
    'Not a hangover cure. Do not exercise if you feel seriously unwell — ' +
    'listen to your body; today is about easing back in. Drink responsibly.',

  metaTitle: 'Big Night, Big Morning | CHRGD',
  metaDescription:
    'The CHRGD weekend reset stack — electrolytes, creatine and protein, ' +
    'paired with a low-pressure full-body workout you can actually do. ' +
    'Hydrate. Move. Refuel. Reset.',
}
