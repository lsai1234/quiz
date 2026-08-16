'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { Card } from '@/components/ui/Card'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { ACCENT, GLASS, GREEN, ordinalSuffix } from '@/lib/ui/tokens'
import { MoneyRow } from './MoneyRow'
import { nextChargeBreakdown } from '@/lib/recharge/schedule'
import { cancelSettlement } from '@/lib/recharge/mock'
import type { Delivery } from '@/lib/recharge/schedule'
import type { MemberSubscription } from '@/lib/recharge/types'


function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
}

interface Props {
  subscription: MemberSubscription
  deliveries: Delivery[]
}

/** The single source of truth for "what am I actually charged?". */
export function BillingSummary({ subscription: sub, deliveries }: Props) {
  const charge = nextChargeBreakdown(sub, deliveries)
  const settlement = cancelSettlement(sub)
  // Postage is not an "adjustment" — it is billed every cycle, so the breakdown
  // has to open whenever there is any, not only when something unusual happened.
  const hasAdjustments = charge.extras > 0.01 || charge.credits > 0.01 || charge.delivery > 0.01

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <Eyebrow>How you’re billed</Eyebrow>
        <span className="text-lg font-black" style={{ color: ACCENT, fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
          {formatGBP(sub.flatMonthly + charge.delivery)}/mo
        </span>
      </div>
      <p className="text-xs text-[var(--color-text-2)] leading-relaxed">
        One flat amount on the {sub.dispatchDayOfMonth}{ordinalSuffix(sub.dispatchDayOfMonth)} each month — it covers your whole stack,
        spread evenly so you never get a lumpy bill, however often each item ships.
        {charge.delivery > 0.01 && ' Postage is billed alongside it, as its own line.'}
      </p>

      {/* Next charge */}
      <div className="mt-4 rounded-xl p-4" style={{ background: GLASS.raised, border: `1px solid ${GLASS.hairline}` }}>
        {/* The breakdown reads down a single column of figures, the way the
            printed receipt does — the panels used to put every amount on its
            own x-position and leave the eye nothing to follow. */}
        {hasAdjustments && (
          <div className="space-y-2 mb-3 pb-3" style={{ borderBottom: `1px solid ${GLASS.hairline}` }}>
            <MoneyRow label="Monthly plan" value={formatGBP(charge.plan)} />
            {/* Its own row because it is its own line on the invoice. Folding it
                into the plan figure is what let the two disagree in the first
                place. */}
            {charge.delivery > 0.01 && <MoneyRow label="Delivery" value={`+${formatGBP(charge.delivery)}`} />}
            {charge.extras > 0.01 && <MoneyRow label="One-off extras this box" value={`+${formatGBP(charge.extras)}`} />}
            {charge.credits > 0.01 && <MoneyRow label="Credit (from a skip)" value={`−${formatGBP(charge.credits)}`} color={GREEN} />}
          </div>
        )}

        <MoneyRow label="Next charge" value={formatGBP(charge.net)} color={ACCENT} strong sub={fmtDate(charge.date)} />

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
        {/* An indication, not the bill. This is the forecast off the plan's
            current state; the exact figure is worked out from your actual
            deliveries and payments when you go to cancel, and shown itemised
            before anything is confirmed. */}
        {settlement > 0.01
          ? `No minimum term — cancel or pause anytime. As things stand you'd settle around ${formatGBP(settlement)} for what's already been sent to you, and nothing more. You'll see the exact figure, itemised, before you confirm.`
          : 'No minimum term — cancel or pause anytime, with nothing left to settle.'}
      </p>
    </Card>
  )
}
