/**
 * Tips for their stack, and the common questions about each kind of product.
 *
 * Scripted, in the review pack (`tipRows`). Practical only: mixing, taste,
 * habits, timing on their own day, storing, travelling. Never what a product
 * does for anyone's health, never a dose beyond "the amount on your guide",
 * and nothing that predicts a feeling. Where a question touches medicines or
 * health, the answer sends them to a pharmacist or GP.
 */
import type { PourAnchor, SwapGroup } from '@/lib/catalogue/types'

export type TipTopic = 'mixing' | 'taste' | 'habit' | 'timing' | 'storage' | 'travel' | 'training'

export interface Tip {
  id: string
  title: string
  text: string
  topic: TipTopic
  /** Shown only to someone with one of these in their box. */
  kinds?: SwapGroup[]
  /** Or with something taken at one of these moments. */
  moments?: PourAnchor[]
  /** Only for people who train. */
  trains?: boolean
}

const PROTEIN: SwapGroup[] = ['protein-whey', 'protein-plant', 'protein-mass', 'protein-clear']
const POWDERS: SwapGroup[] = [...PROTEIN, 'creatine', 'pre-workout-stim', 'pre-workout-stim-free', 'aminos', 'electrolytes', 'greens', 'collagen', 'fibre']
const CAPSULES: SwapGroup[] = ['omega-3', 'magnesium', 'vitamin-d', 'multivitamin', 'joint-support', 'sleep-support', 'adaptogen', 'probiotic', 'vitamin-c', 'menopause', 'vitamin-b', 'zma']

export const TIPS: Tip[] = [
  // Protein
  { id: 'protein-liquid-first', title: 'Liquid first', text: 'Pour your milk or water into the shaker before the powder. It mixes smoother and nothing sticks in the corners.', topic: 'mixing', kinds: PROTEIN },
  { id: 'protein-cold', title: 'Colder tastes better', text: 'Shake with ice-cold water or milk, or a couple of ice cubes. Protein shakes taste noticeably better cold.', topic: 'taste', kinds: PROTEIN },
  { id: 'protein-oats', title: 'Stir it into breakfast', text: 'A scoop stirs into overnight oats or yoghurt. Add it after cooking, not while it is on the heat.', topic: 'mixing', kinds: ['protein-whey', 'protein-plant'] },
  { id: 'protein-blend', title: 'Make it a smoothie', text: 'Blend a scoop with a banana, a handful of frozen berries and milk for something closer to a milkshake.', topic: 'taste', kinds: ['protein-whey', 'protein-plant', 'protein-mass'] },
  { id: 'protein-bag-ready', title: 'Bag it the night before', text: 'Tip tomorrow’s scoop into a dry shaker tonight. In the morning, add water and go.', topic: 'habit', kinds: PROTEIN, trains: true },
  { id: 'clear-whey-ice', title: 'Mix it like squash', text: 'Clear protein mixes best in cold water with plenty of ice. Let the foam settle for a minute before you drink it.', topic: 'mixing', kinds: ['protein-clear'] },
  { id: 'mass-split', title: 'Split a big serving', text: 'If a full serving feels like a lot at once, have half after training and half later in the day.', topic: 'habit', kinds: ['protein-mass'] },
  // Creatine
  { id: 'creatine-anchor', title: 'Tie it to something you already do', text: 'Creatine works with whatever drink you have at the moment on your guide. Keep the tub next to the kettle or your bottle so you see it.', topic: 'habit', kinds: ['creatine'] },
  { id: 'creatine-every-day', title: 'Every day, not just training days', text: 'Your guide has creatine every day, rest days included. A daily reminder in your calendar makes it automatic.', topic: 'timing', kinds: ['creatine'] },
  { id: 'creatine-stir', title: 'Stir, then drink', text: 'Creatine can settle at the bottom of a glass. Give it a stir and drink it straight away.', topic: 'mixing', kinds: ['creatine'] },
  // Pre-workout
  { id: 'pre-timing', title: 'Half an hour before', text: 'Your guide puts pre-workout about 30 minutes before you train. Mix it as you get changed.', topic: 'timing', kinds: ['pre-workout-stim', 'pre-workout-stim-free'], trains: true },
  { id: 'pre-late', title: 'Training late?', text: 'If you train in the evening, you might prefer the stim-free version. You can swap in your hub.', topic: 'timing', kinds: ['pre-workout-stim'], trains: true },
  { id: 'pre-water', title: 'Enough water', text: 'Mix pre-workout with the amount of water on the label. Too little makes it taste much stronger.', topic: 'mixing', kinds: ['pre-workout-stim', 'pre-workout-stim-free'] },
  // Hydration
  { id: 'electrolytes-bottle', title: 'In your bottle', text: 'Drop a serving into your training bottle so it is ready when you are.', topic: 'habit', kinds: ['electrolytes', 'aminos'], trains: true },
  { id: 'electrolytes-flavour', title: 'Too strong?', text: 'Add more water. The flavour should taste light, not syrupy.', topic: 'taste', kinds: ['electrolytes', 'aminos'] },
  // Greens and fibre
  { id: 'greens-juice', title: 'Mix it with juice', text: 'Greens taste milder mixed into orange or apple juice, or blended into a smoothie.', topic: 'taste', kinds: ['greens'] },
  { id: 'greens-shake-hard', title: 'Shake, don’t stir', text: 'Greens powders clump when stirred. A shaker with a ball, or a quick blend, keeps it smooth.', topic: 'mixing', kinds: ['greens', 'collagen'] },
  { id: 'fibre-quick', title: 'Drink it quickly', text: 'Psyllium thickens fast. Mix with a full glass of water and drink it straight away, then have another glass.', topic: 'mixing', kinds: ['fibre'] },
  // Collagen
  { id: 'collagen-coffee', title: 'Into your morning drink', text: 'Unflavoured collagen dissolves into coffee or tea. Stir it in after pouring.', topic: 'mixing', kinds: ['collagen'] },
  // Capsules
  { id: 'caps-by-toothbrush', title: 'Next to your toothbrush', text: 'Capsules taken at the same moment every day are easiest to remember. Keep them where that moment happens.', topic: 'habit', kinds: CAPSULES },
  { id: 'caps-weekly-box', title: 'A weekly pill box', text: 'Fill a seven-day box on Sunday. One glance tells you whether today’s are done.', topic: 'habit', kinds: CAPSULES },
  { id: 'omega-fridge', title: 'Keep it cool', text: 'Store omega-3 somewhere cool and dark, and close the lid tightly after each use.', topic: 'storage', kinds: ['omega-3'] },
  { id: 'omega-with-meal', title: 'With a meal', text: 'Your guide puts omega-3 with a meal. Taking it with food is also what most people find easiest.', topic: 'timing', kinds: ['omega-3', 'vitamin-d', 'multivitamin'] },
  { id: 'evening-wind-down', title: 'Part of winding down', text: 'Evening capsules fit best into a routine you already have: the same time as brushing your teeth or setting an alarm.', topic: 'habit', kinds: ['magnesium', 'sleep-support', 'zma'], moments: ['wind-down', 'evening'] },
  { id: 'fizz-glass', title: 'A full glass', text: 'Drop effervescent tablets into a full glass of water and wait for the fizz to stop before drinking.', topic: 'mixing', kinds: ['vitamin-c', 'multivitamin'] },
  // Timing on their day
  { id: 'morning-batch', title: 'One morning moment', text: 'Everything on your guide for the morning can go together, so it is one habit rather than several.', topic: 'timing', moments: ['morning'] },
  { id: 'post-workout-pack', title: 'Pack it in your gym bag', text: 'Put your after-training serving in your bag the night before, so it comes with you.', topic: 'habit', moments: ['post-workout'], trains: true },
  { id: 'calendar-reminders', title: 'Let your calendar remember', text: 'Add your guide’s reminders to your calendar from your hub. Each one arrives at its moment on your day.', topic: 'habit' },
  { id: 'missed-one', title: 'Missed one?', text: 'Carry on at the next moment on your guide. There’s no need to double up.', topic: 'timing' },
  // Storage and travel
  { id: 'dry-scoop', title: 'Keep the scoop dry', text: 'A wet scoop clumps the whole tub. Dry your hands and the scoop before you use them.', topic: 'storage', kinds: POWDERS },
  { id: 'tub-closed', title: 'Close it properly', text: 'Seal tubs and pouches after every use and keep them out of a steamy kitchen or bathroom.', topic: 'storage', kinds: POWDERS },
  { id: 'travel-bags', title: 'Travelling?', text: 'Measure servings into small labelled bags or a pill organiser. Keep them in their original packaging when flying if you can.', topic: 'travel' },
  // Training
  { id: 'train-log', title: 'Note your best set', text: 'In your training plan, note the weight and reps of your best set. Next time, the plan suggests what to try.', topic: 'training', trains: true },
  { id: 'train-calendar', title: 'Put training in your diary', text: 'Add your training week to your calendar from your plan. A session with a time is easier to keep.', topic: 'training', trains: true },
  { id: 'train-walk', title: 'Rest days still count', text: 'A walk on a rest day keeps the habit going without adding a hard session.', topic: 'training', trains: true },
  { id: 'train-kit-night-before', title: 'Lay out your kit', text: 'Put your training clothes out the night before. It is one less decision in the morning.', topic: 'training', trains: true },
]

