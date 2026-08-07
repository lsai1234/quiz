import type { StackBlueprint } from './types'
import type { CatalogueProduct, ConsumptionCadence } from '@/lib/catalogue/types'
import type { QuizAnswers, Budget, StackLevel, StackPreference } from '@/lib/types'

const DAYS_PER_MONTH = 30

// ─── Config ──────────────────────────────────────────────────────────────────
// All pricing rules live here so they can be changed without touching UI code.
// The portal (final phase) will edit these — they're written as data, not logic.

/**
 * Where a parcel is going, for the purposes of the delivery rate card.
 * PowerBody price UK mainland, the Scottish Highlands & Islands, and the EU
 * differently — and a UK-based dropship account can only ship within the UK.
 */
export type DeliveryZone = 'uk-1' | 'uk-2' | 'eu'

/**
 * One line of the supplier's delivery rate card.
 *
 * Banded on the ORDER VALUE — specifically what WE pay PowerBody for that
 * order, not what the member pays us. Their site prices delivery this way, so
 * cheaper stock means a cheaper parcel and a bigger basket eventually ships
 * free. That is the opposite shape to a weight-banded card and it changes what
 * a good order looks like: bundle up, ship less often, cross the free line.
 */
export interface DeliveryService {
  id: string
  name: string
  zone: DeliveryZone
  /**
   * Upper bound of the band — our wholesale value for the order (£, ex VAT).
   * null means "and above", i.e. the open-ended top band.
   */
  maxOrderValue: number | null
  /** What the supplier charges us, ex VAT (£). 0 for the free band. */
  price: number
}

/** A volume/value discount tier. Qualifies when the order meets every set threshold. */
export interface DiscountTier {
  id: string
  label: string
  /** Minimum order subtotal (£) to qualify. */
  minSubtotal?: number
  /** Minimum number of products to qualify. */
  minItems?: number
  /** Discount as a fraction, 0–1. */
  discountPct: number
}

