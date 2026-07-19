import type { PrebuiltBundle } from './types'
import { bundleBlueprint } from './builders'

// ─── Wind-Down Sunday ─────────────────────────────────────────────────────────
// The low-intensity, recovery-first bundle: gentle movement and an evening
// routine to set up the week. Claim-safe: greens/omega framed as everyday
// routine, the night pour as part of a wind-down (no sleep-aid claims).

export const WIND_DOWN_SUNDAY: PrebuiltBundle = {
  slug: 'wind-down-sunday',
  name: 'Wind-Down Sunday',
  tagline: 'Move gently. Reset properly. Start Monday ahead.',
  seriesName: 'Recovery Rituals',
  description:
    'The opposite of a hard session — the Sunday that sets your week up. Easy ' +
    'movement, a greens blend as part of your daily routine, omega-3 for your ' +
    'everyday health baseline, and an evening pour to close the weekend down. ' +
    'Low effort, high consistency.',
  honestyLine: 'Not a session. A ritual — and the boring weeks are the ones that add up.',

  blueprint: bundleBlueprint({
    slug: 'wind-down-sunday',
    name: 'Wind-Down Sunday',
    summary: 'Super greens, omega-3 and an evening pour — the recovery-first Sunday routine, with mobility to match.',
    primaryGoal: 'recovery',
    secondaryGoals: ['gut-health', 'sleep-better'],
    profile: 'Recovery-focused — values consistency over intensity',
    estOneOff: 67.97,
    estSub: 44,
    cores: [
      {
        slotType: 'gut',
        title: 'Daily Greens',
        description: 'Part of the everyday routine',
        productId: 'chrgd-super-greens',
        swapGroup: 'greens',
        reason:
          'A greens blend with added vitamins and minerals, made a fixed part of ' +
          'your day. Easy to keep up on a slow Sunday and a simple anchor for the ' +
          'week ahead.',
      },
      {
        slotType: 'health',
        title: 'Everyday Base',
        description: 'Your daily health baseline',
        productId: 'chrgd-omega-3',
        swapGroup: 'omega-3',
        reason:
          'Omega-3 as part of your everyday health routine — one of the quiet, ' +
          'take-it-daily basics that only works if you’re consistent, which is ' +
          'what a Sunday ritual is for.',
      },
      {
        slotType: 'sleep',
        title: 'Evening Pour',
        description: 'Close the weekend down',
        productId: 'chrgd-night-pour',
        swapGroup: 'sleep-support',
        reason:
          'A warm evening drink to make winding down a habit rather than an ' +
          'afterthought — part of a proper routine of screens-down, lights-low ' +
          'and a consistent bedtime.',
      },
    ],
  }),

  addOns: [
    {
      slotId: 'wind-down-addon-electrolytes',
      slotType: 'hydration',
      title: 'Rehydrate',
      productId: 'chrgd-electrolytes',
      reason:
        'The optional hydration add-on — a serving of electrolytes to top up ' +
        'your fluids as part of the reset, especially after an active weekend.',
    },
  ],

  workout: {
    title: 'Mobility & Reset',
    intro:
      'Not a workout so much as a reset — gentle mobility and a walk to loosen ' +
      'off and feel human again. Take it slow; there’s nothing to chase here.',
    warmup: '5-minute easy walk to warm up',
    exercises: [
      { name: 'Cat-cow', prescription: '2 × 10 slow reps' },
      { name: 'World’s greatest stretch', prescription: '2 × 5 each side' },
      { name: '90/90 hip switches', prescription: '2 × 8 each side' },
      { name: 'Thoracic rotations', prescription: '2 × 8 each side' },
      { name: 'Dead hang', prescription: '3 × 20–30 seconds' },
    ],
    rule: 'Ease into every position — never force a stretch. This should feel good, not hard.',
    finisher: '20–30 minute easy walk outside',
    postWorkout: 'A greens drink, a good meal, and an early wind-down.',
  },

  howToUse: [
    { title: 'Greens in the morning', detail: 'Mix a serving with water first thing — the anchor for the day.' },
    { title: 'Omega with a meal', detail: 'Take it with food at the same time each day so it becomes automatic.' },
    { title: 'Mobility & a walk', detail: 'Run Mobility & Reset, then get outside for an easy walk.' },
    { title: 'Evening pour', detail: 'A warm pour as you wind down — screens off, lights low, a consistent bedtime.' },
  ],

  disclaimer:
    'A wind-down routine supports good habits — it isn’t a treatment for sleep ' +
    'problems. Speak to your GP if you regularly struggle to sleep or feel run ' +
    'down.',

  metaTitle: 'Wind-Down Sunday | CHRGD',
  metaDescription:
    'The recovery-first Sunday routine — super greens, omega-3 and an evening ' +
    'pour — paired with gentle mobility and a walk. Move gently. Reset properly.',
}
