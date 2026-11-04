/**
 * The words of the charge levels and box services (Option 1, levels that
 * unlock a service). Scripted, one file, in the review pack (`levelCopyRows`).
 *
 * A service is named only while it is switched on in the Founders Hub
 * (`ServiceSettings`), and says what the customer gets, never what it does for
 * their health. The pharmacist check is a safety review of the box against
 * what they told us, not advice on what to take; the vitamin D test returns a
 * number from an accredited lab, not a diagnosis.
 */
import type { ChargeLevelId } from './levels'

export const LEVEL_COPY = {
  heading: 'Your box comes with',
  level: { charged: 'Charged', supercharged: 'Supercharged', fully: 'Fully charged' } satisfies Record<ChargeLevelId, string>,
  /** The level line, with how far the next one is. */
  youAre: (level: string) => `${level}`,
  nextLevel: (more: number, level: string) => `${more} more product${more === 1 ? '' : 's'} for ${level}`,
  topLevel: 'Every level unlocked',
  at: (level: string) => `at ${level}`,

  service: {
    guide: 'Your stack guide: when to take each one, on your day',
    reminders: 'Reminders at your times, in your calendar',
    checkIns: 'Amp checks in every two weeks, and your box changes in one tap',
    swaps: 'Swap any product, any time',
    guarantee: 'First-box guarantee: not right for you? Your money back on the first box',
    pharmacistCheck: 'A UK pharmacist checks your box against what you told us',
    vitaminDTest: 'An at-home vitamin D test, through an accredited lab',
    rate: (pct: number) => `${pct}% off every month`,
  },
  /** Beside the guarantee, wherever it is said. */
  guaranteeConditions: 'First box only, one per customer. Ask within 30 days of delivery.',
  guaranteeTerms: 'Guarantee terms',
} as const
