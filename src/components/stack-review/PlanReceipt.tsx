'use client'

import { Fragment } from 'react'

import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { StackPricing, SubscriptionLine } from '@/lib/stack-blueprint/pricing'
import { cadenceLine, formatGBP, getPricingConfig, planComparison, qualifiesForFreeDelivery } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { PlanType } from '@/lib/store'
import type { StackLevel } from '@/lib/types'
import { ProductTile } from './ProductTile'
import { ShopAlaCarte } from './ShopAlaCarte'
import { customerDeliveryCharge } from '@/lib/pricing/delivery'

const LEVEL_LABEL: Record<StackLevel, string> = { essentials: 'Essentials', performance: 'Performance', complete: 'Complete' }

interface LineItem {
  key: string
  slotType: string
  imageUrl: string | null
  title: string
  price: number
  suffix?: string
  /** How it is taken and how often it lands. Subscription lines only. */
  note?: string
}

interface Props {
  slots: StackSlotEntry[]
  products: CatalogueProduct[]
  subscriptionPlan: SubscriptionLine[]
  slotTitleById: Record<string, string>
  pricing: StackPricing
  planType: PlanType
  onPlanChange: (plan: PlanType) => void
  onCheckout?: () => void
  onCustomise?: () => void
  isLoading?: boolean
  /** The applied partner code, so its line can be named rather than anonymous. */
  partnerCode?: string | null
  /**
   * Handed the checkout button as it mounts, so the page can watch whether it
   * is on screen and retire the sticky bar that would otherwise sit on top of
   * it. A callback ref rather than a `querySelector`: the receipt does not
   * exist on the page's first commit, and a one-shot lookup found nothing and
   * never looked again.
   */
  onCtaRef?: (el: HTMLButtonElement | null) => void
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
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: accent ? 'var(--color-accent)' : 'var(--color-muted)' }}>{label}</span>
      <span
        className="text-xs font-semibold"
        style={{ color: accent ? 'var(--color-accent)' : 'var(--color-muted)', textDecoration: strike ? 'line-through' : 'none' }}
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
  slots, products, subscriptionPlan, slotTitleById, pricing, planType, onPlanChange, onCheckout, onCustomise, isLoading = false, partnerCode = null, onCtaRef,
}: Props) {
  const config = getPricingConfig()
  const {
    oneOffTotal, oneOffSubtotal, subscriptionTotal, subscriptionItemCount, subscriptionFirstMonth, subscriptionItemsOneOffTotal,
    subscriptionIntroDiscountPct, subscriptionMinMonths, subscriptionMinTermTotal, subscriptionMinOrderMet,
    bundleDiscountPct, bundleTierLabel, subscriptionDiscountPct, bundleLevel, partnerDiscountPct,
  } = pricing

  const canSubscribe = subscriptionItemCount > 0 && subscriptionMinOrderMet
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
        slotType: line.product.stackSlots[0] ?? '',
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
        return {
          key: slot.slotId,
          slotType: slot.slotType,
          imageUrl: line?.product.imageUrl ?? null,
          title: line?.product.title ?? slot.title,
          price: line?.variant.price ?? line?.product.basePrice ?? 0,
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
            {subscriptionItemCount === 0
              ? 'None of the products in this stack can be subscribed to monthly yet.'
              : `Monthly subscription unlocks at ${formatGBP(config.minSubscriptionMonthly)}/mo. Your monthly plan works out to ${formatGBP(subscriptionTotal)} — add a product to enable Subscribe & Save.`}
          </div>
        )}

        {/* Line items — what you're buying */}
        <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-2.5" style={{ fontFamily: 'var(--font-display)' }}>
          Your order · {items.length} {items.length === 1 ? 'item' : 'items'}
        </p>
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.key} className="flex items-start gap-2.5">
              <ProductTile imageUrl={it.imageUrl} slot={it.slotType} title={it.title} size={30} />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-medium truncate" style={{ color: 'var(--color-text)' }}>
                  {it.title}
                </span>
                {it.note && (
                  <span className="block text-[10.5px] leading-snug mt-0.5" style={{ color: 'var(--color-muted)' }}>
                    {it.note}
                  </span>
                )}
              </span>
              <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                {formatGBP(it.price)}{it.suffix ?? ''}
              </span>
            </div>
          ))}
        </div>

        {/* Discounts + total */}
        <div className="mt-3.5 pt-3.5 space-y-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          {isSub ? (
            <>
              {subscriptionDiscountPct > 0 && (
                <Row label={`${LEVEL_LABEL[bundleLevel]} bundle · Subscribe & Save`} value={`up to ${subscriptionDiscountPct}% off`} accent />
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
              <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
                {subscriptionMinMonths > 1
                  ? `${subscriptionMinMonths}-month minimum (${formatGBP(subscriptionMinTermTotal)} total), then cancel anytime.`
                  : 'Cancel or pause anytime.'}
              </p>
            </>
          ) : (
            <>
              {hasOneOffSaving && <Row label="Regular price" value={formatGBP(oneOffSubtotal)} strike />}
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
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>One-off total</span>
                <span className="text-lg font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                  {formatGBP(oneOffTotal)}
                </span>
              </div>
              {hasOneOffSaving && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-emerald-400">You save</span>
                  <span className="text-xs font-semibold text-emerald-400">−{formatGBP(oneOffSaving)}</span>
                </div>
              )}
              {canSubscribe && subscriptionDiscountPct > 0 && (
                <button
                  onClick={() => onPlanChange('subscription')}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl text-xs font-semibold text-center leading-snug active:scale-[0.98] transition-transform"
                  style={{ color: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)' }}
                >
                  Subscribe &amp; save up to {subscriptionDiscountPct}% — {LEVEL_LABEL[bundleLevel]} bundle →
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
        {config.freeDeliveryThreshold > 0 && (
          <div
            className="mt-2.5 mb-3.5 flex items-center justify-center gap-2 text-xs font-semibold"
            style={
              freeDelivery
                ? { color: 'var(--color-accent)' }
                : { color: 'var(--color-muted)' }
            }
          >
            {freeDelivery ? (
              <>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path d="M1.5 5.5h9v7h-9v-7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M10.5 8h4l3 3v1.5h-7V8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="5" cy="14.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="14.5" cy="14.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
                </svg>
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
        <div className="space-y-2 mt-3">
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
            {isLoading ? 'Building your cart…' : isSub ? 'Start subscription →' : 'Continue to checkout →'}
          </button>
          <button
            onClick={onCustomise}
            className="w-full py-3 rounded-2xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-muted)] active:scale-95 transition-all"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Swap products
          </button>

          {/*
            The last resort, deliberately quiet. See `ShopAlaCarte` — the stack
            is the product, and this exists for the minority who want two of
            the five and would otherwise leave with nothing.
          */}
          <ShopAlaCarte
            lines={stackLines.map((l) => ({ productId: l.product.id, variantId: l.variant.id }))}
            partnerDiscountPct={pricing.partnerDiscountPct}
          />
        </div>
      </div>
    </div>
  )
}
