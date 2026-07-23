'use client'

import { useState } from 'react'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { SubscriptionCheckout } from '@/lib/stack-blueprint/checkout'

const ACCENT = '#00D4FF'

/** Post-checkout out-of-stock consent: per-line "allow a same-category swap?".
 *  Defaults to allow; opting a line out persists via /api/hub/substitution. */
function SubstitutionConsent({ lines }: { lines: SubscriptionCheckout['lines'] }) {
  const [allow, setAllow] = useState<Record<string, boolean>>(() => Object.fromEntries(lines.map((l) => [l.productId, true])))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function toggle(productId: string) {
    const next = { ...allow, [productId]: !allow[productId] }
    setAllow(next)
    setSaving(true)
    setSaved(false)
    const res = await fetch('/api/hub/substitution', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ substitutions: next }),
    }).catch(() => null)
    setSaving(false)
    if (res && res.ok) setSaved(true)
  }

  return (
    <div className="border-t border-[var(--color-border)] pt-3 mt-3">
      <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>If something&apos;s out of stock</p>
      <p className="text-[11px] text-[var(--color-muted)] mb-2">We&apos;ll only swap in the closest same-type product for the items you allow. Toggle any off to have us hold &amp; contact you instead.</p>
      <div className="space-y-1.5">
        {lines.map((line) => (
          <div key={line.productId} className="flex items-center justify-between gap-3">
            <span className="text-xs truncate" style={{ color: 'var(--color-text-2)' }}>{line.productTitle}</span>
            <button
              role="switch"
              aria-checked={allow[line.productId]}
              onClick={() => toggle(line.productId)}
              className="relative w-10 h-5.5 rounded-full flex-shrink-0 transition-colors"
              style={{ width: 40, height: 22, background: allow[line.productId] ? ACCENT : 'var(--color-border)' }}
            >
              <span className="absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white transition-all" style={{ left: allow[line.productId] ? 20 : 2 }} />
            </button>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)] mt-2 h-3">{saving ? 'Saving…' : saved ? 'Saved — you can change these anytime in your hub.' : ''}</p>
    </div>
  )
}

interface Props {
  plan: 'oneoff' | 'subscription'
  mock: boolean
  subscription?: SubscriptionCheckout
  onBack?: () => void
}

function deliveryLabel(months: number): string {
  if (months <= 1) return 'every month'
  return `every ${months} months`
}

export function CheckoutSuccess({ plan, mock, subscription, onBack }: Props) {
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

          {/* Out-of-stock substitution consent (persists to the member's hub) */}
          <SubstitutionConsent lines={subscription.lines} />
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
