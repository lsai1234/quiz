'use client'

import { Fragment } from 'react'
import Link from 'next/link'

import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { StackPricing, SubscriptionLine } from '@/lib/stack-blueprint/pricing'
import { cadenceLine, formatGBP, getPricingConfig, planComparison, qualifiesForFreeDelivery } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import type { PlanType } from '@/lib/store'
import { TIER_META } from '@/lib/quiz-core'
import { Icon } from '@/components/ui/Icon'
import type { CodeKind } from '@/components/checkout/PartnerCodeBox'
import { ProductTile } from './ProductTile'
import { ShopAlaCarte } from './ShopAlaCarte'
import { customerDeliveryCharge } from '@/lib/pricing/delivery'
import { FREE_GIFT_TERMS_PATH, OFFER_COPY } from '@/lib/offer/copy'

interface LineItem {
  key: string
  formats: readonly string[]
  imageUrl: string | null
  title: string
  price: number
  suffix?: string
  /** How it is taken and how often it lands. Subscription lines only. */
  note?: string
  /** What it is — the product type ("Electrolytes"). One-off lines, where there is no cadence to say. */
  role?: string
}

interface Props {
  slots: StackSlotEntry[]
  products: CatalogueProduct[]
  subscriptionPlan: SubscriptionLine[]
  pricing: StackPricing
  planType: PlanType
  onPlanChange: (plan: PlanType) => void
  onCheckout?: () => void
  onCustomise?: () => void
  isLoading?: boolean
  /** The applied partner code, so its line can be named rather than anonymous. */
  partnerCode?: string | null
  /** Which kind of code that is, so the shop handoff can say whether it still works there. */
  codeKind?: CodeKind | null
  /**
   * Set when a partner's starter stack is paying for this order.
   *
   * The receipt is told rather than working it out, because it cannot: a
   * starter sets the price at zero server-side (`priceStarterOrder`) and the
   * pricing object it is handed still carries the list figures. Without this
   * the screen would show £126 and the order would cost nothing — a pleasant
   * surprise, and still a receipt that disagrees with the charge.
   *
   * The label is the tier's, so the line reads "Balanced starter stack" rather
   * than a code nobody recognises.
   */
  starterStack?: { label: string } | null
  /**
   * Set when only a one-off can be bought, with the sentence that says why —
   * a founder code, which the subscription checkout cannot honour. The monthly
   * tab is shut and this replaces the minimum-order note under it.
   */
  oneOffOnly?: string | null
  /**
   * Handed the checkout button as it mounts, so the page can watch whether it
   * is on screen and retire the sticky bar that would otherwise sit on top of
   * it. A callback ref rather than a `querySelector`: the receipt does not
   * exist on the page's first commit, and a one-shot lookup found nothing and
   * never looked again.
   */
  onCtaRef?: (el: HTMLButtonElement | null) => void
  /**
   * The free bonus with this order (plan Phase 4): a £0.00 line and nothing
   * else. It never changes the total, the saving or the delivery above, so
   * none of those know about it. `worth` is its ordinary shop price.
   */
  bonus?: { title: string; worth: number | null; firstBoxOnly: boolean } | null
  /** Why there is no bonus line: a code worth more took its place. */
  bonusNote?: string | null
}

/** Months, said the way a person would say them. */
function months(n: number): string {
  if (n < 1.25) return 'about a month'
  if (n < 1.75) return 'about six weeks'
  const whole = Math.round(n)
  const word = ['', '', 'two', 'three', 'four', 'five', 'six'][whole] ?? String(whole)
  return `about ${word} months`
}

