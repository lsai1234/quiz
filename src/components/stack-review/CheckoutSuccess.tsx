'use client'

import { useMemo, useRef } from 'react'
import type { SubscriptionCheckout } from '@/lib/stack-blueprint/checkout'
import type { ChangePolicy } from '@/lib/recharge/types'
import type { ReceiptItem } from '@/lib/receipt/types'
import { demoReference, receiptFromStackCheckout } from '@/lib/receipt/build'
import { ReceiptPrinter } from '@/components/receipt/ReceiptPrinter'
import { Button } from '@/components/ui/Button'
import { Note } from '@/components/ui/Note'

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

      {/*
        No demo banner here. The receipt is stamped `DEMO — NOT CHARGED`, which
        is the honest marker and is enough — this said the same thing a third
        time, in a box under the paper, and the half of it that was not
        redundant was configuration advice about our own Stripe keys shown at
        the end of somebody else's checkout.
      */}

      {onBack && (
        <Button variant="secondary" icon="arrow-left" fullWidth={false} onClick={onBack} className="mt-7">
          Back to your stack
        </Button>
      )}
    </div>
  )
}
