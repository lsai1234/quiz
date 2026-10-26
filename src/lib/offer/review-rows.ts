/**
 * The offer's rows for the review pack (`docs/consult-review-pack.csv`).
 *
 * Two kinds:
 *   - The bonus terms: every condition "free" has to carry next to it (CAP
 *     Code 3.23–3.25). The committed pack lists them as set by default; the
 *     customer wording is drafted in Phase 4.
 *   - One row per product flagged as a hero, with the wording it was approved
 *     to carry. These are live hub data, not code, so they come from the Offer
 *     screen's "Download review rows", never the committed file.
 *
 * Pure.
 */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { CLAIMS } from '@/lib/consult/claims'
import { HERO_CHECK_LABEL, STACK_LEVELS, type BonusSettings } from './settings'
import { LEVEL_NAME } from './bonus-economics'
import type { HeroRow } from './view'

export function bonusTermRows(bonus: BonusSettings): ReviewRow[] {
  const where = 'Free bonus terms (Settings → Offer; customer wording in Phase 4)'
  const tiers = STACK_LEVELS.filter((t) => bonus.tiers.includes(t)).map((t) => LEVEL_NAME[t])
  return [
    ['Bonus terms', where, bonus.firstOrderOnly ? 'First order only, one per customer.' : 'Not limited to a first order.', 'Condition'],
    ['Bonus terms', where, `Stacks from £${bonus.minSubtotal} before any discount.`, 'Condition: minimum spend'],
    ['Bonus terms', where, `On ${tiers.length ? tiers.join(', ') : 'no'} stacks only, never the hero on its own.`, 'Condition: which stacks'],
    ['Bonus terms', where, 'While stocks last.', 'Condition'],
    [
      'Bonus terms',
      where,
      bonus.codes === 'better-of'
        ? 'Doesn’t combine with a discount code: you get whichever is worth more, and the receipt says which.'
        : 'Doesn’t combine with a discount code: a code replaces the bonus.',
      'Condition: codes',
    ],
    ['Bonus terms', where, 'On a subscription, it comes in the first box only.', 'Condition'],
    ['Bonus terms', where, 'Returns: to be drafted (Phase 4).', 'Condition: what happens on a return'],
    [
      'Bonus terms',
      where,
      'Never with a higher stack price, a smaller stack saving or an extra delivery charge.',
      'Rule (CAP Code 3.23–3.25). Not customer wording',
    ],
  ]
}

export function heroReviewRows(heroes: readonly HeroRow[]): ReviewRow[] {
  return heroes
    .filter((h) => h.approval.hero)
    .map((h): ReviewRow => {
      const claim = h.approval.claimId && h.approval.claimId !== 'none' ? CLAIMS[h.approval.claimId]?.wording : null
      const checked = h.approval.checkedBy ? `Checked by ${h.approval.checkedBy}${h.approval.checkedAt ? ` on ${h.approval.checkedAt}` : ''}` : 'Not checked'
      const missing = h.missing.length ? `. Missing: ${h.missing.map((m) => HERO_CHECK_LABEL[m]).join('; ')}` : ''
      return [
        'Hero products',
        `Hero: ${h.title} (${h.productId}, ${h.swapGroup ?? 'not in the catalogue'})`,
        claim ?? (h.approval.claimId === 'none' ? 'No claim' : 'Wording not decided'),
        `${h.status === 'approved' ? 'Approved' : 'Checks missing'}. ${checked}. Novel food: ${h.approval.novelFood}${missing}`,
      ]
    })
}
