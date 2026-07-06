'use client'

import type { StackPricing } from '@/lib/stack-blueprint/pricing'
import { formatGBP, getPricingConfig, qualifiesForFreeDelivery } from '@/lib/stack-blueprint/pricing'
import type { PlanType } from '@/lib/store'
import type { StackLevel } from '@/lib/types'

const LEVEL_LABEL: Record<StackLevel, string> = { essentials: 'Essentials', performance: 'Performance', complete: 'Complete' }

interface Props {
  pricing: StackPricing
  planType: PlanType
  onPlanChange: (plan: PlanType) => void
  onCheckout?: () => void
  onCustomise?: () => void
  /** Label for the secondary (scroll-back) button. */
  customiseLabel?: string
  isLoading?: boolean
}

function PlanTab({
  label, sub, active, disabled, onClick,
}: { label: string; sub: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-lg text-center transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: active ? 'var(--color-accent)' : 'transparent',
        color: active ? 'var(--color-bg)' : 'var(--color-text-2)',
      }}
    >
      <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-display)' }}>{label}</span>
      <span className="text-[11px] font-semibold opacity-80">{sub}</span>
    </button>
  )
}

export function StackPriceSummary({ pricing, planType, onPlanChange, onCheckout, onCustomise, customiseLabel = 'Customise Stack', isLoading = false }: Props) {
  const {
    oneOffTotal,
    oneOffSubtotal,
    subscriptionTotal,
    subscriptionItemCount,
    subscriptionFirstMonth,
    subscriptionIntroDiscountPct,
    subscriptionMinMonths,
    subscriptionMinTermTotal,
    subscriptionMinOrderMet,
    bundleDiscountPct,
    bundleTierLabel,
    subscriptionDiscountPct,
    bundleLevel,
  } = pricing

  const hasIntro = subscriptionIntroDiscountPct > 0 && subscriptionFirstMonth < subscriptionTotal
  const canSubscribe = subscriptionItemCount > 0 && subscriptionMinOrderMet

  // Saving is measured against the sum of the products' own prices (never RRP),
  // so it always reconciles with the bundle discount shown.
  const oneOffSaving = Math.round((oneOffSubtotal - oneOffTotal) * 100) / 100
  const hasOneOffSaving = oneOffSaving > 0.01
  const isSub = planType === 'subscription' && canSubscribe
  const config = getPricingConfig()
  const subTabLabel = canSubscribe
    ? `${formatGBP(subscriptionTotal)}/mo`
    : subscriptionItemCount > 0
      ? `Min ${formatGBP(config.minSubscriptionMonthly)}/mo`
      : 'Unavailable'

  // Free delivery is judged against whatever plan is active, and recomputes as
  // add-ons change the totals (so it applies/unapplies retrospectively).
  const activeTotal = isSub ? subscriptionTotal : oneOffTotal
  const freeDelivery = qualifiesForFreeDelivery(activeTotal, config)
  const freeDeliveryRemaining = Math.max(0, Math.round((config.freeDeliveryThreshold - activeTotal) * 100) / 100)

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden">
      <div className="p-5">
        {/* Plan chooser */}
        <div
          className="grid grid-cols-2 gap-1 p-1 rounded-xl mb-4"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <PlanTab
            label="One-off bundle"
            sub={formatGBP(oneOffTotal)}
            active={!isSub}
            onClick={() => onPlanChange('oneoff')}
          />
          <PlanTab
            label="Subscribe monthly"
            sub={subTabLabel}
            active={isSub}
            disabled={!canSubscribe}
            onClick={() => onPlanChange('subscription')}
          />
        </div>

        {/* Why subscribe is unavailable — so the disabled tab isn't a mystery.
            Recomputes as add-ons change the monthly total. */}
        {!canSubscribe && (
          <div
            className="-mt-2 mb-4 rounded-xl px-3 py-2.5 text-[11px] leading-snug text-[var(--color-muted)]"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            {subscriptionItemCount === 0
              ? 'None of the products in this stack can be subscribed to monthly yet.'
              : `Monthly subscription unlocks at ${formatGBP(config.minSubscriptionMonthly)}/mo. Your monthly plan works out to ${formatGBP(subscriptionTotal)} — add a product to enable Subscribe & Save.`}
          </div>
        )}

        {/* Active plan breakdown */}
        {isSub ? (
          <div className="space-y-2.5 mb-4">
            {hasIntro ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text-2)]">
                    First month <span className="text-[var(--color-muted)]">({subscriptionIntroDiscountPct}% off)</span>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-xs text-[var(--color-muted)] line-through">{formatGBP(subscriptionTotal)}</span>
                    <span className="text-base font-black" style={{ color: 'var(--color-accent)' }}>
                      {formatGBP(subscriptionFirstMonth)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text-2)]">Then per month</span>
                  <span className="text-sm font-bold text-[var(--color-text)]">{formatGBP(subscriptionTotal)}/mo</span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text-2)]">
                  Flat monthly · {subscriptionItemCount} {subscriptionItemCount === 1 ? 'product' : 'products'}
                </span>
                <span className="text-base font-black" style={{ color: 'var(--color-accent)' }}>
                  {formatGBP(subscriptionTotal)}/mo
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--color-accent)' }}>{LEVEL_LABEL[bundleLevel]} bundle</span>
              <span className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                up to {subscriptionDiscountPct}% off every month
              </span>
            </div>

            <div
              className="px-3 py-2.5 rounded-xl text-xs font-semibold text-center leading-snug"
              style={{
                color: 'var(--color-accent)',
                background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
              }}
            >
              One flat payment a month — items arrive on their own schedule.
            </div>

            <p className="text-[11px] leading-relaxed text-[var(--color-muted)] text-center">
              {subscriptionMinMonths > 1
                ? `${subscriptionMinMonths}-month minimum (${formatGBP(subscriptionMinTermTotal)} total), then cancel anytime.`
                : 'Cancel or pause anytime.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 mb-4">
            <p className="text-[11px] leading-snug text-center" style={{ color: 'var(--color-muted)' }}>
              Pay once — the whole stack arrives as a single order. No subscription.
            </p>
            {hasOneOffSaving && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-muted)]">Regular price</span>
                <span className="text-xs text-[var(--color-muted)] line-through">{formatGBP(oneOffSubtotal)}</span>
              </div>
            )}

            {bundleDiscountPct > 0 && bundleTierLabel && (
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--color-accent)' }}>
                  Bundle deal · {bundleTierLabel}
                </span>
                <span className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                  {bundleDiscountPct}% off
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-2)]">One-off total</span>
              <span className="text-base font-black text-[var(--color-text)]">{formatGBP(oneOffTotal)}</span>
            </div>

            {hasOneOffSaving && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-400">You save</span>
                <span className="text-xs font-semibold text-emerald-400">
                  −{formatGBP(oneOffSaving)}
                </span>
              </div>
            )}

            {canSubscribe && subscriptionDiscountPct > 0 && (
              <button
                onClick={() => onPlanChange('subscription')}
                className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-center leading-snug active:scale-[0.98] transition-transform"
                style={{
                  color: 'var(--color-accent)',
                  background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                }}
              >
                Subscribe &amp; save up to {subscriptionDiscountPct}% — {LEVEL_LABEL[bundleLevel]} bundle →
              </button>
            )}
          </div>
        )}

        {/* Free delivery — applies/unapplies retrospectively with the total */}
        {config.freeDeliveryThreshold > 0 && (
          <div
            className="mb-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold"
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
        <div className="space-y-2">
          <button
            onClick={onCheckout}
            disabled={isLoading}
            className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all disabled:opacity-60 disabled:cursor-wait"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {isLoading
              ? 'Building your cart…'
              : isSub
                ? 'Start Subscription →'
                : 'Continue to Checkout →'}
          </button>
          <button
            onClick={onCustomise}
            className="w-full py-3 rounded-2xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-muted)] active:scale-95 transition-all"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {customiseLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