/**
 * What the two columns actually mean, on a unit you can compare.
 *
 * ── Why this is here at all ────────────────────────────────────────────────
 * The chooser showed "£68.05" and "£57.63/mo" side by side and left the reader
 * to subtract them, which says subscribing costs more. It is cheaper — at every
 * rung, enforced in `lib/pricing/ladder.ts` — but the one-off column had no
 * duration on it, so the two numbers were never comparable and the reader's
 * arithmetic was the only one on offer.
 *
 * ── Why it is a table and not a sentence ───────────────────────────────────
 * It was three sentences first, and they tied themselves in knots: the case
 * where month one sends MORE product produced "sends more today, not less for
 * £10.42 less", which is three comparisons in nine words and parses as none of
 * them. Prose has to carry the direction of every comparison in words; two
 * columns of numbers carry it by position, and the reader does the comparing
 * they were going to do anyway — correctly this time, because both rows are
 * finally the same unit.
 *
 * So the numbers do the work, and the words are left with the one job numbers
 * cannot do: saying what "just this once" actually buys, and when it runs out.
 */
function PlanCompare({ c }: { c: NonNullable<ReturnType<typeof planComparison>> }) {
  const rows = [
    { label: 'Today', once: c.oneOffToday, sub: c.subscriptionToday },
    { label: 'A month’s supply', once: c.oneOffPerMonth, sub: c.subscriptionPerMonth },
  ]

  return (
    <div
      className="-mt-2 mb-4 rounded-xl px-3.5 py-3"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3.5 gap-y-1.5 items-baseline">
        <span />
        <span className="text-[10px] font-bold tracking-wide uppercase text-right" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
          Just once
        </span>
        <span className="text-[10px] font-bold tracking-wide uppercase text-right" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
          Subscribed
        </span>

        {rows.map((r) => {
          // Only claim a saving when there is one. The ladder makes that the
          // normal case, and a "cheaper" label on an equal or higher number
          // would be the same lie in the other direction.
          const cheaper = r.once - r.sub > 0.5
          return (
            <Fragment key={r.label}>
              <span className="text-[11.5px]" style={{ color: 'var(--color-text-2)' }}>{r.label}</span>
              <span className="text-[13px] font-bold tabular-nums text-right" style={{ color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}>
                {formatGBP(r.once)}
              </span>
              <span
                className="text-[13px] font-black tabular-nums text-right"
                style={{ color: cheaper ? 'var(--color-accent)' : 'var(--color-text)', fontFamily: 'var(--font-display)' }}
              >
                {formatGBP(r.sub)}
              </span>
            </Fragment>
          )
        })}
      </div>

      <p className="text-[11px] leading-relaxed mt-2.5 pt-2.5" style={{ color: 'var(--color-muted)', borderTop: '1px solid var(--color-border)' }}>
        Just once is one pack of each — your {c.firstToRunOut} runs out in{' '}
        {months(c.runsOutMonths)}
        {c.longestLasting && c.lastsMonths > c.runsOutMonths + 0.5
          ? `, the ${c.longestLasting} in ${months(c.lastsMonths)}`
          : ''}
        . Subscribed, each one is topped up as it runs out
        {c.firstDeliveryIdentical ? '' : ', and today’s box has more in it'}.
      </p>
    </div>
  )
}

function PlanTab({ label, sub, active, disabled, onClick }: { label: string; sub: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-lg text-center transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: active ? 'var(--color-accent)' : 'transparent', color: active ? 'var(--color-bg)' : 'var(--color-text-2)' }}
    >
      <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-display)' }}>{label}</span>
      <span className="text-[11px] font-semibold opacity-80">{sub}</span>
    </button>
  )
}