export const PRICING_CONFIG = {
  /** Subscription discount applied to subscription products (0–1). The base
   *  "subscribe & save"; overridden by the per-bundle rate below and can be
   *  beaten by a subscriptionTier for bigger orders. */
  subscriptionDiscount: 0.15,
  /**
   * Fixed subscribe-&-save discount per bundle (stack level). This is the
   * headline selling point shown on each bundle: bigger bundle, better rate.
   * The resolved rate is still margin-floored per line and can be beaten by a
   * subscriptionTier. Falls back to `subscriptionDiscount` if a level is unset.
   */
  levelSubscriptionDiscount: {
    // 13 rather than a tidier 10 because the entry rung has to beat the flat 8%
    // one-off tier by enough to be a reason to commit. `lib/pricing/ladder.ts`
    // puts that bar at 5 points — roughly the smallest gap a shopper reliably
    // notices — and 13 − 8 = 5 exactly. See docs/PRICING_STRATEGY.md §5.
    essentials: 0.13,
    performance: 0.15,
    complete: 0.2,
  } as Record<StackLevel, number>,
  /** Label shown on the subscription saving line. */
  subscriptionPlanLabel: 'CHRGD Monthly Stack Plan',

  /**
   * One-off bundle discount tiers (best-qualifying wins).
   *
   * ONE FLAT TIER, DELIBERATELY. This used to ladder 10/15/20 by basket value,
   * in parallel with the subscribe-&-save ladder — and the two collided. A
   * 5-item Performance stack lists at ~£126, which tripped the old £120+ tier at
   * 20% against a 15% subscription rate, so SUBSCRIBING COST THE MEMBER 5
   * POINTS. Essentials and Complete were level pegging. There was no ongoing
   * reason to subscribe at all; the whole recurring-revenue case rested on the
   * first-month scratch card.
   *
   * The ladder now belongs to the subscription alone, which is what it was
   * always for. One-off buyers get a flat 8% for clearing £50 — enough to be
   * worth having, shallow enough that every rung of the subscription ladder
   * beats it by a widening margin (+4.5 / +7 / +12 points). See
   * docs/PRICING_STRATEGY.md §7.1.
   *
   * Set BELOW `freeDeliveryThreshold` on purpose, so growing a basket pays
   * twice: 8% off at £50, then free delivery at £60. What must never happen is
   * the discount starting ABOVE the free-delivery line, which would leave a band
   * where postage is free but the basket has earned nothing — an offer that
   * appears to go backwards.
   */
  bundleTiers: [
    { id: 'bundle-50', label: '£50+ bundle', minSubtotal: 50, discountPct: 0.08 },
  ] as DiscountTier[],
  // ── Extra subscription discount tiers, on top of the base rate (best wins) ──
  subscriptionTiers: [] as DiscountTier[],

  // ── Per-bundle hard price caps ──
  /**
   * The maximum discounted one-off total (£) a stack may reach for each budget
   * tier. The factory selects products up to (and as close as possible to) this
   * ceiling and never over it; the AI personaliser is gated to the same cap.
   * null = no upper cap (the open-ended top tier).
   */
  budgetCaps: {
    'under-30': 30,
    '30-50': 50,
    '50-80': 80,
    '80-plus': null,
  } as Record<Budget, number | null>,

  // ── Margin / profit guardrails ──
  /**
   * When a product has no explicit cost, estimate it as its NET price × this.
   *
   * 0.55, not the 0.35 this started at. PowerBody's own feed puts wholesale at
   * about 52% of their recommended retail across the catalogue, so 0.35 was
   * assuming a markup the market does not support and quietly made every
   * uncosted product look healthier than it is. Better to be slightly
   * pessimistic about a number we are guessing at.
   */
  defaultCostRatio: 0.55,
  /** Never discount a line below cost × (1 + this). */
  marginFloorPct: 0.15,
  /**
   * Minimum flat monthly value for the subscription to be offered (£).
   *
   * The real floor is about £21.60 — the point at which a plan covers its goods
   * and postage across its whole life including the average scratch card.
   * `lib/pricing/thresholds.ts` computes it and the hub flags this setting if it
   * ever drops below.
   *
   * This briefly sat at 40, from a calculation that assumed we ABSORB the
   * postage on every subscription. We don't: a plan under `freeDeliveryThreshold`
   * is charged `delivery.customerDeliveryCharge` like any other order, and only
   * plans above it ship free. Assuming the worst case on the wrong side of our
   * own rule turned away subscriptions that make money.
   */
  minSubscriptionMonthly: 25,

  /**
   * Smallest order we will take at all (£ inc VAT).
   *
   * A one-off order has nothing behind it — no renewal, no second chance — so if
   * the checkout lets someone buy a £6 tub we simply lose the difference between
   * what they pay and what the parcel costs. The measured break-even is £11.50;
   * £15 is that with a little headroom. Cheap products aren't banned — they just
   * can't be the WHOLE order (see `minQuizProductPrice`).
   */
  minOrderValue: 15,

  /**
   * Cheapest a product may be and still be offered as a stack line in the quiz
   * (£ inc VAT).
   *
   * Sharing a parcel three ways brings a product's postage share down to about
   * £2.60, and below roughly £8 of shelf price there isn't enough margin to
   * cover even that. Such products are still perfectly sellable — as an add-on
   * to a box already going out — they just can't carry a slot of their own.
   */
  minQuizProductPrice: 8,

  // ── Subscription cadence / commitment ──
  /** Products with more servings than this are candidates for a monthly refill SKU. */
  maxSubscriptionServings: 35,
  /** Never schedule a delivery more than this many months apart. */
  maxDeliveryMonths: 3,
  /** Bill one flat amount every month (smoothed average). */
  subscriptionFlatMonthly: true,
  /**
   * Minimum subscription commitment in months (per-product can override up).
   * 1 = no commitment — cancel or pause any time, which is what we sell on.
   *
   * NOTE: this NO LONGER gates cancelling or pausing. The offer is "cancel
   * whenever you want, and settle what we've already sent you", and the
   * pay-for-what-shipped buy-out (`cancelSettlement`) is what protects the
   * smoothed monthly instead — it recovers exactly what is owed rather than
   * binding the member. Raising this above 1 therefore only affects the
   * "N-month minimum" copy and the committed-margin projections; it will not
   * stop anyone leaving, and the terms now promise it won't.
   */
  minSubscriptionMonths: 1,

  // ── Fulfilment ──
  /**
   * OUR free-delivery offer: the total (£, inc VAT, at OUR retail prices) at or
   * above which the member pays nothing for postage. Advertised on the bundle
   * selector; 0 turns the offer off entirely.
   *
   * NOTHING TO DO WITH POWERBODY'S THRESHOLDS. Their wholesale terms carry their
   * own free-shipping figures on THEIR wholesale values (e.g. free over £300 for
   * a Zone 2 wholesale order), and dropshipping gets no free delivery at all.
   * The two are different numbers, on different price bases, in different
   * directions — ours is a marketing promise that costs us money; theirs is a
   * discount we don't qualify for. Crossing them is how a margin model quietly
   * starts believing postage is free.
   */
  freeDeliveryThreshold: 60,

  /**
   * VAT. The single biggest thing a UK retail margin gets wrong.
   *
   * Our shelf prices are quoted INCLUSIVE of VAT, because that is what UK
   * consumer law requires a consumer-facing price to be. PowerBody quotes us
   * EXCLUSIVE of VAT (their guide prints "£4.75 (+ VAT = £5.70)"). Subtract one
   * from the other and you have overstated the margin by the whole VAT rate —
   * on a £30 sale that is £5 of someone else's money counted as profit.
   *
   * So every margin in `lib/pricing/*` is computed on NET revenue
   * (price ÷ 1 + rate) against NET costs. See `lib/pricing/vat.ts`.
   */
  vat: {
    /** UK standard rate. Most sports nutrition is standard-rated; a few foods
     *  (e.g. some flapjacks/shakes sold as food) are zero-rated — set those per
     *  product with `CatalogueProduct.vatRate`. */
    standardRate: 0.2,
    /**
     * Whether we are VAT-registered.
     *
     * Registered: we charge VAT on sales and hand it over, but reclaim the VAT
     * on what PowerBody charges us — so costs are net.
     * Not registered: we charge no VAT (keeping the whole shelf price) but
     * CANNOT reclaim, so PowerBody's VAT is a real cost. These are genuinely
     * different businesses, not a display toggle, which is why it lives here.
     *
     * Defaults to FALSE: a new business is below the threshold and not
     * registered, and that is the phase this is being built in. Flip it the day
     * registration takes effect and the whole hub reprices.
     */
    registered: false,
    /**
     * HMRC's compulsory registration threshold — taxable turnover over any
     * rolling 12 months (£). Public figure, £90,000 since April 2024.
     * `lib/pricing/vat-position.ts` tracks us against it.
     */
    registrationThreshold: 90_000,
    /** The threshold below which a registered business may deregister (£). */
    deregistrationThreshold: 88_000,
  },

  /**
   * PowerBody's dropship delivery rate card — the real one, from their
   * Dropshipping Guide (June 2026), ex VAT.
   *
   * Priced by WEIGHT and ZONE, not per parcel: a 500g tub and a 5kg order cost
   * different amounts to send, and the Highlands cost more than London. The
   * charge covers picking, packaging, invoice printing, labour, storage and
   * shipping — it is a fulfilment fee, not postage, which is why it is
   * substantial relative to a £20 tub.
   *
   * Note what is NOT here: there is no free-shipping threshold, because
   * "Next Day Delivery and Free Delivery are not available to Dropshippers".
   * Every single order carries one of these. See `lib/pricing/delivery.ts`.
   */
  delivery: {
    /**
     * Every service we can be charged for. The cheapest one that can carry the
     * weight in the destination zone wins.
     */
    services: [
      // UK mainland, from powerbody.com. BANDED ON WHAT WE SPEND WITH THEM in
      // one parcel — not on weight, and NOT on what the customer pays us.
      //
      // Worth stating in retail money, because that is where this gets misread:
      // pricing at ×2 makes our spend about half the shelf price, so their £50
      // and £99 bands land at roughly £100 and £198 OF RETAIL. Free shipping
      // needs a ~£200 basket, not a £99 one.
      //
      // Note our own `freeDeliveryThreshold` (£50 retail) starts well below the
      // point our cost drops (£100 retail), so orders between the two collect
      // nothing and still pay the full charge. See docs/PRICING_FROM_SCRATCH.md.
      { id: 'z1-50', name: 'Standard', zone: 'uk-1', maxOrderValue: 50, price: 6.5 },
      { id: 'z1-99', name: 'Standard', zone: 'uk-1', maxOrderValue: 99, price: 5.5 },
      { id: 'z1-free', name: 'Free over £99', zone: 'uk-1', maxOrderValue: null, price: 0 },
      // Highlands & Islands.
      { id: 'z2-300', name: 'Standard', zone: 'uk-2', maxOrderValue: 300, price: 7.99 },
      { id: 'z2-free', name: 'Free over £300', zone: 'uk-2', maxOrderValue: null, price: 0 },
      { id: 'eu', name: 'UPS International', zone: 'eu', maxOrderValue: null, price: 8.6 },
    ] as DeliveryService[],
    /**
     * The zone to assume when we're pricing rather than shipping — i.e. on the
     * Pricing page and in the margin model. Zone 1 is the overwhelming majority
     * of UK addresses; Zone 2 is modelled by `zone2SharePct` below rather than
     * by pricing everything at the worst zone.
     */
    defaultZone: 'uk-1' as DeliveryZone,
    /** Share of orders going to a Highlands/Islands (Zone 2) address, 0–1.
     *  Used to blend a realistic average delivery cost. */
    zone2SharePct: 0.04,
    /** What we charge a member for delivery below `freeDeliveryThreshold` (£, inc VAT). */
    customerDeliveryCharge: 3.95,
    /** Assumed shipped weight when a product has none recorded (g). A 1kg tub
     *  plus packaging is the typical single-item supplement parcel. */
    defaultProductGrams: 1000,
  },

  /**
   * What taking the money costs. Card fees are charged on the GROSS amount the
   * customer pays (VAT included), and are exempt from VAT themselves, so there
   * is nothing to reclaim — the whole fee is a cost. Small per order, but on a
   * £25 subscription it is most of a percentage point of margin.
   */
  paymentFees: {
    /** Percentage of the gross charge (0–1). Stripe UK standard is 1.5%. */
    percent: 0.015,
    /** Fixed fee per successful charge (£). */
    fixed: 0.2,
  },

  /**
   * Returns and failures. PowerBody refund the product value when an item comes
   * back — but never the shipping, which on their rate card is the bigger
   * number on a small order. Consumers have a 14-day right to return, so this
   * is a cost of doing business rather than an exception.
   */
  returns: {
    /** Share of orders returned or undelivered, 0–1. */
    ratePct: 0.02,
    /**
     * What one return costs us beyond the refunded goods: the outbound delivery
     * we never get back, plus getting it to the warehouse. Modelled as a
     * multiple of the outbound delivery charge — 2 = out and back.
     */
    costMultipleOfDelivery: 2,
  },

  /**
   * The influencer partner programme. See docs/INFLUENCER_PROGRAMME.md.
   *
   * Commission is a percentage of NET revenue (ex VAT, ex delivery) — never of
   * the gross, because up to a fifth of a gross price is HMRC's money and paying
   * partners out of the VAT account is not a mistake you notice quickly.
   */
  partners: {
    /**
     * Commission on a member's first order (0–1).
     *
     * 15%, down from 20%. A fifth of net revenue is a normal affiliate rate WHEN
     * A SUBSCRIPTION FOLLOWS AND PAYS IT BACK. On a one-off order there is
     * nothing to pay it back with, and at 20% every attributed one-off order
     * landed at or below break-even.
     */
    firstOrderPct: 0.15,
    /** Commission on each subsequent subscription renewal (0–1). */
    renewalPct: 0.05,
    /**
     * Months of renewals a partner earns on, from signup.
     *
     * 6, matching `orderMix.averageRetentionMonths`. Paying renewals for 12
     * months on a customer who stays 6 doesn't cost double — it costs nothing
     * extra, because the months don't happen — but it sets an expectation the
     * business can't fund if retention ever improves, which is precisely when it
     * would hurt most.
     */
    renewalMonths: 6,
    /**
     * The floor a partner's code puts under the scratch card (0–1). The card
     * still runs and can still pay out its top prize — the code raises the worst
     * outcome, so a partner can promise "at least this much off".
     *
     * 20%, down from 25%. At 25% the floor was DEEPER THAN THE ~18% BLENDED CARD
     * WE GIVE AWAY ANYWAY, so a partner's code cost us a bigger discount AND a
     * commission on top of it — the single most expensive line in the programme,
     * and the reason month one via a partner lost £12–£28 at every stack size.
     * At 20% against a 15% blended card it is still a genuine "at least 20% off"
     * a partner can advertise.
     */
    introFloorPct: 0.2,
    /**
     * Whether partners are typically VAT-registered. A registered partner
     * invoices commission plus VAT, and while WE cannot reclaim, that makes
     * their commission cost 20% more than the rate suggests.
     */
    partnersChargeVat: false,
  },

  /**
   * What the average order actually looks like.
   *
   * Every figure above prices ONE order under ONE set of assumptions. This is
   * the mix those orders arrive in, and it is what decides whether the business
   * makes money — a single order that loses £2 because someone won the top
   * scratch card is a rationed promotional cost, not a problem, provided the
   * blend is healthy. `lib/pricing/blended.ts` does that arithmetic.
   *
   * These are assumptions until there are enough real orders to measure them
   * from, and the hub says which is which rather than quietly presenting a guess
   * as a fact.
   */
  orderMix: {
    /** Share of orders that start or continue a subscription (0–1). */
    subscriptionShare: 0.6,
    /** Share of orders credited to a partner (0–1). The great unknown — the
     *  blended model reports how high this could go before it matters. */
    attributedShare: 0.3,
    /** Months an average subscriber stays. Drives lifetime contribution. */
    averageRetentionMonths: 6,
    /**
     * Products in a typical order. The quiz builds a stack, so an order is
     * several products in ONE parcel — and since PowerBody charge per parcel,
     * that shared delivery is the difference between a product working on
     * subscription and not. Pricing a product as though it ships alone is the
     * worst case, not the normal one.
     */
    itemsPerOrder: 3,
    /** How orders spread across the bundle sizes. Normalised, so these are
     *  relative weights rather than percentages that must sum to 1. */
    levelMix: { essentials: 3, performance: 5, complete: 2 } as Record<StackLevel, number>,
  },

  /**
   * The supplier account itself. PowerBody require a minimum monthly spend to
   * keep a dropshipping account open — miss it and the account can be closed,
   * which is a pricing constraint as real as any margin floor.
   */
  supplierAccount: {
    /** Minimum wholesale spend per month to keep the account (£). */
    minimumMonthlySpend: 1000,
    /** Months from signup to reach it. */
    graceMonths: 2,
    /** The average order value PowerBody suggest aiming for (£). A benchmark,
     *  not a rule — shown next to ours so we can see how we compare. */
    targetOrderValue: 35,
  },

  /**
   * How we set the LIST price — the number shown next to a bundle.
   *
   * ONE RULE: DOUBLE WHAT WE PAY.
   * ─────────────────────────────
   *     list price = what PowerBody charge us × markupOnCost, rounded to .99
   *
   * That is the whole model, and it is deliberately something we own. The
   * previous version worked backwards from the supplier's RRP, which made every
   * price in the catalogue depend on a number that is only ever a *suggestion* —
   * one PowerBody can change, that varies by brand, and that some products don't
   * carry at all.
   *
   * Pricing from cost also happens to land in the same place. Across the
   * catalogue their RRP is about 1.94× their wholesale, so doubling what we pay
   * puts us within a few percent of the market anyway — we just get there by a
   * rule we can explain in a sentence instead of by inheriting theirs.
   *
   * The supplier's RRP plays no part at all — it is stored as a was-price and
   * nothing reads it. It was briefly kept as a cross-check, but a flag nobody
   * acts on is just another number on a screen.
   */
  listPricing: {
    /**
     * What we multiply the supplier's price by to get our shelf price.
     *
     * 2.0 keeps roughly a fifth of a subscriber's order as contribution after
     * VAT-on-costs, postage, card fees and returns. Below about 1.9 the margin
     * gets thin enough that a single bad delivery band wipes it out; much above
     * 2.1 and most of the catalogue prices above what the brands themselves
     * recommend, which is the thing customers can check in ten seconds.
     */
    markupOnCost: 2.0,
    /**
     * Round list prices DOWN to a .99 ending. Retail convention, and down rather
     * than to nearest because rounding up can quietly turn a saving into a
     * markup.
     */
    roundTo99: true,
  },

  /**
   * The Good-price model — how we turn a supplier asset price into a sell price.
   *
   * The model prices for the WORST case rather than the average one: a member
   * who lands on the biggest subscription bundle (so the deepest subscribe-&-save
   * rate), takes the average first-month discount, and cancels at the earliest
   * point. If a price makes money there it makes money everywhere.
   * See `lib/pricing/good-price.ts`.
   */
  goodPricing: {
    /**
     * Months of subscription revenue to judge a price over. null = how long a
     * customer actually stays (`orderMix.averageRetentionMonths`).
     *
     * This used to fall back to `minSubscriptionMonths` — the earliest anyone
     * could leave — and that produced prices roughly DOUBLE the market, because
     * it asked the first month alone to carry the full target margin after both
     * the deepest bundle discount and the intro offer. See `pricingHorizonMonths`.
     */
    horizonMonths: null as number | null,
    /**
     * Assume we eat the delivery rather than collect it. True is the honest
     * worst case: a subscription that clears `freeDeliveryThreshold` pays us
     * nothing for postage, and that is the common outcome.
     */
    assumeFreeDelivery: true,
  },

  // ── Product changes (unavailability + supplier price moves) ──
  // See docs/PRODUCT_CHANGES_SPEC.md. Consumed by lib/changes/*.
  /** What happens by default when a product becomes unavailable. The member
   *  chooses at checkout; this is the option pre-selected for them. */
  defaultChangePolicy: 'auto-swap' as 'auto-swap' | 'remove',
  /**
   * How far a replacement's unit price may sit from the original's before it
   * stops counting as "the closest equivalent" (0–1). A swap never RAISES the
   * member's monthly (the price is capped at what they already pay), so this
   * bounds what we might absorb on their behalf.
   */
  substitutionPriceTolerancePct: 0.15,
  /** A supplier price move beyond this (0–1) raises a price-change event. */
  priceChangeThresholdPct: 0.02,
  /**
   * Days of notice before an increased price may bill. UK subscription rules
   * require clear advance notice and a free exit — see docs/PRODUCT_CHANGES_SPEC.md.
   */
  priceChangeNoticeDays: 30,
  /** Consecutive supplier syncs a SKU must be absent for before it counts as
   *  discontinued rather than temporarily out of stock. */
  discontinuedAfterMissedSyncs: 3,
  /**
   * How long a founder gets to override a change before the system applies the
   * member's own policy anyway. This is a review window, never a blocking gate:
   * an untouched event still resolves. 0 = apply immediately.
   */
  founderReviewHours: 24,

  /** First-cycle intro offer. */
  introOffer: {
    /** Discount on the first month, 0–1 (e.g. 0.5 = 50% off). 0 disables it.
     *  Used as the fallback when the scratch-to-reveal card is disabled. */
    firstMonthDiscount: 0.5,
    /**
     * The blended first-month discount we're willing to give away, 0–1 — the
     * single number the business actually controls.
     *
     * Scratch cards are allocated to land the average discount ACROSS MEMBERS
     * WHO ACTUALLY CHECK OUT on this figure: set 0.18 and the mix of 50/25/10%
     * cards granted will average ~18%, whatever the split ends up being. It
     * governs claims, not reveals — cards revealed by people who never buy cost
     * nothing and don't count. See `lib/stack-blueprint/intro-allocation.ts`.
     *
     * Raise it to hand out more of the headline 50% cards; lower it and 50%
     * becomes vanishingly rare. Setting it at or above the top outcome grants
     * that outcome to everyone; at or below the bottom one, likewise.
     */
    effectiveFirstMonthDiscount: 0.15,
    /**
     * Whether the first-month discount is capped by `marginFloorPct`.
     *
     * FALSE, deliberately. The floor exists to stop the ONGOING price drifting
     * below what a product costs; the intro offer is a different animal — a
     * rationed, one-month acquisition cost the business has explicitly signed
     * off as loss-making on the rare deep cards.
     *
     * Leaving the floor switched on here doesn't prevent the loss, it prevents
     * the OFFER: a 40% card on the biggest bundle asks for 52% off, the floor
     * allows 43%, and the member sees a smaller discount than the one they just
     * scratched. Advertising a number and quietly delivering a smaller one is
     * worse than either paying it or not offering it.
     *
     * What still has to hold is the WHOLE SUBSCRIPTION — see
     * `lib/pricing/scenarios.ts`, where month one is promotional and the
     * lifetime is the test.
     */
    respectMarginFloor: false,
    /**
     * Scratch-to-reveal intro: instead of one fixed first-month discount, the
     * member scratches a card to reveal theirs, drawn at random from these
     * weighted outcomes. Probability of an outcome = its weight ÷ the sum of all
     * weights. Set `enabled: false` to fall back to the flat
     * `firstMonthDiscount` above.
     *
     * 40% is the rare top prize — the everyday outcomes (20% / 10%) are 20×
     * more likely between them (weights 8 + 12 against 1, so 40% lands about
     * 1 draw in 21). Keep that ratio in mind when editing: the weights are
     * relative, so raising one lowers everything else's odds.
     *
     * WHY NOT 50/25/10. Under the old card, 52% OF FIRST MONTHS LOST MONEY —
     * the top prize and the 25% card, which was half of all draws. Expected
     * value was positive but carried entirely by the 10% outcome, and the 25%
     * card was what the old partner floor forced onto every attributed order.
     * A loss-making first month is fine when the subscription pays it back;
     * a loss-making MEDIAN first month is an acquisition cost nobody chose.
     * The shape is unchanged — rare big prize, two everyday outcomes — but the
     * middle rung now makes money and the worst case is ~£14 better on a
     * Complete stack.
     */
    scratchReveal: {
      enabled: true,
      outcomes: [
        { discount: 0.4, weight: 1 },
        { discount: 0.2, weight: 8 },
        { discount: 0.1, weight: 12 },
      ] as ScratchOutcome[],
    },
  },
}

