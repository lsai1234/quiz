'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useBasket } from '@/lib/basket/store'
import { markCameFromStack, whatIsLost } from '@/lib/shop/stack-handoff'
import { track } from '@/lib/analytics/events'

interface Props {
  /**
   * The stack, already resolved to one product and one variant per slot.
   *
   * Resolved by the caller rather than here, and deliberately not "the
   * products": the receipt is handed the WHOLE CATALOGUE as a lookup table,
   * and this component previously took that and added every one of them. A
   * shopper pressing the button got fifty-three items in their basket.
   *
   * Taking pre-resolved lines makes that mistake impossible to repeat — there
   * is nothing here to filter or guess at — and it carries the variant the
   * customer actually chose rather than the product's default.
   */
  lines: { productId: string; variantId: string }[]
  /** The partner rate being given up, as a whole percent. 0 when there is none. */
  partnerDiscountPct: number
}

/**
 * The door out of the stack, for somebody who wants the products separately.
 *
 * ── Why it is a text link and not a button ──────────────────────────────────
 * The stack is the product. Almost everybody who reaches this page should take
 * it, and a third button competing with "Start subscription" would cost
 * subscribers to serve a minority.
 *
 * But the minority is real: people who want two of the five, or who want to buy
 * one and think about the rest. Their only other door is "Swap products",
 * which still ends in a stack — so they leave. A quiet link is findable by
 * somebody actively looking for a way out and invisible to everybody else,
 * which is the correct weighting for a last resort.
 *
 * ── Why it confirms instead of just going ───────────────────────────────────
 * Because it costs them money and they cannot see that from the link. A code's
 * discount works on stacks and subscriptions, not on single products off the
 * shelf, so walking out of the stack means paying full price. Finding that out
 * at checkout, after the total has quietly gone up from the one on this page,
 * is the kind of surprise that loses a customer rather than an order.
 *
 * So the price of the door is stated on the door. The confirm step is one
 * sentence and two buttons, and "Never mind" is the one that looks like the
 * default, because it usually is.
 *
 * ── What it does not say ────────────────────────────────────────────────────
 * That the partner still earns their commission. True — see
 * `redeemPartnerCode`'s `attributionOnly`, which is the fix that made this flow
 * honest to offer — but it is our arrangement with the partner, not a term of
 * the customer's purchase, and a shopper deciding how to spend forty pounds
 * does not need our commission structure in the middle of it.
 */
export function ShopAlaCarte({ lines, partnerDiscountPct }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const add = useBasket((s) => s.add)

  if (lines.length === 0) return null

  const lost = whatIsLost(partnerDiscountPct / 100)

  /*
    A `Link`, not `router.push` and certainly not `location.assign`.

    The stack blueprint lives in memory and is deliberately not persisted, so a
    full page load would destroy the very thing the shop then offers to send
    them back to. A client-side navigation keeps it, and `Link` does that
    without needing a router in context — which also lets the receipt render in
    a test without one.
  */
  function go() {
    setBusy(true)
    for (const line of lines) add(line.productId, line.variantId, 1)
    markCameFromStack({ items: lines.length, discountPct: partnerDiscountPct / 100 })
    track('stack_shop_alacarte', { items: lines.length })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-3 text-[11.5px] underline underline-offset-4 transition-colors"
        style={{ color: 'var(--color-muted)', textDecorationColor: 'var(--color-border)' }}
      >
        Prefer to buy these separately?
      </button>
    )
  }

  return (
    <div
      className="mt-3 rounded-2xl p-4"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* One string rather than text either side of an expression: the count
          sat directly against the next word — "all 53in your shop basket". */}
      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text)' }}>
        {lines.length === 1
          ? 'We’ll put it in your shop basket so you can change the quantity or drop it.'
          : `We’ll put all ${lines.length} in your shop basket so you can change the quantities or drop what you don’t want.`}
      </p>

      {lost && (
        <p className="text-xs leading-relaxed mt-2" style={{ color: 'var(--tone-attention, #E5A13B)' }}>
          Your {lost} applies to this stack, not to single products — so buying them separately means paying
          full price. Your stack stays saved, and you can come back to it whenever you like.
        </p>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all active:scale-95"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          Never mind
        </button>
        <Link
          href="/shop"
          onClick={go}
          className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 text-center"
          style={{ background: 'var(--color-surface-2, rgba(255,255,255,0.08))', color: 'var(--color-text)' }}
        >
          {busy ? 'One moment…' : 'Take me to the shop'}
        </Link>
      </div>
    </div>
  )
}
