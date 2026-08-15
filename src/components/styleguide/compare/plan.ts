/**
 * The data both variants render.
 *
 * One source, imported by both, so the comparison is a comparison of design and
 * nothing else. Every figure, product name, date and sentence below appears
 * identically in each version — `compare.test.tsx` asserts that the two render
 * the same words, because the moment the "after" gets better copy or an extra
 * reassurance the test stops measuring what it claims to.
 *
 * Fixed rather than live: the page has to render the same for whoever opens the
 * link, without a session, and a preference test where two people saw different
 * numbers is not a test.
 */

export interface PlanLine {
  id: string
  slot: string
  title: string
  variant: string
  cadence: string
  price: number
  status: { label: string; tone: 'good' | 'building' | 'essential' | 'review' }
  /** How far through its effect window this product is, 0–100. */
  progress: number | null
}

export const PLAN = {
  greeting: 'Welcome back',
  nextBox: {
    /** Fixed so the screenshot is reproducible; the copy says the same either way. */
    dateLabel: 'Friday 12 September',
    countdown: 'ships in 6 days',
    itemTitles: ['Magnesium Glycinate', 'Creatine Monohydrate', 'Vitamin D3 + K2', 'Omega-3'],
  },
  monthly: 47.5,
  dispatchDay: 12,
  dispatchDayOrdinal: '12th',
  nextCharge: { amount: 47.5, dateLabel: 'Fri 12 September' },
  settlement: 18.4,
  lines: [
    {
      id: 'l1',
      slot: 'Recovery',
      title: 'Magnesium Glycinate',
      variant: '120 capsules',
      cadence: 'every month',
      price: 14,
      status: { label: 'Working', tone: 'good' },
      progress: null,
    },
    {
      id: 'l2',
      slot: 'Performance',
      title: 'Creatine Monohydrate',
      variant: '500g unflavoured',
      cadence: 'every month',
      price: 16.5,
      status: { label: 'Building', tone: 'building' },
      progress: 68,
    },
    {
      id: 'l3',
      slot: 'Foundation',
      title: 'Vitamin D3 + K2',
      variant: '90 softgels',
      cadence: 'every 2 months',
      price: 9,
      status: { label: 'Essential', tone: 'essential' },
      progress: null,
    },
    {
      id: 'l4',
      slot: 'Foundation',
      title: 'Omega-3',
      variant: '120 softgels',
      cadence: 'every month',
      price: 8,
      status: { label: 'Worth a look', tone: 'review' },
      progress: null,
    },
  ] satisfies PlanLine[],
} as const

export function gbp(amount: number): string {
  return `£${amount.toFixed(2)}`
}

/** The copy that must be identical in both variants. Kept here so it cannot drift. */
export const COPY = {
  eyebrow: 'Your subscription',
  nextEyebrow: `Your next box · ${PLAN.nextBox.countdown}`,
  editNext: 'Edit next box',
  add: 'Add',
  billingEyebrow: 'How you’re billed',
  billingBody: `One flat amount on the ${PLAN.dispatchDayOrdinal} each month — it covers your whole stack, spread evenly so you never get a lumpy bill, however often each item ships.`,
  nextChargeLabel: 'Next charge',
  settlement: `No minimum term — cancel or pause anytime. As things stand you'd settle around ${gbp(PLAN.settlement)} for what's already been sent to you, and nothing more. You'll see the exact figure, itemised, before you confirm.`,
  stackEyebrow: 'Your stack',
  stackSub: `${PLAN.lines.length} products · ${gbp(PLAN.monthly)} a month`,
  addProduct: 'Add product',
  change: 'Change',
  manage: 'Manage',
} as const
