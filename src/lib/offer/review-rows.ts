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
import { OFFER_COPY } from './copy'
import { freeGiftTerms } from './terms'

export function bonusTermRows(bonus: BonusSettings): ReviewRow[] {
  const where = 'Free bonus terms (Settings → Offer; customer wording below, "Free gift terms")'
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
    ['Bonus terms', where, 'Returns: see "Returns" in the free gift terms (draft).', 'Condition: what happens on a return'],
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

/**
 * Every sentence the results page says about the offer (`OFFER_COPY`), with
 * example figures where a sentence takes one. Scripted; the AI writes none.
 */
export function offerCopyRows(bonus: BonusSettings): ReviewRow[] {
  const where = 'Results page: Start here, the full stack and the free bonus (both quizzes)'
  const ex = 'Example figures; the live ones come from the hub and the catalogue'
  const c = OFFER_COPY
  return [
    ['Offer wording', where, c.startHere, 'Section heading'],
    ['Offer wording', where, c.heroLabel, 'Label on an approved hero'],
    ['Offer wording', where, c.topPickLabel, 'Label with the hero switch off, or no hero that fits'],
    ['Offer wording', where, c.topPickFallback(4), `Why it is theirs, when nothing better can be said. ${ex}`],
    ['Offer wording', where, c.whatItDoes, 'Above the approved register claim, verbatim'],
    ['Offer wording', where, c.whatYouGet, 'Above servings, cost per serving and how long it lasts'],
    ['Offer wording', where, c.delivered, 'Under the delivered price'],
    ['Offer wording', where, c.startWithThis, 'Button'],
    ['Offer wording', where, c.justThis, 'Under the button'],
    ['Offer wording', where, c.remote(3), ex],
    ['Offer wording', where, c.codeNotOnHero, 'When a code is applied'],
    ['Offer wording', where, c.fullStack, 'Section heading'],
    ['Offer wording', where, c.fullStackLine('Magnesium'), ex],
    ['Offer wording', where, c.moreFor(23.4, 'Vitamin C & Zinc'), `Next to the bonus conditions. ${ex}`],
    ['Offer wording', where, c.comesWith('Vitamin C & Zinc'), `On a depth that qualifies. ${ex}`],
    ['Offer wording', where, c.bonusReason, 'Why this gift'],
    ['Offer wording', where, c.bonusFrom('Vitamin C & Zinc', bonus.minSubtotal), `On a depth under the minimum. ${ex}`],
    ['Offer wording', where, c.bonusConditions(bonus.minSubtotal, bonus.firstOrderOnly), 'Next to every "free" about the bonus'],
    ['Offer wording', where, c.bonusOnSubscription, 'Next to the conditions on the subscription tab, and on the receipt'],
    ['Offer wording', where, c.bonusNoCode, 'Next to the conditions'],
    ['Offer wording', where, c.terms, 'Link to the free gift terms'],
    ['Offer wording', where, c.tierGift, 'Mark on a depth that comes with the gift'],
    ['Offer wording', where, `${c.receiptFree('Vitamin C & Zinc')} · £0.00`, `Receipt line. ${ex}`],
    ['Offer wording', where, c.worth(9.99), `Under the receipt line, only at its ordinary shop price. ${ex}`],
    ['Offer wording', where, c.codeBeatsBonus('Vitamin C & Zinc'), `Receipt, when a code is worth more. ${ex}`],
    ['Offer wording', where, c.bonusBeatsCode('Vitamin C & Zinc'), `Code box, when the gift is worth more. ${ex}`],
    ['Offer wording', where, `${c.stickyHero} · ${c.delivered}`, 'Sticky bar, with "Start here" chosen'],
    ['Offer wording', where, c.stickyHeroCta, 'Sticky bar button'],
  ]
}

/** The free gift terms page, as drafted, at the default settings. */
export function freeGiftTermRows(bonus: BonusSettings): ReviewRow[] {
  return freeGiftTerms(bonus).flatMap((section) =>
    section.lines.map((line): ReviewRow => ['Free gift terms (draft)', `/legal/free-gift: ${section.heading}`, line, 'Customer wording, for sign-off']),
  )
}
