/**
 * The offer's rows for the review pack (`docs/consult-review-pack.csv`).
 *
 * Two kinds:
 *   - The bonus terms: every condition "free" has to carry next to it (CAP
 *     Code 3.23–3.25). The committed pack lists them as set by default; the
 *     customer wording is the free gift terms page (`terms.ts`).
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
import { PLAN_COPY, whyPricesDiffer } from './plan-copy'
import { BOX_COPY } from './box-copy'
import { LEVEL_COPY } from './levels-copy'
import { freeGiftTerms, guaranteeTerms } from './terms'

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
    ['Bonus terms', where, 'Returns: see "Returns" in the free gift terms.', 'Condition: what happens on a return'],
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
    ['Offer wording', where, c.startHere, 'Above the label on the single-product offer card'],
    ['Offer wording', where, c.heroLabel, 'Label on an approved hero'],
    ['Offer wording', where, c.topPickLabel, 'Label with the hero switch off, or no hero that fits'],
    ['Offer wording', where, c.delivered, 'In the sticky bar, with Start here chosen'],
    ['Offer wording', where, c.startWithThis, 'Button'],
    ['Offer wording', where, c.codeNotOnHero, 'When a code is applied'],
    ['Offer wording', where, c.fullStack, 'Section heading, and the card’s link down to it'],
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
    ['Offer wording', where, c.stickyCore('Magnesium'), `Sticky bar, with "Start here" chosen. ${ex}`],
    ['Offer wording', where, c.stickyHeroCta, 'Sticky bar button'],
    ['Offer wording', where, c.summaryHeading, '"Your offer", at the top of the page: both options at a glance'],
    ['Offer wording', where, c.summaryCoreLine, 'Under the single product in "Your offer"'],
    ['Offer wording', where, c.summaryStackLine(5), `Under "Or get the full stack" in "Your offer". ${ex}`],
    ['Offer wording', where, c.summaryOnce(47.81), `The same, where it can't be a subscription. ${ex}`],
    ['Offer wording', where, c.seeFullStack, 'Button in "Your offer", down to the depth picker'],
    ['Offer wording', where, c.whyThese, 'Opens the reasons: the read, "Built from your answers", "Try this week", "What we checked"'],
    ['Offer wording', where, c.hideWhy, 'Closes them again'],
    ['Offer wording', where, c.ladderHeading, '"Build your stack": what a bigger stack unlocks, each line one checkout already applies'],
    ['Offer wording', where, c.ladderNext(5.05, 'Free delivery'), `Its headline, towards the next line. ${ex}`],
    ['Offer wording', where, c.ladderNext(10, 'Free Vitamin C & Zinc'), `When the gift is next; its conditions are in the same card. ${ex}`],
    ['Offer wording', where, c.ladderAll, 'Its headline when every line is reached'],
    ['Offer wording', where, 'Delivery £2.95, not £4.95 · from £40.00', `A line. ${ex}`],
    ['Offer wording', where, '8% off · on stacks from £50.00', `A line, one-off only. ${ex}`],
    ['Offer wording', where, 'Free delivery · from £100.00 a month', `A line, subscribed. ${ex}`],
    ['Offer wording', where, c.ladderUnlocked, 'Beside a line reached'],
    ['Offer wording', where, c.ladderToGo(5.05), `Beside a line not yet reached. ${ex}`],
    ['Offer wording', where, c.ladderAdd, 'Over up to three products to add in one tap (name, type and price only)'],
  ]
}

/** The two ways to buy a stack, and why their prices differ (the clarity pass). */
export function planCopyRows(): ReviewRow[] {
  const where = 'Results page: "Your box", once or monthly (both quizzes)'
  const ex = 'Example figures; the live ones come from the stack'
  const c = PLAN_COPY
  const example = {
    runsOutMonths: 1, firstToRunOut: 'Sport Multivitamin', lastsMonths: 3, longestLasting: 'Omega-3', firstDeliveryIdentical: false,
    oneOffPerMonth: 78.16, subscriptionPerMonth: 72.21, perMonthSaving: 5.95, oneOffToday: 87.35, subscriptionToday: 72.21, firstDeliverySaving: 15.14,
  }
  return [
    ['Plan wording', where, c.heading, 'The switch’s heading'],
    ['Plan wording', where, c.once, 'Option'],
    ['Plan wording', where, c.monthly, 'Option'],
    ['Plan wording', where, `£87.35 · ${c.oneOfEach}`, `Under "${c.once}". ${ex}`],
    ['Plan wording', where, `£72.21 ${c.aMonth}`, `Under "${c.monthly}". ${ex}`],
    ['Plan wording', where, c.onceLine, `Under the switch, "${c.once}" chosen`],
    ['Plan wording', where, c.monthlyLine(15), `Under the switch, "${c.monthly}" chosen. ${ex}`],
    ['Plan wording', where, c.onceOnly, 'On a depth that can’t be a subscription'],
    ['Plan wording', where, c.why, 'Opens the explanation below'],
    ...whyPricesDiffer(example, 15).map((line): ReviewRow => ['Plan wording', where, line, `"${c.why}", each line only when this stack’s figures make it true. ${ex}`]),
    ['Plan wording', where, c.summaryMonthly(72.21, 15), `"Your offer". ${ex}`],
    ['Plan wording', where, c.summaryOnce(87.35), `"Your offer". ${ex}`],
  ]
}

