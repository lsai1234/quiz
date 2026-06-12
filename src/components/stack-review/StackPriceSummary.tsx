'use client'

import type { StackPricing } from '@/lib/stack-blueprint/pricing'
import { formatGBP, PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'

interface Props {
  pricing: StackPricing
  onCheckout?: () => void
  onCustomise?: () => void
}

export function StackPriceSummary({ pricing, onCheckout, onCustomise }: Props) {
  const {
    oneOffTotal,
    rrpTotal,
    bundleSaving,
    bundleSavingPct,
    subscriptionTotal,
    subscriptionSaving,
    subscriptionSavingPct,
  } = pricing

  const hasRrpSaving = bundleSaving > 0.01

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden">
      <div className="p-5">
        {/* Price breakdown */}
        <div className="space-y-2.5 mb-4">
          {/* RRP line — only shown when compareAtPrice data is present */}
          {hasRrpSaving && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-muted)]">Individual RRP</span>
              <span className="text-xs text-[var(--color-muted)] line-through">{formatGBP(rrpTotal)}</span>
            </div>
          )}

          {/* One-off total */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-2)]">One-off total</span>
            <span className="text-sm font-bold text-[var(--color-text)]">{formatGBP(oneOffTotal)}</span>
          </div>

          {/* Bundle saving */}
          {hasRrpSaving && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-400">Bundle saving</span>
              <span className="text-xs font-semibold text-emerald-400">
                −{formatGBP(bundleSaving)} ({bundleSavingPct}% off)
              </span>
            </div>
          )}

          <div className="h-px bg-[var(--color-border)]" />

          {/* Subscription monthly */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-2)]">Subscribe monthly</span>
            <span
              className="text-sm font-black"
              style={{ color: 'var(--color-accent)' }}
            >
              {formatGBP(subscriptionTotal)}/mo
            </span>
          </div>

          {/* Subscription saving */}
          {subscriptionSaving > 0.01 && (
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--color-accent)' }}>
                Subscription saving
              </span>
              <span className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                −{formatGBP(subscriptionSaving)}/mo ({subscriptionSavingPct}% off)
              </span>
            </div>
          )}
        </div>

        {/* Subscription plan callout */}
        <div
          className="px-3 py-2.5 rounded-xl text-xs font-semibold mb-5 text-center leading-snug"
          style={{
            color: 'var(--color-accent)',
            background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
          }}
        >
          Save {subscriptionSavingPct}% with the {PRICING_CONFIG.subscriptionPlanLabel}
        </div>

        {/* CTAs */}
        <div className="space-y-2">
          <button
            onClick={onCheckout}
            className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Continue to Checkout →
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
