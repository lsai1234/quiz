'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { Card } from '@/components/system'
import { Eyebrow } from './Eyebrow'
import { MoneyRow } from './MoneyRow'
import type { LineEconomics } from '@/lib/recharge/mock'

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

/** A clear, consistent "here's exactly what happens to your bill" panel. */
export function BillingImpact({ monthlyBefore, monthlyAfter, oneOffNow = 0, credit = 0, settlement = 0, effectiveFrom, economics, note }: Props) {
  const delta = Math.round((monthlyAfter - monthlyBefore) * 100) / 100
  const when = fmtDate(effectiveFrom)

  return (
    <Card className="space-y-3">
      {/* How the price is built (discount + spreading) */}
      {economics && (
        <Card elevation={2} padding="tight" className="space-y-1.5">
          <Eyebrow>How the price works</Eyebrow>
          {economics.discountPct > 0 && economics.listUnit > economics.discountedUnit && (
            <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }}>
              <span style={{ textDecoration: 'line-through', color: 'var(--ink-3)' }}>{formatGBP(economics.listUnit)}</span>{' '}
              <span style={{ fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>{formatGBP(economics.discountedUnit)}</span> a unit{' '}
              <span style={{ color: 'var(--tone-positive)' }}>· save {economics.discountPct}% on your plan</span>
            </p>
          )}
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }}>
            {economics.units > 1 ? `${economics.units} units ` : ''}
            {economics.shipEveryMonths > 1 ? `every ${economics.shipEveryMonths} months` : 'every month'}
            {' · '}
            <span style={{ fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>{formatGBP(economics.perDelivery)}</span> per box
          </p>
          {economics.shipEveryMonths > 1 && (
            <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }}>
              Spread evenly so you’re not lumped with it →{' '}
              <span style={{ fontWeight: 'var(--weight-strong)', color: 'var(--accent)' }}>{formatGBP(economics.perMonth)}/mo</span>
            </p>
          )}
        </Card>
      )}

      {/* Monthly before → after */}
      <div className="space-y-2">
        <MoneyRow
          label="Monthly"
          strong
          value={Math.abs(delta) < 0.01 ? `${formatGBP(monthlyBefore)} (no change)` : `${formatGBP(monthlyBefore)} → ${formatGBP(monthlyAfter)}`}
          color={Math.abs(delta) < 0.01 ? undefined : 'var(--accent)'}
        />
        {oneOffNow > 0.01 && <MoneyRow label="One-off now" value={formatGBP(oneOffNow)} />}
        {settlement > 0.01 && (
          <MoneyRow label="Settlement (already-shipped box)" value={formatGBP(settlement)} color="var(--tone-attention)" />
        )}
        {credit > 0.01 && (
          <MoneyRow label="Credit to next payment" value={`−${formatGBP(credit)}`} color="var(--tone-positive)" />
        )}
      </div>

      {(when || note) && (
        <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' }}>
          {note ?? (when ? `Takes effect from ${when}.` : '')}
        </p>
      )}
    </Card>
  )
}