/**
 * "Your box" (the clarity pass, part 2): the selection that replaced
 * Essentials / Standard / Complete, on the results page of both quizzes.
 */
export function boxCopyRows(): ReviewRow[] {
  const where = 'Results page: "Your box" (both quizzes)'
  const ex = 'Example figures; the live ones come from the box'
  const c = BOX_COPY
  return [
    ['Box wording', where, c.heading, 'Heading'],
    ['Box wording', where, c.sub, 'Under the heading'],
    ['Box wording', where, c.countOn(3, 6), `The count beside the heading. ${ex}`],
    ['Box wording', where, c.picked, 'A product’s line when no approved reason may be said beside it (the claims maps decide)'],
    ['Box wording', where, c.added, 'A product they added themselves'],
    ['Box wording', where, c.switchLabel('Creatine Monohydrate'), 'The switch’s name, read out by a screen reader. Example product'],
    ['Box wording', where, c.details, 'Opens the product’s details (screen reader)'],
    ['Box wording', where, c.empty, 'Under the button, with every product switched off'],
    ['Box wording', where, c.ctaOnce(42.5), `The button, one-off. ${ex}`],
    ['Box wording', where, c.ctaMonthly(36.98), `The button, monthly. ${ex}`],
    ['Box wording', where, c.going, 'The button, on the way to Stripe'],
    ['Box wording', where, c.delivery(4.95), `Under the button, delivery not free yet. ${ex}`],
    ['Box wording', where, c.delivery(0), 'Under the button, delivery free'],
    ['Box wording', where, c.justOne('Creatine Monohydrate', 19.99), `Under the button: the hero (or their top pick) alone. ${ex}`],
    ['Box wording', where, c.monthlyFrom(25), 'The monthly option, while the box is under the subscription minimum'],
    ['Box wording', where, c.monthlyMin(25, 18.4), `Under the plan, while the box is under the subscription minimum. ${ex}`],
    ['Box wording', where, c.receiptSave(4), `The receipt's subscribe-and-save line. ${ex}`],
    ['Box wording', where, c.stickyOnce, 'The sticky bar'],
    ['Box wording', where, c.stickyMonthly, 'The sticky bar'],
    ['Box wording', where, c.more, 'Opens the rest of their read, under the box'],
    ['Box wording', where, c.less, 'Folds it again'],
  ]
}

/**
 * Charge levels and box services (Option 1). A service is shown only while its
 * switch is on in Settings → Offer → Box services.
 */
export function levelCopyRows(): ReviewRow[] {
  const where = 'Results page: "Your box comes with" (both quizzes); the stack guide'
  const c = LEVEL_COPY
  return [
    ['Level wording', where, c.heading, 'Heading'],
    ...Object.values(c.level).map((name): ReviewRow => ['Level wording', where, name, 'A charge level: by how many products are on (1–3, 4–5, 6+)']),
    ['Level wording', where, c.nextLevel(2, c.level.supercharged), 'The next level. Example'],
    ['Level wording', where, c.topLevel, 'At the top level'],
    ['Level wording', where, c.at(c.level.fully), 'Beside a locked service. Example'],
    ['Level wording', where, c.service.guide, 'Every box'],
    ['Level wording', where, c.service.reminders, 'Every box'],
    ['Level wording', where, c.service.training, 'Every box, only while the training plan is switched on'],
    ['Level wording', where, c.service.deals, 'Every box, only while member deals are switched on'],
    ['Level wording', where, c.service.checkIns, 'Every box, while check-ins are on'],
    ['Level wording', where, c.service.swaps, 'Monthly boxes'],
    ['Level wording', where, c.service.guarantee, 'Every box, only while the guarantee is switched on'],
    ['Level wording', where, c.guaranteeConditions, 'Beside the guarantee, wherever it is said'],
    ['Level wording', where, c.guaranteeTerms, 'Link to /legal/guarantee'],
    ['Level wording', where, c.service.rate(15), 'Monthly: a level’s rate. Example'],
  ]
}

/** The free gift terms page, at the default settings. */
export function freeGiftTermRows(bonus: BonusSettings): ReviewRow[] {
  return freeGiftTerms(bonus).flatMap((section) =>
    section.lines.map((line): ReviewRow => ['Free gift terms', `/legal/free-gift: ${section.heading}`, line, 'Customer wording, for sign-off']),
  )
}

/** The first-box guarantee's terms page, for sign-off before the switch goes on. */
export function guaranteeTermRows(): ReviewRow[] {
  return guaranteeTerms().flatMap((section) =>
    section.lines.map((line): ReviewRow => ['Guarantee terms', `/legal/guarantee: ${section.heading}`, line, 'Customer wording, for sign-off before the guarantee is switched on']),
  )
}