/** One possible scratch-to-reveal first-month discount and its relative weight. */
export interface ScratchOutcome {
  /** Discount on the first month, 0–1 (e.g. 0.5 = 50% off). */
  discount: number
  /** Relative likelihood — probability is weight ÷ sum of all weights. */
  weight: number
}

// ─── Runtime config resolution (portal-overridable) ──────────────────────────
// PRICING_CONFIG holds the defaults. The portal can override any of it at
// runtime; getPricingConfig() returns the merged, current config. With no
// overrides it equals the defaults, so behaviour is unchanged until edited.

export type PricingConfig = typeof PRICING_CONFIG

/**
 * Portal overrides: any subset of the pricing config. `introOffer` may itself be
 * partial (e.g. change just the flat discount, or just the scratch outcomes) —
 * recomputeConfig shallow-merges it onto the defaults.
 */
type NestedKeys =
  | 'introOffer' | 'delivery' | 'goodPricing' | 'vat'
  | 'paymentFees' | 'returns' | 'supplierAccount' | 'partners' | 'orderMix' | 'listPricing'

export type PricingOverrides = Partial<Omit<PricingConfig, NestedKeys>> & {
  [K in NestedKeys]?: Partial<PricingConfig[K]>
}

let _overrides: PricingOverrides = {}
let _current: PricingConfig = PRICING_CONFIG

