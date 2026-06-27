'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { LineEconomics } from '@/lib/recharge/mock'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'

interface Props {
  monthlyBefore: number
  monthlyAfter: number
  /** Charged now (e.g. expedite / one-off extra). */
  oneOffNow?: number
  /** Credited to the next payment (e.g. skip). */
  credit?: number
  /** Settlement charge for goods already shipped (removal). */
  settlement?: number
  /** When the change takes effect (ISO or a label like "next box"). */
  effectiveFrom?: string
  /** Economics of the affected product, to explain discount + monthly spreading. */
  economics?: LineEconomics & { title?: string }
  note?: string
}

function fmtDate(s?: string): string | null {
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--color-text-2)]">{label}</span>
      <span className="font-bold" style={{ color: color ?? 'var(--color-text)' }}>{value}</span>
    </div>
  )
}

/** A clear, consistent "here's exactly what happens to your bill" panel. */
export function BillingImpact({ monthlyBefore, monthlyAfter, oneOffNow = 0, credit = 0, settlement = 0, effectiveFrom, economics, note }: Props) {
  const delta = Math.round((monthlyAfter - monthlyBefore) * 100) / 100
  const when = fmtDate(effectiveFrom)

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 space-y-3">
      {/* How the price is built (discount + spreading) */}
      {economics && (
        <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-1.5">
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-display)' }}>
            How the price works
          </p>
          {economics.discountPct > 0 && economics.listUnit > economics.discountedUnit && (
            <p className="text-xs text-[var(--color-text-2)]">
              <span className="line-through text-[var(--color-muted)]">{formatGBP(economics.listUnit)}</span>{' '}
              <span className="font-bold text-[var(--color-text)]">{formatGBP(economics.discountedUnit)}</span> a unit{' '}
              <span style={{ color: GREEN }}>· save {economics.discountPct}% on your plan</span>
            </p>
          )}
          <p className="text-xs text-[var(--color-text-2)]">
            {economics.units > 1 ? `${economics.units} units ` : ''}
            {economics.shipEveryMonths > 1 ? `every ${economics.shipEveryMonths} months` : 'every month'}
            {' · '}<span className="font-semibold text-[var(--color-text)]">{formatGBP(economics.perDelivery)}</span> per box
          </p>
          {economics.shipEveryMonths > 1 && (
            <p className="text-xs text-[var(--color-text-2)]">
              Spread evenly so you’re not lumped with it → <span className="font-bold" style={{ color: ACCENT }}>{formatGBP(economics.perMonth)}/mo</span>
            </p>
          )}
        </div>
      )}

      {/* Monthly before → after */}
      <Row
        label="Monthly"
        value={Math.abs(delta) < 0.01 ? `${formatGBP(monthlyBefore)} (no change)` : `${formatGBP(monthlyBefore)} → ${formatGBP(monthlyAfter)}`}
        color={Math.abs(delta) < 0.01 ? undefined : ACCENT}
      />

      {oneOffNow > 0.01 && <Row label="One-off now" value={formatGBP(oneOffNow)} />}
      {settlement > 0.01 && <Row label="Settlement (already-shipped box)" value={formatGBP(settlement)} color={AMBER} />}
      {credit > 0.01 && <Row label="Credit to next payment" value={`−${formatGBP(credit)}`} color={GREEN} />}

      {(when || note) && (
        <p className="text-[11px] text-[var(--color-muted)] pt-0.5 leading-relaxed">
          {note ?? (when ? `Takes effect from ${when}.` : '')}
        </p>
      )}
    </div>
  )
}
