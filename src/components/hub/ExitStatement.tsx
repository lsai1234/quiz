'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { AMBER, GLASS, GREEN } from '@/lib/ui/tokens'
import { MoneyRow } from './MoneyRow'
import type { ExitStatement as Statement } from '@/lib/recharge/exit-ledger'


/**
 * What we sent, what they paid, and the difference — as a statement rather than
 * a formula.
 *
 * The screen this replaced showed `shipped − paid = settlement`: three correct
 * numbers with nothing behind them. Correct is not the same as checkable, and a
 * figure someone cannot check is one they dispute. Every box and every payment
 * is listed here with its date, so the total is something a member can add up
 * themselves and recognise.
 *
 * The cap and the waiver appear as their own lines for the same reason. "We
 * capped this at what you have paid" is worth saying out loud; a smaller number
 * arriving unexplained is not.
 */
export function ExitStatementView({ statement }: { statement: Statement }) {
  const dated = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${GLASS.hairline}` }}>
      <div className="px-4 py-2.5" style={{ background: GLASS.raised }}>
        <Eyebrow>Everything we sent you</Eyebrow>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {statement.shipments.map((shipment) => (
          <MoneyRow
            key={shipment.orderId}
            label={dated(shipment.at)}
            value={formatGBP(shipment.value)}
            sub={shipment.items.map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.title}` : i.title)).join(', ')}
          />
        ))}
        {statement.shipments.length === 0 && (
          <p className="text-xs text-[var(--color-muted)]">Nothing has shipped yet.</p>
        )}
        <div className="pt-2" style={{ borderTop: `1px solid ${GLASS.hairline}` }}>
          <MoneyRow label="Total sent" value={formatGBP(statement.shippedTotal)} strong />
        </div>
      </div>

      <div className="px-4 py-2.5" style={{ background: GLASS.raised }}>
        <Eyebrow>Everything you paid</Eyebrow>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {statement.payments.map((payment) => (
          <MoneyRow key={payment.orderId} label={dated(payment.at)} value={formatGBP(payment.amount)} />
        ))}
        {statement.payments.length === 0 && (
          <p className="text-xs text-[var(--color-muted)]">No payments recorded.</p>
        )}
        <div className="pt-2" style={{ borderTop: `1px solid ${GLASS.hairline}` }}>
          <MoneyRow label="Total paid" value={`−${formatGBP(statement.paidTotal)}`} strong />
        </div>
      </div>

      <div className="px-4 py-3 space-y-2" style={{ borderTop: `1px solid ${GLASS.hairline}` }}>
        {/* Only shown when they changed the answer — a line saying "£0.00 was
            knocked off" is noise, and a line saying £10.00 was is reassurance. */}
        {statement.introKept > 0 && (
          <MoneyRow label="Intro offer — not reclaimed" value={`−${formatGBP(statement.introKept)}`} color={GREEN} />
        )}
        {statement.cappedBy > 0 && (
          <MoneyRow label="Capped at what you have paid" value={`−${formatGBP(statement.cappedBy)}`} color={GREEN} />
        )}
        {statement.waived > 0 && (
          <MoneyRow label="Too small to bother with — waived" value={`−${formatGBP(statement.waived)}`} color={GREEN} />
        )}
        <div className="pt-1.5" style={{ borderTop: `1px solid ${GLASS.hairline}` }}>
          <MoneyRow
            strong
            label={statement.overpayment > 0 ? 'We owe you' : 'To settle'}
            value={formatGBP(statement.overpayment > 0 ? statement.overpayment : statement.settlement)}
            color={statement.overpayment > 0 ? GREEN : statement.settlement > 0 ? AMBER : GREEN}
          />
        </div>
      </div>
    </div>
  )
}