function recomputeConfig() {
  _current = {
    ...PRICING_CONFIG,
    ..._overrides,
    introOffer: { ...PRICING_CONFIG.introOffer, ...(_overrides.introOffer ?? {}) },
    delivery: {
      ...PRICING_CONFIG.delivery,
      ...(_overrides.delivery ?? {}),
      // A rate card is replaced wholesale or not at all — merging two lists of
      // services by key would silently resurrect a carrier that was removed.
      services: _overrides.delivery?.services ?? PRICING_CONFIG.delivery.services,
    },
    goodPricing: { ...PRICING_CONFIG.goodPricing, ...(_overrides.goodPricing ?? {}) },
    vat: { ...PRICING_CONFIG.vat, ...(_overrides.vat ?? {}) },
    paymentFees: { ...PRICING_CONFIG.paymentFees, ...(_overrides.paymentFees ?? {}) },
    returns: { ...PRICING_CONFIG.returns, ...(_overrides.returns ?? {}) },
    supplierAccount: { ...PRICING_CONFIG.supplierAccount, ...(_overrides.supplierAccount ?? {}) },
    partners: { ...PRICING_CONFIG.partners, ...(_overrides.partners ?? {}) },
    listPricing: { ...PRICING_CONFIG.listPricing, ...(_overrides.listPricing ?? {}) },
    orderMix: {
      ...PRICING_CONFIG.orderMix,
      ...(_overrides.orderMix ?? {}),
      levelMix: { ...PRICING_CONFIG.orderMix.levelMix, ...(_overrides.orderMix?.levelMix ?? {}) },
    },
    bundleTiers: _overrides.bundleTiers ?? PRICING_CONFIG.bundleTiers,
    subscriptionTiers: _overrides.subscriptionTiers ?? PRICING_CONFIG.subscriptionTiers,
    budgetCaps: _overrides.budgetCaps ?? PRICING_CONFIG.budgetCaps,
    levelSubscriptionDiscount: {
      ...PRICING_CONFIG.levelSubscriptionDiscount,
      ...(_overrides.levelSubscriptionDiscount ?? {}),
    },
  }
}

/** Replace the current pricing overrides (portal save / client sync). */
export function setPricingOverrides(overrides: PricingOverrides): void {
  _overrides = overrides ?? {}
  recomputeConfig()
}

export function getPricingOverrides(): PricingOverrides {
  return _overrides
}

/** The current pricing config — defaults merged with any portal overrides. */
export function getPricingConfig(): PricingConfig {
  return _current
}

/** Clear all overrides (back to defaults). */
export function resetPricingOverrides(): void {
  _overrides = {}
  _current = PRICING_CONFIG
}

// ─── First-month intro / scratch-to-reveal ───────────────────────────────────
// The first-month discount is either a flat rate (`firstMonthDiscount`) or,
// when scratch-to-reveal is enabled, one the member reveals by scratching a
// card — drawn at random from `scratchReveal.outcomes` weighted by `weight`.

/** Whether the scratch-to-reveal intro is enabled and has at least one outcome. */
export function scratchRevealEnabled(config = getPricingConfig()): boolean {
  const sr = config.introOffer.scratchReveal
  return !!sr?.enabled && sr.outcomes.length > 0
}

/** The configured scratch outcomes (empty when scratch-to-reveal is off). */
export function scratchOutcomes(config = getPricingConfig()): ScratchOutcome[] {
  return scratchRevealEnabled(config) ? config.introOffer.scratchReveal.outcomes : []
}

/**
 * Draw one first-month discount from the weighted scratch outcomes. `rng` is
 * injectable (defaults to Math.random) so the draw is deterministic in tests.
 * Falls back to the flat `firstMonthDiscount` when scratch-to-reveal is off.
 */
export function rollScratchDiscount(config = getPricingConfig(), rng: () => number = Math.random): number {
  const outcomes = scratchOutcomes(config)
  if (outcomes.length === 0) return config.introOffer.firstMonthDiscount
  const totalWeight = outcomes.reduce((s, o) => s + Math.max(0, o.weight), 0)
  if (totalWeight <= 0) return outcomes[0].discount
  let roll = rng() * totalWeight
  for (const o of outcomes) {
    roll -= Math.max(0, o.weight)
    if (roll < 0) return o.discount
  }
  return outcomes[outcomes.length - 1].discount
}

/** Whether `rate` is one of the configured scratch outcomes (guards against tampering). */
export function isValidScratchDiscount(rate: number, config = getPricingConfig()): boolean {
  return scratchOutcomes(config).some((o) => o.discount === rate)
}

/**
 * The first-month discount to actually apply. A member-revealed `override` is
 * honoured only when it's a valid scratch outcome; anything else falls back to
 * the flat `firstMonthDiscount`. Pass `override: 0` to explicitly apply no intro
 * (e.g. before the member has scratched their card).
 */
export function resolveIntroDiscount(override: number | null | undefined, config = getPricingConfig()): number {
  if (override == null) return scratchRevealEnabled(config) ? 0 : config.introOffer.firstMonthDiscount
  if (override === 0) return 0
  if (scratchRevealEnabled(config)) return isValidScratchDiscount(override, config) ? override : 0
  return config.introOffer.firstMonthDiscount
}

// ─── Discount tiers & margin helpers ─────────────────────────────────────────

/** Best-qualifying tier for an order. Returns the highest discount it unlocks. */
export function resolveTier(
  tiers: DiscountTier[],
  subtotal: number,
  itemCount: number,
): { pct: number; tier: DiscountTier | null } {
  let best: DiscountTier | null = null
  for (const t of tiers) {
    const meetsSubtotal = t.minSubtotal == null || subtotal >= t.minSubtotal
    const meetsItems = t.minItems == null || itemCount >= t.minItems
    if (meetsSubtotal && meetsItems && (!best || t.discountPct > best.discountPct)) best = t
  }
  return { pct: best?.discountPct ?? 0, tier: best }
}

/** Cost of one unit — explicit, or estimated from price. */
export function unitCostOf(product: Pick<CatalogueProduct, 'cost' | 'basePrice'>, unitPrice: number, config = getPricingConfig()): number {
  if (product.cost != null) return product.cost
  return Math.round(unitPrice * config.defaultCostRatio * 100) / 100
}

/**
 * Apply a discount to a unit price, but never below the margin floor
 * (cost × (1+floor)). The floor is capped at the list price, so a product whose
 * cost is already above the floor simply gets no discount (never a markup).
 */
export function discountWithFloor(unitPrice: number, rate: number, cost: number, config = getPricingConfig()): number {
  const discounted = unitPrice * (1 - rate)
  const floor = Math.min(unitPrice, cost * (1 + config.marginFloorPct))
  return Math.max(discounted, floor)
}

// ─── Per-bundle price caps ────────────────────────────────────────────────────

/** The hard discounted one-off cap (£) for a budget tier, or null when uncapped. */
export function budgetCapFor(budget: Budget | null, config = getPricingConfig()): number | null {
  if (!budget) return null
  return config.budgetCaps[budget] ?? null
}

/**
 * The discounted one-off total for a set of (price, cost) lines: the best
 * qualifying bundle-tier discount applied per line with the margin floor — the
 * SAME maths `calculatePricing` uses for `oneOffTotal`, so the cap enforced at
 * selection/personalisation time matches the price shown at the reveal.
 */
export function discountedOneOffTotal(
  lines: { price: number; cost: number }[],
  config = getPricingConfig(),
): number {
  return priceOneOffLines(lines, config).total
}

