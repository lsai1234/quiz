'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { Eyebrow } from './Eyebrow'
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
    <div className="overflow-hidden" style={{ border: '1px solid var(--edge)', borderRadius: 'var(--radius-card)' }}>
      <div className="px-4 py-2.5" style={{ background: 'var(--surface-2)' }}>
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
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>Nothing has shipped yet.</p>
        )}
        <div className="pt-2" style={{ borderTop: '1px solid var(--edge)' }}>
          <MoneyRow label="Total sent" value={formatGBP(statement.shippedTotal)} strong />
        </div>
      </div>

      <div className="px-4 py-2.5" style={{ background: 'var(--surface-2)' }}>
        <Eyebrow>Everything you paid</Eyebrow>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {statement.payments.map((payment) => (
          <MoneyRow key={payment.orderId} label={dated(payment.at)} value={formatGBP(payment.amount)} />
        ))}
        {statement.payments.length === 0 && (
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>No payments recorded.</p>
        )}
        <div className="pt-2" style={{ borderTop: '1px solid var(--edge)' }}>
          <MoneyRow label="Total paid" value={`−${formatGBP(statement.paidTotal)}`} strong />
        </div>
      </div>

      <div className="px-4 py-3 space-y-2" style={{ borderTop: '1px solid var(--edge)' }}>
        {/* Only shown when they changed the answer — a line saying "£0.00 was
            knocked off" is noise, and a line saying £10.00 was is reassurance. */}
        {statement.introKept > 0 && (
          <MoneyRow label="Intro offer — not reclaimed" value={`−${formatGBP(statement.introKept)}`} color="var(--tone-positive)" />
        )}
        {statement.cappedBy > 0 && (
          <MoneyRow label="Capped at what you have paid" value={`−${formatGBP(statement.cappedBy)}`} color="var(--tone-positive)" />
        )}
        {statement.waived > 0 && (
          <MoneyRow label="Too small to bother with — waived" value={`−${formatGBP(statement.waived)}`} color="var(--tone-positive)" />
        )}
        <div className="pt-1.5" style={{ borderTop: '1px solid var(--edge)' }}>
          <MoneyRow
            strong
            label={statement.overpayment > 0 ? 'We owe you' : 'To settle'}
            value={formatGBP(statement.overpayment > 0 ? statement.overpayment : statement.settlement)}
            color={statement.settlement > 0 && statement.overpayment <= 0 ? 'var(--tone-attention)' : 'var(--tone-positive)'}
          />
        </div>
      </div>
    </div>
  )
}