export interface Faq {
  q: string
  a: string
  kinds?: SwapGroup[]
}

export const FAQS: Faq[] = [
  { q: 'How much do I take?', a: 'The amount on your guide, which is the label’s serving for how you said you use it. Don’t go over the label.' },
  { q: 'What if I miss a day?', a: 'Carry on at the next moment on your guide. There’s no need to make up for it.' },
  { q: 'Can I take it with my other products?', a: 'Your guide gives each product its own moment on your day. If you take any medicine, check with a pharmacist first.' },
  { q: 'How should I store it?', a: 'Somewhere cool and dry, sealed after each use, out of reach of children. The label has the details.' },
  { q: 'When will I need more?', a: 'Your hub shows when each product is due to run out, and opens your member price about a week before.' },
  { q: 'Can I mix it with milk?', a: 'Yes: milk makes it thicker and creamier, water makes it lighter. Pour the liquid in first.', kinds: ['protein-whey', 'protein-mass', 'protein-plant'] },
  { q: 'Can I take it on rest days?', a: 'Yes. Your guide keeps it on every day, training or not.', kinds: ['creatine'] },
  { q: 'Is it OK with coffee?', a: 'It mixes into coffee, but check the label: some pre-workouts already contain caffeine.', kinds: ['pre-workout-stim', 'creatine', 'collagen'] },
  { q: 'Can I travel with capsules?', a: 'Yes. Keep them in their original pot where you can, and take a few days extra.', kinds: ['omega-3', 'magnesium', 'vitamin-d', 'multivitamin', 'sleep-support', 'adaptogen', 'probiotic', 'menopause'] },
]
