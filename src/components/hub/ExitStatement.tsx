'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { ExitStatement as Statement } from '@/lib/recharge/exit-ledger'

const AMBER = '#fbbf24'
const GREEN = '#34d399'

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
    <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden">
      <div className="px-4 py-3 bg-[var(--color-surface-2)]">
        <p className="text-xs font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
          Everything we sent you
        </p>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {statement.shipments.map((shipment) => (
          <div key={shipment.orderId} className="text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-[var(--color-text-2)]">{dated(shipment.at)}</span>
              <span className="font-semibold text-[var(--color-text)]">{formatGBP(shipment.value)}</span>
            </div>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
              {shipment.items.map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.title}` : i.title)).join(', ')}
            </p>
          </div>
        ))}
        {statement.shipments.length === 0 && (
          <p className="text-xs text-[var(--color-muted)]">Nothing has shipped yet.</p>
        )}
        <div className="flex justify-between pt-2 border-t border-[var(--color-border)] text-xs">
          <span className="font-semibold text-[var(--color-text)]">Total sent</span>
          <span className="font-bold text-[var(--color-text)]">{formatGBP(statement.shippedTotal)}</span>
        </div>
      </div>

      <div className="px-4 py-3 bg-[var(--color-surface-2)]">
        <p className="text-xs font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
          Everything you paid
        </p>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {statement.payments.map((payment) => (
          <div key={payment.orderId} className="flex justify-between gap-3 text-xs">
            <span className="text-[var(--color-text-2)]">{dated(payment.at)}</span>
            <span className="font-semibold text-[var(--color-text)]">{formatGBP(payment.amount)}</span>
          </div>
        ))}
        {statement.payments.length === 0 && (
          <p className="text-xs text-[var(--color-muted)]">No payments recorded.</p>
        )}
        <div className="flex justify-between pt-2 border-t border-[var(--color-border)] text-xs">
          <span className="font-semibold text-[var(--color-text)]">Total paid</span>
          <span className="font-bold text-[var(--color-text)]">−{formatGBP(statement.paidTotal)}</span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-1.5 border-t border-[var(--color-border)]">
        {/* Only shown when they changed the answer — a line saying "£0.00 was
            knocked off" is noise, and a line saying £10.00 was is reassurance. */}
        {statement.cappedBy > 0 && (
          <div className="flex justify-between gap-3 text-xs">
            <span className="text-[var(--color-text-2)]">Capped at what you have paid</span>
            <span className="font-semibold" style={{ color: GREEN }}>−{formatGBP(statement.cappedBy)}</span>
          </div>
        )}
        {statement.waived > 0 && (
          <div className="flex justify-between gap-3 text-xs">
            <span className="text-[var(--color-text-2)]">Too small to bother with — waived</span>
            <span className="font-semibold" style={{ color: GREEN }}>−{formatGBP(statement.waived)}</span>
          </div>
        )}
        <div className="flex justify-between gap-3 pt-1.5 border-t border-[var(--color-border)]">
          <span className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
            {statement.overpayment > 0 ? 'We owe you' : 'To settle'}
          </span>
          <span
            className="text-sm font-black"
            style={{ color: statement.overpayment > 0 ? GREEN : statement.settlement > 0 ? AMBER : GREEN, fontFamily: 'var(--font-display)' }}
          >
            {formatGBP(statement.overpayment > 0 ? statement.overpayment : statement.settlement)}
          </span>
        </div>
      </div>
    </div>
  )
}
