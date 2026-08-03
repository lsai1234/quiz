'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { nextChargeBreakdown } from '@/lib/recharge/schedule'
import { cancelSettlement } from '@/lib/recharge/mock'
import type { Delivery } from '@/lib/recharge/schedule'
import type { MemberSubscription } from '@/lib/recharge/types'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
}

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th'
  switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th' }
}

interface Props {
  subscription: MemberSubscription
  deliveries: Delivery[]
}

/** The single source of truth for "what am I actually charged?". */
export function BillingSummary({ subscription: sub, deliveries }: Props) {
  const charge = nextChargeBreakdown(sub, deliveries)
  const settlement = cancelSettlement(sub)
  const hasAdjustments = charge.extras > 0.01 || charge.credits > 0.01

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-display)' }}>
          How you’re billed
        </p>
        <span className="text-lg font-black" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>{formatGBP(sub.flatMonthly)}/mo</span>
      </div>
      <p className="text-xs text-[var(--color-text-2)] leading-relaxed">
        One flat amount on the {sub.dispatchDayOfMonth}{ordinal(sub.dispatchDayOfMonth)} each month — it covers your whole stack,
        spread evenly so you never get a lumpy bill, however often each item ships.
      </p>

      {/* Next charge */}
      <div className="mt-4 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Next charge</span>
          <span className="text-lg font-black" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>{formatGBP(charge.net)}</span>
        </div>
        <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{fmtDate(charge.date)}</p>

        {hasAdjustments && (
          <div className="mt-3 space-y-1.5 border-t border-[var(--color-border)] pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-2)]">Monthly plan</span>
              <span className="font-semibold text-[var(--color-text)]">{formatGBP(charge.plan)}</span>
            </div>
            {charge.extras > 0.01 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-2)]">One-off extras this box</span>
                <span className="font-semibold text-[var(--color-text)]">+{formatGBP(charge.extras)}</span>
              </div>
            )}
            {charge.credits > 0.01 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-2)]">Credit (from a skip)</span>
                <span className="font-semibold" style={{ color: GREEN }}>−{formatGBP(charge.credits)}</span>
              </div>
            )}
          </div>
        )}

        {charge.skippedUpcoming > 0 && (
          <p className="text-[11px] mt-2" style={{ color: GREEN }}>
            {charge.skippedUpcoming} upcoming {charge.skippedUpcoming === 1 ? 'box is' : 'boxes are'} skipped — no charge those cycles.
          </p>
        )}
      </div>

      {/* No minimum term: cancelling is unconditional. What can be outstanding
          is the balance on product already sent that the smoothed monthly hasn't
          covered yet — so show that, not a commitment that no longer exists. */}
      <p className="text-[11px] text-[var(--color-muted)] mt-3">
        {settlement > 0.01
          ? `No minimum term — cancel or pause anytime. If you cancelled today you'd settle ${formatGBP(settlement)} for what's already been sent to you, and nothing more.`
          : 'No minimum term — cancel or pause anytime, with nothing left to settle.'}
      </p>
    </div>
  )
}