function Row({ label, value, accent, strike }: { label: string; value: string; accent?: boolean; strike?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs min-w-0" style={{ color: accent ? 'var(--color-accent)' : 'var(--color-text-2)' }}>{label}</span>
      <span
        className="text-xs font-semibold tabular-nums flex-shrink-0"
        style={{ color: accent ? 'var(--color-accent)' : 'var(--color-text-2)', textDecoration: strike ? 'line-through' : 'none' }}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * The plan scene's high-level summary: a compact receipt of exactly what the
 * user is buying — line items, discounts, total — with the plan toggle and
 * checkout. The per-item delivery detail lives behind a separate "Delivery
 * details" disclosure, not here.
 */
export function PlanReceipt({
  slots, products, subscriptionPlan, pricing, planType, onPlanChange, onCheckout, onCustomise, isLoading = false, partnerCode = null, codeKind = null, starterStack = null, oneOffOnly = null, onCtaRef, bonus = null, bonusNote = null,
}: Props) {
  const config = getPricingConfig()
  const {
    oneOffTotal, oneOffSubtotal, subscriptionTotal, subscriptionItemCount, subscriptionFirstMonth, subscriptionItemsOneOffTotal,
    subscriptionIntroDiscountPct, subscriptionMinMonths, subscriptionMinTermTotal, subscriptionMinOrderMet,
    bundleDiscountPct, bundleTierLabel, subscriptionDiscountPct, bundleLevel, partnerDiscountPct,
  } = pricing

  /*
    A starter buys ONE BOX, never a plan.

    Enforced on the server (`starterWorksOn` admits the quiz channel only), and
    said here as well — offering a subscription tab that the checkout would then
    refuse is a worse experience than not offering it, and this is the screen
    where the choice is made.
  */
  const canSubscribe = subscriptionItemCount > 0 && subscriptionMinOrderMet && !starterStack && !oneOffOnly
  const isSub = planType === 'subscription' && canSubscribe
  const hasIntro = subscriptionIntroDiscountPct > 0 && subscriptionFirstMonth < subscriptionTotal
  const oneOffSaving = Math.round((oneOffSubtotal - oneOffTotal) * 100) / 100
  const hasOneOffSaving = oneOffSaving > 0.01

  /**
   * ONE discount line, not two. A code replaces whatever the basket had earned
   * rather than compounding with it, so the whole saving belongs to whichever of
   * the two actually applied — and `oneOffSaving` is derived from the real total
   * so the margin floor clipping a line cannot leave the receipt claiming money
   * that was never taken off.
   *
   * `>=` because the price uses the deeper of the two: a code set below the
   * bundle tier takes nothing extra off, and naming it as the reason for the
   * saving would credit it with money the tier gave.
   */
  const codeApplied = partnerDiscountPct > 0 && partnerDiscountPct >= bundleDiscountPct
  const codeLabel = partnerCode ?? 'Discount code'

  const activeTotal = isSub ? subscriptionTotal : oneOffTotal
  // Free delivery qualifies on the SUBTOTAL, before the bundle discount — so a
  // basket can't lose the perk by earning a discount. See qualifiesForFreeDelivery.
  const deliveryBasis = isSub ? subscriptionTotal : oneOffSubtotal
  const freeDelivery = qualifiesForFreeDelivery(deliveryBasis, config)
  const freeDeliveryRemaining = Math.max(0, Math.round((config.freeDeliveryThreshold - deliveryBasis) * 100) / 100)
  const deliveryCharge = customerDeliveryCharge(deliveryBasis, 'uk-1', config)

  const subTabLabel = canSubscribe
    ? `${formatGBP(subscriptionTotal)}/mo`
    : subscriptionItemCount > 0
      ? `Min ${formatGBP(config.minSubscriptionMonthly)}/mo`
      : 'Unavailable'

  /*
    The stack, resolved to the exact product and variant each slot holds.

    `products` is the WHOLE CATALOGUE — it is the lookup table the slots are
    resolved against, not the stack. Handing it to anything that treats it as
    "the things in this stack" puts all fifty-three products in the basket,
    which is exactly what the à la carte handoff did until this existed.

    Built once and used twice, so the receipt's own line items and the basket
    the handoff fills cannot disagree about what the stack is.
  */
  const stackLines = slots
    .map((slot) => {
      const product = products.find((p) => p.id === slot.selectedProductId)
      if (!product) return null
      // The variant the customer actually chose, then the first sellable one.
      const variant =
        product.variants.find((v) => v.id === slot.selectedVariantId) ??
        product.variants.find((v) => v.available) ??
        product.variants[0]
      if (!variant) return null
      return { slot, product, variant }
    })
    .filter((line): line is NonNullable<typeof line> => line !== null)

  // Line items reflect the active plan: monthly lines when subscribed, per-slot
  // products otherwise.
  const items: LineItem[] = isSub
    ? subscriptionPlan.map((line) => ({
        key: line.product.id,
        formats: line.product.formats,
        imageUrl: line.product.imageUrl,
        title: line.product.title,
        price: line.monthlyPrice,
        suffix: '/mo',
        // The clearest explanation on the site of why a monthly figure buys
        // more than a one-off basket, and it used to be two taps inside a modal.
        note: cadenceLine(line),
      }))
    : slots.map((slot) => {
        const line = stackLines.find((l) => l.slot.slotId === slot.slotId)
        const title = line?.product.title ?? slot.title
        // The product's type, never the slot title: a slot names a job
        // ("Immune Support"), and under a product that reads as a claim.
        const role = line ? productTypeLabel(line.product) : undefined
        return {
          key: slot.slotId,
          formats: line?.product.formats ?? [],
          imageUrl: line?.product.imageUrl ?? null,
          title,
          price: line?.variant.price ?? line?.product.basePrice ?? 0,
          // Only when it adds something: a "Creatine" label under "Creatine
          // Monohydrate" is the same word twice.
          role: role && !title.toLowerCase().includes(role.toLowerCase()) ? role : undefined,
        }
      })

  /*
   * The comparison, derived rather than written — see `planComparison`. Null
   * when there is nothing to subscribe to, in which case the chooser is a
   * single option and there is nothing to compare.
   */
  const comparison = canSubscribe
    ? planComparison(subscriptionPlan, {
        oneOffTotal,
        subscriptionTotal,
        subscriptionFirstMonth: hasIntro ? subscriptionFirstMonth : subscriptionTotal,
        oneOffDiscountRate: bundleDiscountPct / 100,
      })
    : null

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden">
      <div className="p-5">
        {/* Plan chooser */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl mb-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <PlanTab label="Just this once" sub={formatGBP(oneOffTotal)} active={!isSub} onClick={() => onPlanChange('oneoff')} />
          <PlanTab label="Keep me stocked" sub={subTabLabel} active={isSub} disabled={!canSubscribe} onClick={() => onPlanChange('subscription')} />
        </div>

        {comparison && <PlanCompare c={comparison} />}

        {!canSubscribe && (
          <div className="-mt-2 mb-4 rounded-xl px-3 py-2.5 text-[11px] leading-snug text-[var(--color-muted)]" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {oneOffOnly
              ? oneOffOnly
              : subscriptionItemCount === 0
              ? 'None of the products in this stack can be subscribed to monthly yet.'
              : `Monthly subscription unlocks at ${formatGBP(config.minSubscriptionMonthly)}/mo. Your monthly plan works out to ${formatGBP(subscriptionTotal)} — add a product to enable Subscribe & Save.`}
          </div>
        )}

        {/* Line items — what you're buying */}
        <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-2.5" style={{ fontFamily: 'var(--font-display)' }}>
          Your order · {items.length} {items.length === 1 ? 'item' : 'items'}
        </p>
        {/*
          Two lines for a name, not one cut short. "Endurance Breathe Isotonic
          Energy …" and "Collagen Hydrolysed Type I & III, Unfl…" were the two
          products somebody most needed to recognise, and the ellipsis took the
          part that said what they were. The product type underneath says what
          each one is, which is the question a list of brand names leaves open.
        */}
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.key} className="flex items-start gap-3">
              <ProductTile
                imageUrl={it.imageUrl}
                formats={it.formats}
                title={it.title}
                size={40}
                style={{ borderRadius: 10, flexShrink: 0 }}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium leading-snug line-clamp-2" style={{ color: 'var(--color-text)' }}>
                  {it.title}
                </span>
                {(it.note ?? it.role) && (
                  <span className="block text-[11px] leading-snug mt-0.5" style={{ color: 'var(--color-text-2)' }}>
                    {it.note ?? it.role}
                  </span>
                )}
              </span>
              <span className="text-[13px] font-bold tabular-nums flex-shrink-0 leading-snug" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                {formatGBP(it.price)}{it.suffix ?? ''}
              </span>
            </div>
          ))}
          {bonus && (
            <div className="flex items-start gap-3" data-receipt-bonus>
              <span
                aria-hidden
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: 40, height: 40, borderRadius: 10, color: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
              >
                <Icon name="sparkle" size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium leading-snug line-clamp-2" style={{ color: 'var(--color-text)' }}>
                  {OFFER_COPY.receiptFree(bonus.title)}
                </span>
                <span className="block text-[11px] leading-snug mt-0.5" style={{ color: 'var(--color-text-2)' }}>
                  {[
                    bonus.worth != null ? OFFER_COPY.worth(bonus.worth) : null,
                    bonus.firstBoxOnly ? OFFER_COPY.bonusOnSubscription : null,
                  ].filter(Boolean).join(' · ')}
                  {bonus.worth != null || bonus.firstBoxOnly ? ' · ' : ''}
                  <Link href={FREE_GIFT_TERMS_PATH} className="underline underline-offset-2">{OFFER_COPY.terms}</Link>
                </span>
              </span>
              <span className="text-[13px] font-bold tabular-nums flex-shrink-0 leading-snug" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                {formatGBP(0)}
              </span>
            </div>
          )}
          {bonusNote && (
            <p className="text-[11px] leading-snug" style={{ color: 'var(--color-text-2)' }}>{bonusNote}</p>
          )}
        </div>

        {/* Discounts + total */}
        <div className="mt-3.5 pt-3.5 space-y-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          {isSub ? (
            <>
              {/* The depth picker's own name for the level (`TIER_META`), so the
                  two cannot drift apart — this line once said "Performance"
                  for the depth the picker calls "Balanced". */}
              {subscriptionDiscountPct > 0 && (
                <Row label={`${TIER_META[bundleLevel].label} bundle · Subscribe & Save`} value={`up to ${subscriptionDiscountPct}% off`} accent />
              )}
              {hasIntro && (
                <Row
                  label={
                    codeApplied
                      ? `First month with ${codeLabel} · ${partnerDiscountPct}% off`
                      : `First month (${subscriptionIntroDiscountPct}% off)`
                  }
                  value={formatGBP(subscriptionFirstMonth)}
                  accent
                />
              )}
              {/* A code's rate is off the REGULAR price and replaces Subscribe &
                  Save for the first month. Quoting it against the already
                  discounted monthly would print "25% off" next to a 6% saving —
                  the same number said two ways, neither of which adds up. */}
              {hasIntro && (
                <p className="text-[11px] leading-relaxed text-emerald-400">
                  {codeApplied ? (
                    <>
                      {partnerDiscountPct}% off the regular {formatGBP(subscriptionItemsOneOffTotal)} — you save{' '}
                      {formatGBP(Math.round((subscriptionItemsOneOffTotal - subscriptionFirstMonth) * 100) / 100)} on your
                      first month, instead of the usual {subscriptionDiscountPct}%. Every month after is{' '}
                      {formatGBP(subscriptionTotal)}.
                    </>
                  ) : (
                    <>
                      You save {formatGBP(Math.round((subscriptionTotal - subscriptionFirstMonth) * 100) / 100)} on your
                      first month. Every month after is {formatGBP(subscriptionTotal)}.
                    </>
                  )}
                </p>
              )}
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>Monthly total</span>
                <span className="text-lg font-black" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
                  {formatGBP(subscriptionTotal)}<span className="text-xs font-semibold">/mo</span>
                </span>
              </div>
              {/* The terms have no minimum term and the code never blocks a
                  cancel, so a product's "minimum months" is never stated here. */}
              <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
                No minimum term. If you cancel early, you settle any unpaid balance on what’s already been sent — never more than you’ve paid us, and nothing if it’s £5 or less.
              </p>
            </>
          ) : (
            <>
              {/* The sum of the items, then what comes off it. A subtotal rather
                  than a struck-through "regular price": it is the receipt's own
                  arithmetic, and the line under it says where the saving came
                  from. Only when there is a saving to subtract from it. */}
              {hasOneOffSaving && (
                <Row label={`Subtotal · ${items.length} ${items.length === 1 ? 'item' : 'items'}`} value={formatGBP(oneOffSubtotal)} />
              )}
              {/* The discount is named and carries the whole saving. A total
                  that saves £21 while the receipt only accounts for £6 of it
                  reads as a mistake in the customer's favour — the last thing
                  you want someone thinking at the moment they pay. */}
              {codeApplied ? (
                <>
                  <Row label={`${codeLabel} · ${partnerDiscountPct}% off`} value={`−${formatGBP(oneOffSaving)}`} accent />
                  {bundleDiscountPct > 0 && bundleTierLabel && (
                    <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
                      Your code replaces the {bundleTierLabel} deal ({bundleDiscountPct}% off) — it&rsquo;s the better of the two.
                    </p>
                  )}
                </>
              ) : (
                bundleDiscountPct > 0 && bundleTierLabel && (
                  <Row label={`Bundle deal · ${bundleTierLabel} · ${bundleDiscountPct}% off`} value={`−${formatGBP(oneOffSaving)}`} accent />
                )
              )}
              {/* The starter's own line, carrying the WHOLE remaining total.
                  A receipt that shows £126 of products, no discount line, and
                  £0.00 at the bottom reads as a fault — and the one thing a
                  partner must not be uncertain about is whether they are about
                  to be charged. */}
              {starterStack && (
                <Row label={starterStack.label} value={`−${formatGBP(oneOffTotal)}`} accent />
              )}
              {/* Delivery as a line of the receipt when it is free — it adds
                  nothing to the total, so the arithmetic above still holds, and
                  it is good news worth reading where the money is. When it is
                  not free it is charged at the payment screen, so it stays the
                  note under the card rather than a row that would leave the
                  total short of what is taken. */}
              {freeDelivery && config.freeDeliveryThreshold > 0 && !starterStack && (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-2)' }}>
                    Delivery
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                    <Icon name="truck" size={14} />
                    Free
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 pt-2.5 mt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                    {starterStack ? 'To pay' : 'Total'}
                  </span>
                  {/* The saving, once — beside the number it was taken off,
                      rather than a second row repeating the discount line.
                      Not on a free order: "save £6.56" under £0.00 undersells
                      it by everything else the code took off. */}
                  {hasOneOffSaving && !starterStack && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums whitespace-nowrap"
                      style={{
                        color: 'var(--tone-positive)',
                        background: 'color-mix(in srgb, var(--tone-positive) 12%, transparent)',
                      }}
                    >
                      You save {formatGBP(oneOffSaving)}
                    </span>
                  )}
                </span>
                <span className="text-xl font-black tabular-nums" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                  {formatGBP(starterStack ? 0 : oneOffTotal)}
                </span>
              </div>
              {starterStack && (
                <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
                  Delivery is on us too. Nothing is taken from a card — there is nothing to take.
                </p>
              )}
              {/* A nudge, not a second call to action: one row, the two numbers
                  that matter, and a chevron. It was a tinted block whose
                  sentence wrapped onto two centred lines between the total and
                  the buy button — the same weight as both. */}
              {canSubscribe && subscriptionDiscountPct > 0 && (
                <button
                  onClick={() => onPlanChange('subscription')}
                  className="w-full mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
                  style={{ border: '1px solid var(--color-border-2)', background: 'var(--color-surface)' }}
                >
                  <span
                    className="flex items-center justify-center rounded-lg flex-shrink-0"
                    style={{ width: 30, height: 30, color: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
                  >
                    <Icon name="refresh" size={16} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                      Subscribe &amp; save up to {subscriptionDiscountPct}%
                    </span>
                    <span className="block text-[11px] mt-0.5" style={{ color: 'var(--color-text-2)' }}>
                      {formatGBP(subscriptionTotal)}/mo · no minimum term
                    </span>
                  </span>
                  <Icon name="chevron-right" size={16} className="flex-shrink-0 text-[var(--color-muted)]" />
                </button>
              )}
            </>
          )}
        </div>

        {/*
          Free delivery — a line, not a box.

          It was a bordered panel on its own surface, sitting between the total
          and the buy button: the highest-traffic two inches of the page, spent
          on a postage note. Boxing it made it the same weight as the total
          above it and the button below, so the eye had to sort three equal
          things to find the one that mattered.

          A centred line does the same job and lets the total be the largest
          thing in the card. The free-delivery case keeps its accent, because
          that one is good news and worth seeing; the shortfall stays muted.
        */}
        {/* Not on a free order either, where delivery is already on us and a
            "+£2.95 delivery" line would contradict the line above it. */}
        {/* One-off and free, it is a row of the receipt above. Subscribed and
            free, it is still said here, under the monthly total. */}
        {config.freeDeliveryThreshold > 0 && !starterStack && (isSub || !freeDelivery) && (
          <div
            className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold"
            style={
              freeDelivery
                ? { color: 'var(--color-accent)' }
                : { color: 'var(--color-muted)' }
            }
          >
            {freeDelivery ? (
              <>
                <Icon name="truck" size={14} />
                Free delivery included
              </>
            ) : (
              // Names the charge as well as the gap. Saying only how far off free
              // delivery is, while the basket adds nothing for postage, made the
              // Stripe page the first place a delivery line appeared.
              `+${formatGBP(deliveryCharge)} delivery · spend ${formatGBP(freeDeliveryRemaining)} more for free`
            )}
          </div>
        )}

        {/* CTAs */}
        <div className="space-y-2 mt-4">
          {/* `data-checkout-cta` is how the page knows this button is on screen,
              so the sticky bar can get out of its way — the bar used to sit
              directly on top of it. See `ctaOnScreen` in StackReviewPage. */}
          <button
            ref={onCtaRef}
            data-checkout-cta
            onClick={onCheckout}
            disabled={isLoading}
            className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all disabled:opacity-60 disabled:cursor-wait"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {isLoading
              ? 'Building your cart…'
              : starterStack
                // There is no checkout to continue to and no card to enter, so
                // the button says what pressing it does. "Continue to checkout"
                // in front of a £0.00 total is the sentence that makes somebody
                // go looking for the catch.
                ? 'Place my free order →'
                : isSub
                  ? 'Start subscription →'
                  : 'Continue to checkout →'}
          </button>
          {/* Secondary, and drawn as one: it was muted text in a hairline, which
              read as a disabled button rather than a second way forward. */}
          <button
            onClick={onCustomise}
            className="w-full py-3 rounded-2xl text-sm font-semibold inline-flex items-center justify-center gap-2 active:scale-95 transition-all"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--color-text-2)',
              border: '1px solid var(--color-border-2)',
              background: 'var(--color-surface)',
            }}
          >
            <Icon name="swap" size={16} />
            Swap products
          </button>

          {/*
            The last resort, deliberately quiet. See `ShopAlaCarte` — the stack
            is the product, and this exists for the minority who want two of
            the five and would otherwise leave with nothing.
          */}
          <ShopAlaCarte
            lines={stackLines.map((l) => ({ productId: l.product.id, variantId: l.variant.id, price: l.variant.price }))}
            partnerDiscountPct={pricing.partnerDiscountPct}
            code={partnerCode}
            codeKind={codeKind}
          />
        </div>
      </div>
    </div>
  )
}