/** One line of a priced one-off order. */
export interface OneOffPricedLine {
  /** List price of one unit, before any discount. */
  unitPrice: number
  /**
   * What one unit is actually charged, after the bundle tier and the margin
   * floor. Rounded to whole pence, because this is the number handed to Stripe
   * as `unit_amount` — anything finer than a penny does not survive the trip.
   */
  discountedUnitPrice: number
  quantity: number
  /** `discountedUnitPrice × quantity`. */
  lineTotal: number
}

export interface OneOffPricing {
  lines: OneOffPricedLine[]
  /** Undiscounted order value — what the tier qualification is measured against. */
  subtotal: number
  /** What the customer pays. */
  total: number
  /** `subtotal − total`. */
  discount: number
  /** The qualifying tier rate, 0–1. */
  tierPct: number
  tierLabel: string | null
}

/**
 * Price a one-off order: the bundle tier applied per line, floored at the
 * margin, quantity-aware.
 *
 * **This is the single definition of what a one-off order costs**, and it exists
 * because there used to be two. The quiz displayed `calculatePricing().oneOffTotal`
 * — tier-discounted — while `/api/cart` billed Stripe the raw sum of variant
 * prices, so a stack shown at £96 was charged at £120. The shop had the mirror
 * problem: it displayed a raw subtotal and never applied the configured tiers at
 * all, so shop customers silently never received a discount the config said they
 * had earned.
 *
 * Both the display and the Stripe line items now come from here, so they cannot
 * disagree. Rounding is per-unit rather than on the total, because that is what
 * Stripe actually charges: `unit_amount × quantity`. Summing unrounded prices
 * and rounding once would produce a displayed total the card never matches.
 */
export function priceOneOffLines(
  lines: { price: number; cost: number; quantity?: number }[],
  config = getPricingConfig(),
): OneOffPricing {
  const round = (n: number) => Math.round(n * 100) / 100
  const qtyOf = (l: { quantity?: number }) => Math.max(1, Math.round(l.quantity ?? 1))

  // Qualification is measured on the UNDISCOUNTED order — the tier is what the
  // basket has earned, not what it costs after earning it.
  const subtotal = lines.reduce((s, l) => s + l.price * qtyOf(l), 0)
  const itemCount = lines.reduce((n, l) => n + qtyOf(l), 0)
  const { pct, tier } = resolveTier(config.bundleTiers, subtotal, itemCount)

  const priced: OneOffPricedLine[] = lines.map((l) => {
    const quantity = qtyOf(l)
    const discountedUnitPrice = round(discountWithFloor(l.price, pct, l.cost, config))
    return {
      unitPrice: round(l.price),
      discountedUnitPrice,
      quantity,
      lineTotal: round(discountedUnitPrice * quantity),
    }
  })

  const total = round(priced.reduce((s, l) => s + l.lineTotal, 0))
  return {
    lines: priced,
    subtotal: round(subtotal),
    total,
    discount: round(subtotal - total),
    tierPct: pct,
    tierLabel: tier?.label ?? null,
  }
}

// ─── Subscription qualification & resolution ─────────────────────────────────

/**
 * Whether a product is itself a sensible monthly subscription item: flagged
 * subscriptionEligible AND lasting roughly a month. Products that fail this
 * should be mapped to a monthly refill via `subscriptionProductId`.
 */
export function qualifiesForSubscription(
  product: Pick<CatalogueProduct, 'subscriptionEligible' | 'servings'>,
  config = getPricingConfig(),
): boolean {
  return (
    product.subscriptionEligible &&
    product.servings <= config.maxSubscriptionServings
  )
}

/**
 * Resolve the product that should be billed/shipped monthly when `product` is
 * put on subscription. Falls back to the product itself when no (valid) mapping
 * is set, so the monthly plan is always available.
 */
export function getSubscriptionProduct(
  product: CatalogueProduct,
  catalogue: CatalogueProduct[],
): CatalogueProduct {
  const mappedId = product.subscriptionProductId
  if (mappedId && mappedId !== product.id) {
    const mapped = catalogue.find((p) => p.id === mappedId)
    if (mapped) return mapped
    // Mapping set but not found in catalogue — fall back to self.
  }
  return product
}

// ─── Consumption → monthly quantity ──────────────────────────────────────────

/** Approximate training sessions per month, from the quiz training frequency. */
export function workoutsPerMonth(answers?: QuizAnswers | null): number {
  switch (answers?.trainingFrequency) {
    case '1-2x': return 6
    case '3-4x': return 15
    case '5-6x': return 24
    case 'daily': return 30
    default: return 12 // unknown → assume ~3×/week
  }
}

/**
 * The consumption protocol for a product — explicit if set, otherwise derived
 * from its stack slots (energy/hydration are taken per-workout, the rest daily)
 * and servings (servings per container at the normal dose).
 */
export function resolveConsumption(product: CatalogueProduct): { cadence: ConsumptionCadence; servingsPerUnit: number } {
  if (product.consumption) return product.consumption
  const perWorkout = product.stackSlots.some((s) => s === 'energy' || s === 'hydration')
  return {
    cadence: perWorkout ? 'per-workout' : 'daily',
    servingsPerUnit: product.servings > 0 ? product.servings : DAYS_PER_MONTH,
  }
}

// ─── Rhythm sizing — the single source of truth for monthly occasions ─────────
// Each drink is sized to HOW IT'S CONSUMED, so the Pour Plan and the priced
// box always agree (see docs/POUR_PLAN_SPEC.md). Untagged products resolve to
// the previous behaviour (daily → 30, else training sessions/month).

const WEEKS_PER_MONTH = 4.345
const AS_NEEDED_FLOOR = 4
const AS_NEEDED_CAP = 20

function asNeededWeekly(freq: 'often' | 'sometimes' | 'rarely'): number {
  return freq === 'often' ? 4 : freq === 'rarely' ? 1 : 2
}

/** The everyday drinks/day pace (dailyDrinks → legacy drinksPerDay → 2). */
export function resolveDrinksPace(answers?: QuizAnswers | null): number {
  const v = answers?.dailyDrinks ?? answers?.drinksPerDay
  return v && v > 0 ? v : 2
}

/** Minimum monthly occasions a daily anchor keeps after pace-scaling (~2/week). */
export const PACE_DAILY_FLOOR = 8

/**
 * In LQD drinks mode the pace is a daily RATE, not a per-kind count: the everyday
 * base should total ~pace × 30 across all the daily kinds (the "pool you sip
 * ~pace a day" model). This returns the factor to scale daily-anchor occasions
 * so their sum lands on the pace target (1 = no scaling needed / not drinks mode).
 */
export function paceDailyFactor(dailyOccasionsSum: number, answers?: QuizAnswers | null): number {
  if (!answers?.drinksMode || dailyOccasionsSum <= 0) return 1
  const target = resolveDrinksPace(answers) * DAYS_PER_MONTH
  return dailyOccasionsSum <= target ? 1 : target / dailyOccasionsSum
}

/** Monthly occasions for a product from its consumption rhythm + the answers. */
export function occasionsPerMonthFor(product: CatalogueProduct, answers?: QuizAnswers | null): number {
  const c = product.consumption
  const cadence: ConsumptionCadence = c?.cadence ?? resolveConsumption(product).cadence
  if (cadence === 'per-workout') return Math.max(1, workoutsPerMonth(answers))
  if (cadence === 'as-needed') {
    const trigger = c?.asNeededTrigger
    const freq = (trigger && answers?.asNeeded?.[trigger]) || 'sometimes'
    return Math.min(AS_NEEDED_CAP, Math.max(AS_NEEDED_FLOOR, Math.round(asNeededWeekly(freq) * WEEKS_PER_MONTH)))
  }
  const daysPerWeek = c?.daysPerWeek ?? 7
  return daysPerWeek >= 7 ? DAYS_PER_MONTH : Math.round(daysPerWeek * WEEKS_PER_MONTH)
}

// ─── Usage levels (the customisation journey's sliders) ──────────────────────
// A member dials in how much they get through on a friendly, no-maths scale.
// Each level is a multiplier on servings-per-occasion: 'light' = fewer servings
// per day/workout (a tub lasts longer, ships less often), 'heavy' = more.
// 'standard' is the suggested default — what the engine picks automatically.

export const USAGE_LEVELS = ['light', 'standard', 'heavy'] as const
export type UsageLevel = (typeof USAGE_LEVELS)[number]

/** Servings consumed per occasion (per day for daily, per session for per-workout). */
export const USAGE_SERVINGS_PER_OCCASION: Record<UsageLevel, number> = {
  light: 0.5,
  standard: 1,
  heavy: 2,
}

export const DEFAULT_USAGE_LEVEL: UsageLevel = 'standard'

/**
 * Weight-sensitive serving multiplier. Protein needs scale with body mass, so
 * heavier bands take more per day (a tub runs out sooner → tighter cadence).
 * Only protein-slot products are affected; everything else — and an unset
 * weight — stays at 1, so nothing changes for users who skip the weight band.
 */
