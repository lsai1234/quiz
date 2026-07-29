'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { SubscriptionCheckout } from '@/lib/stack-blueprint/checkout'
import type { ChangePolicy } from '@/lib/recharge/types'

const ACCENT = '#00D4FF'

/**
 * Confirms the unavailability choice the member already made in the subscription
 * journey — it is not asked for here.
 *
 * It used to be: this screen carried per-line toggles, which meant the decision
 * was taken after payment, by someone halfway out the door. Making it part of
 * the plan they're buying is both better consent and better data, so all this
 * has to do now is tell them what's on file and where to change it.
 */
function ChangePolicySummary({ policy }: { policy: ChangePolicy }) {
  return (
    <div className="border-t border-[var(--color-border)] pt-3 mt-3">
      <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
        If something&apos;s out of stock
      </p>
      <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
        {policy === 'remove'
          ? 'We’ll take it off your plan and lower your monthly from the next payment — no action needed from you.'
          : 'We’ll swap in the closest match at the same or lower price, so your monthly doesn’t change.'}{' '}
        Either way we’ll email you, and you can change this any time in your hub.
      </p>
    </div>
  )
}

interface Props {
  plan: 'oneoff' | 'subscription'
  mock: boolean
  subscription?: SubscriptionCheckout
  /** What the member chose in the journey, echoed back for confirmation. */
  changePolicy?: ChangePolicy
  onBack?: () => void
}

function deliveryLabel(months: number): string {
  if (months <= 1) return 'every month'
  return `every ${months} months`
}

export function CheckoutSuccess({ plan, mock, subscription, changePolicy = 'auto-swap', onBack }: Props) {
  const isSub = plan === 'subscription' && subscription

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 py-12 text-center max-w-lg mx-auto">
      <div className="text-5xl mb-5">🎉</div>
      <h2 className="text-3xl font-black mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        {isSub ? "You're subscribed." : 'Your stack is on its way.'}
      </h2>
      <p className="text-sm text-[var(--color-muted)] leading-relaxed max-w-sm">
        {isSub
          ? 'Your first box ships now. After that, each item arrives on its own schedule — all on one flat monthly payment.'
          : 'Check your inbox for your order confirmation.'}
      </p>

      {isSub && subscription && (
        <div className="w-full mt-7 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 text-left">
          {/* Money */}
          <div className="space-y-1.5 mb-4">
            {subscription.introDiscountPct > 0 && subscription.firstMonth < subscription.flatMonthly && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text-2)]">First month ({subscription.introDiscountPct}% off)</span>
                <span className="text-base font-black" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
                  {formatGBP(subscription.firstMonth)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-2)]">Then per month</span>
              <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{formatGBP(subscription.flatMonthly)}/mo</span>
            </div>
            {subscription.minMonths > 1 && (
              <p className="text-[11px] text-[var(--color-muted)] pt-1">
                {subscription.minMonths}-month minimum ({formatGBP(subscription.minTermTotal)} total), then cancel anytime.
              </p>
            )}
          </div>

          {/* Schedule */}
          <div className="border-t border-[var(--color-border)] pt-3">
            <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
              Delivery schedule
            </p>
            <div className="space-y-1.5">
              {subscription.lines.map((line) => (
                <div key={line.productId} className="flex items-center justify-between gap-3">
                  <span className="text-xs truncate" style={{ color: 'var(--color-text-2)' }}>
                    {line.quantity > 1 ? `${line.quantity}× ` : ''}{line.productTitle}
                  </span>
                  <span className="text-[11px] text-[var(--color-muted)] flex-shrink-0">{deliveryLabel(line.deliveryIntervalMonths)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* What we'll do if something's unavailable — chosen in the journey. */}
          <ChangePolicySummary policy={changePolicy} />
        </div>
      )}

      {mock && (
        <div className="mt-6 px-4 py-3 rounded-xl text-xs leading-relaxed max-w-sm"
          style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <strong>Demo mode.</strong> No payment was taken. Connect Shopify + Recharge and set{' '}
          <code>NEXT_PUBLIC_DATA_SOURCE=shopify</code> to take real {isSub ? 'subscriptions' : 'orders'}.
        </div>
      )}

      {onBack && (
        <button
          onClick={onBack}
          className="mt-7 py-3 px-6 rounded-2xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-muted)] active:scale-95 transition-all"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Back to your stack
        </button>
      )}
    </div>
  )
}
