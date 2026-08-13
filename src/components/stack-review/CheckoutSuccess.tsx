'use client'

import { useMemo, useRef } from 'react'
import type { SubscriptionCheckout } from '@/lib/stack-blueprint/checkout'
import type { ChangePolicy } from '@/lib/recharge/types'
import type { ReceiptItem } from '@/lib/receipt/types'
import { demoReference, receiptFromStackCheckout } from '@/lib/receipt/build'
import { ReceiptPrinter } from '@/components/receipt/ReceiptPrinter'

const ACCENT = '#00D4FF'

interface Props {
  plan: 'oneoff' | 'subscription'
  mock: boolean
  subscription?: SubscriptionCheckout
  /** What the member chose in the journey, echoed back for confirmation. */
  changePolicy?: ChangePolicy
  /**
   * A one-off stack's lines and money, so the printed receipt itemises what was
   * bought rather than printing a total with nothing above it. Subscriptions
   * carry their own lines on `subscription`.
   */
  oneOff?: { items: ReceiptItem[]; subtotal: number; total: number }
  onBack?: () => void
}

/**
 * The end of the in-page checkout: the receipt prints itself.
 *
 * Everything this screen used to say in cards — the money, the delivery
 * schedule, what happens if something is out of stock — is printed on the
 * paper, by the same builder the confirmation screen uses, so a member sees one
 * artefact whichever journey they bought through.
 *
 * The stamp is the honest part. This path is only ever reached by the mock
 * payment route today, and the receipt says `DEMO — NOT CHARGED` rather than
 * approving a payment nobody took.
 */
export function CheckoutSuccess({ plan, mock, subscription, changePolicy = 'auto-swap', oneOff, onBack }: Props) {
  const isSub = plan === 'subscription' && !!subscription

  // Held in refs, not derived on each render: the parent rebuilds `oneOff`
  // inline, and a receipt that renumbers and re-times itself whenever its
  // parent re-renders is not a receipt.
  const printedAt = useRef(new Date())
  const reference = useRef(demoReference(printedAt.current))

  const receipt = useMemo(
    () => receiptFromStackCheckout({
      plan,
      subscription,
      changePolicy,
      oneOff,
      mock,
      now: printedAt.current,
      reference: reference.current,
    }),
    [plan, subscription, changePolicy, oneOff, mock],
  )

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-5 py-12 text-center max-w-lg mx-auto">
      <h2 className="text-3xl font-black mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        {isSub ? "You're subscribed." : 'Your stack is on its way.'}
      </h2>
      <p className="text-sm text-[var(--color-muted)] leading-relaxed max-w-sm">
        {isSub
          ? 'Your first box ships now. After that, each item arrives on its own schedule — all on one flat monthly payment.'
          : 'Check your inbox for your order confirmation.'}
      </p>

      <ReceiptPrinter receipt={receipt} className="w-full mt-7" />

      {mock && (
        <div className="mt-6 px-4 py-3 rounded-xl text-xs leading-relaxed max-w-sm"
          style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <strong>Demo mode.</strong> No payment was taken. Add your Stripe keys and switch Payments to
          live in the Founders Hub to take real {isSub ? 'subscriptions' : 'orders'}.
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