export function proteinWeightFactor(product: CatalogueProduct, answers?: QuizAnswers | null): number {
  if (!product.stackSlots.includes('protein')) return 1
  switch (answers?.weightBand) {
    case 'under-60': return 0.8
    case '90-105': return 1.5
    case '105-plus': return 1.75
    default: return 1 // 60–75, 75–90, or unset
  }
}

/** How a product is sized into a subscription line: cadence + ship schedule. */
export interface LineSizing {
  cadence: ConsumptionCadence
  /** Servings in one container. */
  servingsPerUnit: number
  /** Times taken per month (~30 daily, training sessions/month per-workout). */
  occasionsPerMonth: number
  /** The usage level applied (member-chosen, defaults to 'standard'). */
  usageLevel: UsageLevel
  /** Units sent each shipment. */
  unitsPerShipment: number
  /** Ship cadence in months. */
  shipEveryMonths: number
  /** Average units consumed per month (unitsPerShipment / shipEveryMonths). */
  monthlyUnits: number
}

/**
 * Size a product into a subscription line: derive its consumption protocol and
 * the nearest sensible ship schedule for the member's training frequency and
 * chosen usage level. Shared by `buildSubscriptionPlan` (initial stack) and the
 * hub's add/cadence helpers so every line is sized the same way.
 *
 * `usageLevel` scales servings-per-occasion (the journey's per-product slider);
 * 'standard' reproduces the previous one-serving-per-occasion default.
 */
export function sizeConsumption(
  product: CatalogueProduct,
  answers?: QuizAnswers | null,
  config = getPricingConfig(),
  usageLevel: UsageLevel = DEFAULT_USAGE_LEVEL,
  occasionsOverride?: number,
): LineSizing {
  const { cadence, servingsPerUnit } = resolveConsumption(product)
  const occasionsPerMonth = occasionsOverride ?? occasionsPerMonthFor(product, answers)
  const servingsPerOccasion = (USAGE_SERVINGS_PER_OCCASION[usageLevel] ?? 1) * proteinWeightFactor(product, answers)
  const servingsPerMonth = occasionsPerMonth * servingsPerOccasion
  const monthsOneUnitLasts = servingsPerMonth > 0 ? servingsPerUnit / servingsPerMonth : config.maxDeliveryMonths

  let unitsPerShipment: number
  let shipEveryMonths: number
  if (monthsOneUnitLasts >= 1) {
    unitsPerShipment = 1
    shipEveryMonths = Math.min(config.maxDeliveryMonths, Math.max(1, Math.round(monthsOneUnitLasts)))
  } else {
    unitsPerShipment = Math.max(1, Math.round(servingsPerMonth / servingsPerUnit))
    shipEveryMonths = 1
  }

  return {
    cadence,
    servingsPerUnit,
    occasionsPerMonth,
    usageLevel,
    unitsPerShipment,
    shipEveryMonths,
    monthlyUnits: unitsPerShipment / shipEveryMonths,
  }
}

/** A single line in the monthly subscription, after deduplication. */
export interface SubscriptionLine {
  /** The monthly product that will actually be billed/shipped. */
  product: CatalogueProduct
  /** Slot ids this line fulfils — more than one when slots share a sub product. */
  coversSlotIds: string[]
  /** How the product is taken. */
  cadence: ConsumptionCadence
  /** Times taken per month: ~30 for daily, training sessions/month for per-workout. */
  occasionsPerMonth: number
  /** Servings in one container. */
  servingsPerUnit: number
  /** The member's chosen usage level for this line (defaults to 'standard'). */
  usageLevel: UsageLevel
  /** Units sent each shipment. */
  unitsPerShipment: number
  /** Ship cadence in months (e.g. 2 = one unit every two months). */
  shipEveryMonths: number
  /** Average units consumed per month (unitsPerShipment / shipEveryMonths). */
  monthlyUnits: number
  /** The catalogue variant that will be billed and shipped. */
  variantId: string
  /** Undiscounted price of one unit. */
  unitPrice: number
  /** Cost of goods for one unit. */
  unitCost: number
  /** Discounted amount billed each delivery (unitsPerShipment × discounted unit price). */
  pricePerDelivery: number
  /** Amortised undiscounted monthly cost. */
  monthlyBaseline: number
  /** Amortised monthly cost after the subscription discount. */
  monthlyPrice: number
}

/**
 * Build the deduplicated monthly subscription from a blueprint: each slot's
 * product is resolved to its subscription product, and slots that resolve to
 * the SAME subscription product are merged into one line (billed once).
 * Slots whose resolved product isn't subscriptionEligible are skipped.
 */
interface RawSubLine {
  product: CatalogueProduct
  coversSlotIds: string[]
  cadence: ConsumptionCadence
  occasionsPerMonth: number
  servingsPerUnit: number
  usageLevel: UsageLevel
  unitsPerShipment: number
  shipEveryMonths: number
  monthlyUnits: number
  variant: CatalogueProduct['variants'][number] | undefined
  productRef: CatalogueProduct
  unitPrice: number
}

/** Options for building/pricing a subscription plan. */
export interface SubscriptionPlanOptions {
  /** Per-product usage level chosen in the customisation journey. */
  usageByProductId?: Record<string, UsageLevel>
  /** The bundle/stack level, for the fixed subscribe-&-save rate. */
  level?: StackLevel
  /**
   * The first-month intro discount the member revealed by scratching their card
   * (0–1). Honoured only when it's a valid scratch outcome. Omit (or null) to
   * apply no intro discount while scratch-to-reveal is enabled — the member
   * hasn't scratched yet, so nothing is auto-applied. See `resolveIntroDiscount`.
   */
  introDiscountOverride?: number | null
}

/**
 * The bundle (stack level) for a blueprint: explicit `level` if set, otherwise
 * derived from how many products it has — bigger stack = higher bundle.
 */
export function stackLevelOf(blueprint: Pick<StackBlueprint, 'slots'> & { level?: StackLevel }): StackLevel {
  if (blueprint.level) return blueprint.level
  const n = blueprint.slots.length
  if (n <= 3) return 'essentials'
  if (n <= 5) return 'performance'
  return 'complete'
}

/**
 * The bundle tier a quiz stack-preference maps to. Single source of truth shared
 * by the budget step's advertised save-rate AND the stack the member actually
 * gets, so the two can never drift. 'balanced' and any unset value → performance.
 */
export function levelForStackPreference(pref: StackPreference | null | undefined): StackLevel {
  return pref === 'simple' ? 'essentials' : pref === 'complete' ? 'complete' : 'performance'
}

/**
 * Whether an order qualifies for free delivery.
 *
 * **Pass the SUBTOTAL, before any bundle discount.** Qualifying on the
 * discounted total creates a trap the customer cannot make sense of: a £62
 * basket earns 8% off, drops to £57, and is then charged postage it would have
 * avoided by being *cheaper*. From their side they spent over the threshold,
 * were promised free delivery, and paid it anyway.
 *
 * The bundle tier already qualifies on the undiscounted subtotal
 * (`priceOneOffLines`), so this puts both perks on the same basis: what the
 * basket is worth, not what it costs after we have discounted it.
 */
export function qualifiesForFreeDelivery(subtotal: number, config = getPricingConfig()): boolean {
  return config.freeDeliveryThreshold > 0 && subtotal >= config.freeDeliveryThreshold
}

/** The fixed subscribe-&-save rate for a bundle/level (before any tier upgrade). */
export function levelSubscriptionRate(level: StackLevel | undefined, config = getPricingConfig()): number {
  return (level && config.levelSubscriptionDiscount[level]) || config.subscriptionDiscount
}

/**
 * The effective subscription discount for an order: the bundle's fixed per-level
 * rate, beaten by any qualifying subscription tier.
 */
export function resolveSubscriptionRate(
  monthlySubtotal: number,
  itemCount: number,
  config = getPricingConfig(),
  level?: StackLevel,
): number {
  return Math.max(levelSubscriptionRate(level, config), resolveTier(config.subscriptionTiers, monthlySubtotal, itemCount).pct)
}

