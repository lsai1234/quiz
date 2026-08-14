'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { ACCENT, GLASS, GREEN, tint } from '@/lib/ui/tokens'
import type { MemberSubscription } from '@/lib/recharge/types'

/**
 * The plan, restated at the point of committing to it.
 *
 * The account gate and the consent gate both open OVER the stack review screen,
 * covering the receipt the member has been reading. Without this they spend the
 * last two screens before payment looking at a form and a wall of terms, with
 * the price nowhere on either — and the next figure they see is on Stripe.
 *
 * Small on purpose: the monthly, what month one actually costs when a code or an
 * intro rate is on it, and how many items. Anything more is the receipt they
 * already read, printed again in a worse place.
 */
export function PlanBeingBought({ subscription }: { subscription: MemberSubscription }) {
  const monthly = subscription.flatMonthly
  const first = subscription.firstMonth
  // Only worth a second line when it is genuinely a different number — an
  // "£52.18 first month" row under an £52.18 monthly reads as a second charge.
  const firstDiffers = typeof first === 'number' && Math.abs(first - monthly) > 0.01
  const itemCount = subscription.lines.length

  return (
    <div
      className="rounded-2xl px-4 py-3.5"
      style={{ background: GLASS.surface, border: `1px solid ${tint(ACCENT, 25)}` }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="text-[10px] font-bold tracking-widest uppercase"
          style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
        >
          Your plan
        </span>
        <span className="text-lg font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
          {formatGBP(monthly)}
          <span className="text-xs font-bold text-[var(--color-muted)]">/mo</span>
        </span>
      </div>

      <p className="text-[11px] text-[var(--color-text-2)] mt-1 leading-relaxed">
        {itemCount} product{itemCount === 1 ? '' : 's'} · delivered monthly · cancel any time
      </p>

      {firstDiffers && (
        <p className="text-[11px] font-semibold mt-1.5" style={{ color: GREEN }}>
          First month {formatGBP(first)} — then {formatGBP(monthly)} a month
        </p>
      )}
    </div>
  )
}
