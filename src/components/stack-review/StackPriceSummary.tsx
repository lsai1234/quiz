'use client'

import type { StackPricing } from '@/lib/stack-blueprint/pricing'
import { formatGBP, PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import type { PlanType } from '@/lib/store'

interface Props {
  pricing: StackPricing
  planType: PlanType
  onPlanChange: (plan: PlanType) => void
  onCheckout?: () => void
  onCustomise?: () => void
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

export function StackPriceSummary({ pricing, planType, onPlanChange, onCheckout, onCustomise, isLoading = false }: Props) {
  const {
    oneOffTotal,
    rrpTotal,
    bundleSaving,
    bundleSavingPct,
    subscriptionTotal,
    subscriptionSaving,
    subscriptionSavingPct,
    subscriptionItemCount,
    subscriptionFirstMonth,
    subscriptionIntroDiscountPct,
    subscriptionMinMonths,
    subscriptionMinTermTotal,
    subscriptionMinOrderMet,
    bundleDiscountPct,
    bundleTierLabel,
  } = pricing

  const hasIntro = subscriptionIntroDiscountPct > 0 && subscriptionFirstMonth < subscriptionTotal
  const canSubscribe = subscriptionItemCount > 0 && subscriptionMinOrderMet

  const hasRrpSaving = bundleSaving > 0.01
  const isSub = planType === 'subscription' && canSubscribe
  const subTabLabel = canSubscribe
    ? `${formatGBP(subscriptionTotal)}/mo`
    : subscriptionItemCount > 0
      ? `Min ${formatGBP(PRICING_CONFIG.minSubscriptionMonthly)}/mo`
      : 'Unavailable'

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

            {subscriptionSaving > 0.01 && (
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--color-accent)' }}>Vs buying one-off</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                  Save {subscriptionSavingPct}%/mo
                </span>
              </div>
            )}

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
            {hasRrpSaving && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-muted)]">Individual RRP</span>
                <span className="text-xs text-[var(--color-muted)] line-through">{formatGBP(rrpTotal)}</span>
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

            {hasRrpSaving && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-400">Total saving</span>
                <span className="text-xs font-semibold text-emerald-400">
                  −{formatGBP(bundleSaving)} ({bundleSavingPct}% off)
                </span>
              </div>
            )}

            {canSubscribe && subscriptionSavingPct > 0 && (
              <button
                onClick={() => onPlanChange('subscription')}
                className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-center leading-snug active:scale-[0.98] transition-transform"
                style={{
                  color: 'var(--color-accent)',
                  background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                }}
              >
                Subscribe &amp; save {subscriptionSavingPct}% a month →
              </button>
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
            Customise Stack
          </button>
        </div>
      </div>
    </div>
  )
}