export function buildSubscriptionPlan(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  answers?: QuizAnswers | null,
  config = getPricingConfig(),
  opts: SubscriptionPlanOptions = {},
): SubscriptionLine[] {
  const round = (n: number) => Math.round(n * 100) / 100
  const usageByProductId = opts.usageByProductId ?? {}
  const level = stackLevelOf({ ...blueprint, level: opts.level ?? blueprint.level })

  // ── Pass 1: build raw, deduplicated lines (no discount applied yet) ──
  const raw = new Map<string, RawSubLine>()
  for (const slot of blueprint.slots) {
    const slotProduct = catalogue.find((p) => p.id === slot.selectedProductId)
    if (!slotProduct) continue

    const sub = getSubscriptionProduct(slotProduct, catalogue)
    if (!sub.subscriptionEligible) continue

    const existing = raw.get(sub.id)
    if (existing) {
      existing.coversSlotIds.push(slot.slotId)
      continue
    }

    // Self-subscription respects the chosen variant; a mapped refill uses its default.
    const variant =
      sub.id === slotProduct.id
        ? sub.variants.find((v) => v.id === slot.selectedVariantId) ??
          sub.variants.find((v) => v.available) ??
          sub.variants[0]
        : sub.variants.find((v) => v.available) ?? sub.variants[0]
    const unitPrice = variant?.price ?? sub.basePrice

    const sizing = sizeConsumption(sub, answers, config, usageByProductId[sub.id])

    raw.set(sub.id, {
      product: sub,
      coversSlotIds: [slot.slotId],
      cadence: sizing.cadence,
      occasionsPerMonth: sizing.occasionsPerMonth,
      servingsPerUnit: sizing.servingsPerUnit,
      usageLevel: sizing.usageLevel,
      unitsPerShipment: sizing.unitsPerShipment,
      shipEveryMonths: sizing.shipEveryMonths,
      monthlyUnits: sizing.monthlyUnits,
      variant,
      productRef: sub,
      unitPrice,
    })
  }

  // ── Drinks-mode pace scaling ──
  // The everyday base = ~pace × 30 across all daily kinds (a pool sipped ~pace a
  // day), not ×30 per kind. Scale daily anchors to the pace and re-derive their
  // ship schedule so the box and the Pour Plan both land on the chosen pace.
  if (answers?.drinksMode) {
    const dailyEntries = [...raw.values()].filter((r) => r.cadence === 'daily')
    const dailySum = dailyEntries.reduce((s, r) => s + r.occasionsPerMonth, 0)
    const factor = paceDailyFactor(dailySum, answers)
    if (factor < 1) {
      for (const r of dailyEntries) {
        const scaled = Math.max(PACE_DAILY_FLOOR, Math.round(r.occasionsPerMonth * factor))
        if (scaled >= r.occasionsPerMonth) continue
        const resized = sizeConsumption(r.product, answers, config, r.usageLevel, scaled)
        r.occasionsPerMonth = resized.occasionsPerMonth
        r.servingsPerUnit = resized.servingsPerUnit
        r.unitsPerShipment = resized.unitsPerShipment
        r.shipEveryMonths = resized.shipEveryMonths
        r.monthlyUnits = resized.monthlyUnits
      }
    }
  }

  // ── Resolve the order-level discount, then apply it (with the margin floor) ──
  const rawLines = [...raw.values()]
  const monthlySubtotal = rawLines.reduce((s, r) => s + r.monthlyUnits * r.unitPrice, 0)
  const rate = resolveSubscriptionRate(monthlySubtotal, rawLines.length, config, level)

  return rawLines.map((r) => {
    const unitCost = unitCostOf(r.productRef, r.unitPrice, config)
    const discountedUnit = discountWithFloor(r.unitPrice, rate, unitCost, config)
    return {
      product: r.product,
      coversSlotIds: r.coversSlotIds,
      cadence: r.cadence,
      occasionsPerMonth: r.occasionsPerMonth,
      servingsPerUnit: r.servingsPerUnit,
      usageLevel: r.usageLevel,
      unitsPerShipment: r.unitsPerShipment,
      shipEveryMonths: r.shipEveryMonths,
      monthlyUnits: r.monthlyUnits,
      variantId: r.variant?.id ?? r.product.id,
      unitPrice: round(r.unitPrice),
      unitCost: round(unitCost),
      pricePerDelivery: round(r.unitsPerShipment * discountedUnit),
      monthlyBaseline: round(r.monthlyUnits * r.unitPrice),
      monthlyPrice: round(r.monthlyUnits * discountedUnit),
    }
  })
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StackPricing {
  /** Sum of selected variant prices (or basePrice fallback). */
  oneOffTotal: number
  /** Sum of selected variant prices BEFORE the bundle discount — the "regular"
   *  one-off price the discount is applied to. Equals oneOffTotal when no
   *  bundle discount qualifies. */
  oneOffSubtotal: number
  /** Sum of compareAtPrice (RRP) across all slots. Equals oneOffTotal when no compare prices exist. */
  rrpTotal: number
  /** rrpTotal − oneOffTotal. 0 when no compare prices exist. */
  bundleSaving: number
  /** bundleSaving / rrpTotal expressed as 0–100. 0 when no compare prices exist. */
  bundleSavingPct: number
  /** The resolved one-off bundle discount tier, 0–100. */
  bundleDiscountPct: number
  /** Label of the qualifying bundle tier (e.g. "£90+ bundle"), null if none. */
  bundleTierLabel: string | null
  /** One-off gross margin (oneOffTotal − cost of goods). PORTAL-facing, not shown to customers. */
  oneOffMargin: number
  /** One-off margin as a percentage of oneOffTotal. */
  oneOffMarginPct: number
  /**
   * Monthly price of the subscription: each slot resolved to its subscription
   * product, deduplicated, with subscriptionDiscount applied to each line.
   */
  subscriptionTotal: number
  /** Undiscounted price of the (deduplicated) subscription products — the baseline for subscriptionSaving. */
  subscriptionItemsOneOffTotal: number
  /** subscriptionItemsOneOffTotal − subscriptionTotal */
  subscriptionSaving: number
  /** subscriptionSaving / subscriptionItemsOneOffTotal expressed as 0–100. */
  subscriptionSavingPct: number
  /** Number of distinct products in the monthly subscription (after dedupe). */
  subscriptionItemCount: number
  /** Number of slots whose subscription product differs from the one-off product (flipped to a monthly refill). */
  subscriptionSwappedCount: number
  /** Number of slots that can't subscribe at all (resolved product isn't subscriptionEligible). */
  excludedFromSubscriptionCount: number
  /** Minimum subscription commitment in months for this stack (≥ 1). */
  subscriptionMinMonths: number
  /** Flat monthly price billed on the first cycle, after the intro discount. */
  subscriptionFirstMonth: number
  /** Intro discount applied to the first month, 0–100. */
  subscriptionIntroDiscountPct: number
  /** Total the customer commits to across the minimum term (first month + the rest). */
  subscriptionMinTermTotal: number
  /** Subscription gross margin per month (monthly total − monthly cost of goods). PORTAL-facing. */
  subscriptionMonthlyMargin: number
  /** Margin across the whole minimum commitment (committed revenue − cost of goods shipped in the term). PORTAL-facing. */
  subscriptionCommittedMargin: number
  /** True when the minimum-term commitment is profitable even if the customer cancels at the earliest point. */
  subscriptionProfitableOnCancel: boolean
  /** True when the flat monthly meets the minimum order value to offer a subscription. */
  subscriptionMinOrderMet: boolean
  /** The bundle tier (stack level) the subscription rate is based on. */
  bundleLevel: StackLevel
  /** The fixed subscribe-&-save discount for this bundle, 0–100 (the headline selling point). */
  subscriptionDiscountPct: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve the price for a single slot: selected variant → basePrice fallback. */
function slotPrice(slot: StackBlueprint['slots'][number], product: CatalogueProduct): number {
  if (slot.selectedVariantId) {
    const variant = product.variants.find((v) => v.id === slot.selectedVariantId)
    if (variant) return variant.price
  }
  // Fall back to first available variant then basePrice
  const firstAvailable = product.variants.find((v) => v.available)
  return firstAvailable?.price ?? product.basePrice
}

/** Resolve the RRP (compareAtPrice) for a single slot. Falls back to the slot price when absent. */
function slotRrp(slot: StackBlueprint['slots'][number], product: CatalogueProduct): number {
  if (slot.selectedVariantId) {
    const variant = product.variants.find((v) => v.id === slot.selectedVariantId)
    if (variant?.compareAtPrice) return variant.compareAtPrice
  }
  // Try first available variant's compareAtPrice, then product-level, then slot price
  const firstAvailable = product.variants.find((v) => v.available)
  return (
    firstAvailable?.compareAtPrice ??
    product.compareAtPrice ??
    slotPrice(slot, product)
  )
}

// ─── Main calculation ─────────────────────────────────────────────────────────

/**
 * Compute the full pricing breakdown for a StackBlueprint.
 * All values are rounded to 2 dp.
 * Returns zeroed-out pricing when the catalogue is empty or products are missing.
 */
export function calculatePricing(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  answers?: QuizAnswers | null,
  config = getPricingConfig(),
  opts: SubscriptionPlanOptions = {},
): StackPricing {
  const round = (n: number) => Math.round(n * 100) / 100
  const bundleLevel = stackLevelOf({ ...blueprint, level: opts.level ?? blueprint.level })

  // ── One-off bundle (tiered discount, margin-floored per line) ──
  const oneOffLines: { price: number; rrp: number; cost: number }[] = []
  for (const slot of blueprint.slots) {
    const product = catalogue.find((p) => p.id === slot.selectedProductId)
    if (!product) continue
    const price = slotPrice(slot, product)
    oneOffLines.push({ price, rrp: slotRrp(slot, product), cost: unitCostOf(product, price, config) })
  }
  const rrpTotal = oneOffLines.reduce((s, l) => s + l.rrp, 0)
  // Delegated so the price shown here and the price billed to Stripe come from
  // one implementation and cannot drift apart — see `priceOneOffLines`.
  const oneOff = priceOneOffLines(oneOffLines, config)
  const oneOffSubtotal = oneOff.subtotal
  const bundleTier = { pct: oneOff.tierPct, tier: oneOff.tierLabel ? { label: oneOff.tierLabel } : null }
  const oneOffTotal = oneOff.total
  const oneOffCost = round(oneOffLines.reduce((s, l) => s + l.cost, 0))
  const bundleSaving = round(rrpTotal - oneOffTotal)
  const oneOffMargin = round(oneOffTotal - oneOffCost)

  // ── Monthly subscription (resolved, deduplicated, quantity-aware) ──
  const subPlan = buildSubscriptionPlan(blueprint, catalogue, answers, config, { ...opts, level: bundleLevel })
  const subscriptionDiscountRate = resolveSubscriptionRate(
    subPlan.reduce((s, l) => s + l.monthlyBaseline, 0),
    subPlan.length,
    config,
    bundleLevel,
  )
  let subscriptionTotal = 0
  let subscriptionItemsOneOffTotal = 0
  for (const line of subPlan) {
    subscriptionItemsOneOffTotal += line.monthlyBaseline
    subscriptionTotal += line.monthlyPrice
  }
  subscriptionTotal = round(subscriptionTotal)
  subscriptionItemsOneOffTotal = round(subscriptionItemsOneOffTotal)
  const subscriptionSaving = round(subscriptionItemsOneOffTotal - subscriptionTotal)

  // Minimum commitment: the config floor, raised by any product that requires a
  // longer term (set in the portal).
  const subscriptionMinMonths = subPlan.reduce(
    (min, line) => Math.max(min, line.product.minSubscriptionMonths ?? 0),
    config.minSubscriptionMonths,
  )

  // Intro offer: a discount on the first month; the rest bill at the flat total.
  // With scratch-to-reveal enabled nothing is applied until the member reveals a
  // rate (opts.introDiscountOverride); resolveIntroDiscount validates it.
  //
  // FLOORED PER LINE, like every other discount. This used to be a flat
  // `subscriptionTotal × (1 − intro)`, which walked straight past
  // `marginFloorPct` — the floor is applied inside `buildSubscriptionPlan` and
  // the intro was applied after it, out here. So the single deepest discount in
  // the business was the one discount the guardrail never saw: a Complete stack
  // with the old 25% card came to 40% off against a floor set at ~37%. Applying
  // it line by line puts the intro under the same rule as the subscribe-&-save
  // rate, and the two now compound against one floor rather than around it.
  const introDiscount = subPlan.length > 0 ? resolveIntroDiscount(opts.introDiscountOverride, config) : 0
  const subscriptionFirstMonth = round(
    subPlan.reduce((s, line) => {
      // `unitsPerShipment` is always ≥ 1, so this recovers the subscribe-&-save
      // unit price without dividing by a fractional monthly quantity.
      const subscribedUnit = line.pricePerDelivery / line.unitsPerShipment
      // The intro offer is allowed below the margin floor by default — see
      // `introOffer.respectMarginFloor`. Rounded PER LINE, exactly as
      // `monthlyPrice` is, so a first month carrying no intro discount comes to
      // the same total as every month after it; summing unrounded and rounding
      // once lands a penny out, and "£53.24 now, £53.25 thereafter" is the kind
      // of detail that costs a checkout.
      const introUnit = config.introOffer.respectMarginFloor
        ? discountWithFloor(subscribedUnit, introDiscount, line.unitCost, config)
        : subscribedUnit * (1 - introDiscount)
      return s + round(line.monthlyUnits * introUnit)
    }, 0),
  )
  const subscriptionMinTermTotal = round(
    subscriptionFirstMonth + Math.max(0, subscriptionMinMonths - 1) * subscriptionTotal,
  )

  // ── Margin / profit guardrails (portal-facing, not shown to customers) ──
  let monthlyCost = 0
  let committedCost = 0
  for (const line of subPlan) {
    monthlyCost += line.monthlyUnits * line.unitCost
    // Deliveries within the minimum term (first delivery at signup / month 0).
    const deliveries = Math.floor((subscriptionMinMonths - 1) / line.shipEveryMonths) + 1
    committedCost += deliveries * line.unitsPerShipment * line.unitCost
  }
  const subscriptionMonthlyMargin = round(subscriptionTotal - monthlyCost)
  const subscriptionCommittedMargin = round(subscriptionMinTermTotal - committedCost)
  const subscriptionProfitableOnCancel = subPlan.length > 0 && subscriptionCommittedMargin >= 0
  const subscriptionMinOrderMet = subPlan.length > 0 && subscriptionTotal >= config.minSubscriptionMonthly

  // Per-slot counts: how many flip to a refill, how many can't subscribe at all.
  let subscriptionSwappedCount = 0
  let excludedFromSubscriptionCount = 0
  for (const slot of blueprint.slots) {
    const product = catalogue.find((p) => p.id === slot.selectedProductId)
    if (!product) continue
    const sub = getSubscriptionProduct(product, catalogue)
    if (!sub.subscriptionEligible) {
      excludedFromSubscriptionCount += 1
    } else if (sub.id !== product.id) {
      subscriptionSwappedCount += 1
    }
  }

  return {
    oneOffTotal,
    oneOffSubtotal: round(oneOffSubtotal),
    rrpTotal: round(rrpTotal),
    bundleSaving,
    bundleSavingPct: rrpTotal > 0 ? Math.round((bundleSaving / rrpTotal) * 100) : 0,
    bundleDiscountPct: Math.round(bundleTier.pct * 1000) / 10,
    bundleTierLabel: bundleTier.tier?.label ?? null,
    oneOffMargin,
    oneOffMarginPct: oneOffTotal > 0 ? Math.round((oneOffMargin / oneOffTotal) * 100) : 0,
    subscriptionTotal,
    subscriptionItemsOneOffTotal,
    subscriptionSaving,
    subscriptionSavingPct:
      subscriptionItemsOneOffTotal > 0
        ? Math.round((subscriptionSaving / subscriptionItemsOneOffTotal) * 100)
        : 0,
    subscriptionItemCount: subPlan.length,
    subscriptionSwappedCount,
    excludedFromSubscriptionCount,
    subscriptionMinMonths,
    subscriptionFirstMonth,
    subscriptionIntroDiscountPct: Math.round(introDiscount * 100),
    subscriptionMinTermTotal,
    subscriptionMonthlyMargin,
    subscriptionCommittedMargin,
    subscriptionProfitableOnCancel,
    subscriptionMinOrderMet,
    bundleLevel,
    subscriptionDiscountPct: Math.round(subscriptionDiscountRate * 1000) / 10,
  }
}

// ─── Usage clamp (keeps the journey's sliders profitable) ────────────────────

/**
 * The usage levels a product may be set to in the customisation journey without
 * dropping the whole plan below the minimum monthly order value. Heavier usage
 * only ever raises revenue, so the cap is the *lighter* end; combined with the
 * per-unit margin floor (`discountWithFloor`) and the `maxDeliveryMonths` cadence
 * cap, this is what stops a member dialling the subscription into the red.
 */
export function allowedUsageLevels(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  answers: QuizAnswers | null | undefined,
  productId: string,
  usageByProductId: Record<string, UsageLevel>,
  config = getPricingConfig(),
): UsageLevel[] {
  const allowed = USAGE_LEVELS.filter((level) => {
    const trial = { ...usageByProductId, [productId]: level }
    const total = calculatePricing(blueprint, catalogue, answers, config, { usageByProductId: trial }).subscriptionTotal
    return total >= config.minSubscriptionMonthly
  })
  // The suggested level is ALWAYS offered, even when it leaves the plan under
  // the subscription minimum.
  //
  // Otherwise this turns into a nudge: raising `minSubscriptionMonthly` can
  // leave a small plan qualifying only at 'heavy', and the member is quietly
  // funnelled into getting through product faster in order to be allowed to
  // subscribe at all. Whether a plan is big enough to subscribe is a separate
  // question with its own answer (`subscriptionMinOrderMet`) — the usage slider
  // is for how much they actually use, and it should not be doing commercial
  // work behind their back.
  return allowed.includes(DEFAULT_USAGE_LEVEL) ? allowed : [...allowed, DEFAULT_USAGE_LEVEL].sort(
    (a, b) => USAGE_LEVELS.indexOf(a) - USAGE_LEVELS.indexOf(b),
  )
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Format a number as £X.XX — always 2 decimal places, UK currency. */
export function formatGBP(amount: number): string {
  return `£${amount.toFixed(2)}`
}

/** Format a saving amount. Returns empty string when saving is ≤ 0. */
export function formatSaving(amount: number, pct: number): string {
  if (amount <= 0) return ''
  return `Save ${formatGBP(amount)} (${pct}% off)`
}
