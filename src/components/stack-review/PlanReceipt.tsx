'use client'

import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { StackPricing, SubscriptionLine } from '@/lib/stack-blueprint/pricing'
import { formatGBP, getPricingConfig, qualifiesForFreeDelivery } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { PlanType } from '@/lib/store'
import type { StackLevel } from '@/lib/types'
import { ProductTile } from './ProductTile'

const LEVEL_LABEL: Record<StackLevel, string> = { essentials: 'Essentials', performance: 'Performance', complete: 'Complete' }

interface LineItem {
  key: string
  slotType: string
  imageUrl: string | null
  title: string
  price: number
  suffix?: string
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
  slots, products, subscriptionPlan, slotTitleById, pricing, planType, onPlanChange, onCheckout, onCustomise, isLoading = false,
}: Props) {
  const config = getPricingConfig()
  const {
    oneOffTotal, oneOffSubtotal, subscriptionTotal, subscriptionItemCount, subscriptionFirstMonth,
    subscriptionIntroDiscountPct, subscriptionMinMonths, subscriptionMinTermTotal, subscriptionMinOrderMet,
    bundleDiscountPct, bundleTierLabel, subscriptionDiscountPct, bundleLevel,
  } = pricing

  const canSubscribe = subscriptionItemCount > 0 && subscriptionMinOrderMet
  const isSub = planType === 'subscription' && canSubscribe
  const hasIntro = subscriptionIntroDiscountPct > 0 && subscriptionFirstMonth < subscriptionTotal
  const oneOffSaving = Math.round((oneOffSubtotal - oneOffTotal) * 100) / 100
  const hasOneOffSaving = oneOffSaving > 0.01

  const activeTotal = isSub ? subscriptionTotal : oneOffTotal
  // Free delivery qualifies on the SUBTOTAL, before the bundle discount — so a
  // basket can't lose the perk by earning a discount. See qualifiesForFreeDelivery.
  const deliveryBasis = isSub ? subscriptionTotal : oneOffSubtotal
  const freeDelivery = qualifiesForFreeDelivery(deliveryBasis, config)
  const freeDeliveryRemaining = Math.max(0, Math.round((config.freeDeliveryThreshold - deliveryBasis) * 100) / 100)

  const subTabLabel = canSubscribe
    ? `${formatGBP(subscriptionTotal)}/mo`
    : subscriptionItemCount > 0
      ? `Min ${formatGBP(config.minSubscriptionMonthly)}/mo`
      : 'Unavailable'

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
      }))
    : slots.map((slot) => {
        const product = products.find((p) => p.id === slot.selectedProductId)
        const variant = product?.variants.find((v) => v.id === slot.selectedVariantId)
          ?? product?.variants.find((v) => v.available)
          ?? product?.variants[0]
        return {
          key: slot.slotId,
          slotType: slot.slotType,
          imageUrl: product?.imageUrl ?? null,
          title: product?.title ?? slot.title,
          price: variant?.price ?? product?.basePrice ?? 0,
        }
      })

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden">
      <div className="p-5">
        {/* Plan chooser */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl mb-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <PlanTab label="One-off bundle" sub={formatGBP(oneOffTotal)} active={!isSub} onClick={() => onPlanChange('oneoff')} />
          <PlanTab label="Subscribe monthly" sub={subTabLabel} active={isSub} disabled={!canSubscribe} onClick={() => onPlanChange('subscription')} />
        </div>

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
            <div key={it.key} className="flex items-center gap-2.5">
              <ProductTile imageUrl={it.imageUrl} slot={it.slotType} title={it.title} size={30} />
              <span className="flex-1 min-w-0 text-xs font-medium truncate" style={{ color: 'var(--color-text)' }}>
                {it.title}
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
                <Row label={`First month (${subscriptionIntroDiscountPct}% off)`} value={formatGBP(subscriptionFirstMonth)} accent />
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
              {bundleDiscountPct > 0 && bundleTierLabel && (
                <Row label={`Bundle deal · ${bundleTierLabel}`} value={`${bundleDiscountPct}% off`} accent />
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

        {/* Free delivery */}
        {config.freeDeliveryThreshold > 0 && (
          <div
            className="mt-3 mb-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold"
            style={
              freeDelivery
                ? { color: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)' }
                : { color: 'var(--color-muted)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }
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
              `Spend ${formatGBP(freeDeliveryRemaining)} more for free delivery`
            )}
          </div>
        )}

        {/* CTAs */}
        <div className="space-y-2 mt-3">
          <button
            onClick={onCheckout}
            disabled={isLoading}
            className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all disabled:opacity-60 disabled:cursor-wait"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {isLoading ? 'Building your cart…' : isSub ? 'Start Subscription →' : 'Continue to Checkout →'}
          </button>
          <button
            onClick={onCustomise}
            className="w-full py-3 rounded-2xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-muted)] active:scale-95 transition-all"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Customise Stack
          </button>
        </div>
      </div>
    </div>
  )
}
