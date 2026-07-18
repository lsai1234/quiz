'use client'

import { useState } from 'react'
import type { SubscriptionLine } from '@/lib/stack-blueprint/pricing'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { QuizAnswers } from '@/lib/types'

const ACCENT = '#00D4FF'

const FREQ_LABEL: Record<string, string> = {
  '1-2x': '1–2× a week',
  '3-4x': '3–4× a week',
  '5-6x': '5–6× a week',
  daily: 'every day',
}

function unitNoun(formats: string[]): string {
  const f = (formats[0] ?? '').toLowerCase()
  if (f.includes('powder')) return 'tub'
  return 'pack'
}

function deliveryLabel(line: SubscriptionLine): string {
  const noun = unitNoun(line.product.formats)
  if (line.shipEveryMonths > 1) return `1 ${noun} every ${line.shipEveryMonths} months`
  if (line.unitsPerShipment > 1) return `${line.unitsPerShipment} ${noun}s a month`
  return `1 ${noun} a month`
}

function cadenceLabel(line: SubscriptionLine): string {
  return line.cadence === 'daily'
    ? 'Every day'
    : `On training days (~${line.occasionsPerMonth}/mo)`
}

interface Props {
  plan: SubscriptionLine[]
  answers?: QuizAnswers | null
  slotTitleById: Record<string, string>
  minMonths?: number
  monthlyTotal: number
  firstMonth?: number
  introPct?: number
}

export function SubscriptionProtocol({ plan, answers, slotTitleById, minMonths = 1, monthlyTotal, firstMonth, introPct = 0 }: Props) {
  const [open, setOpen] = useState(false)
  if (plan.length === 0) return null

  const freq = answers?.trainingFrequency ? FREQ_LABEL[answers.trainingFrequency] : null
  const hasIntro = introPct > 0 && firstMonth != null && firstMonth < monthlyTotal
  const itemCount = plan.length

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden mb-4">
      <div className="p-5">
        <p
          className="text-[10px] font-bold tracking-widest uppercase mb-1"
          style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
        >
          Your monthly protocol
        </p>
        <p className="text-xs text-[var(--color-muted)] mb-4 leading-relaxed">
          {freq
            ? `One flat payment a month, sized to how you train — ${freq}. Each item arrives on its own schedule.`
            : 'One flat payment a month. Each item arrives on its own schedule.'}
        </p>

        {/* Per-item schedule — collapsed by default so the block leads with the
            price, not a wall of delivery detail. */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 py-2 text-left active:opacity-70 transition-opacity"
        >
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-2)' }}>
            {open ? 'Hide monthly schedule' : `See what arrives each month · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
          </span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{
              color: 'var(--color-muted)',
              border: '1px solid var(--color-border-2)',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          >
            ▾
          </span>
        </button>

        {open && (
        <div className="space-y-3.5 mt-3">
          {plan.map((line) => {
            const covers = line.coversSlotIds
              .map((id) => slotTitleById[id])
              .filter(Boolean)
              .join(' + ')
            return (
              <div key={line.product.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="text-sm font-bold leading-snug"
                    style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
                  >
                    {covers || line.product.title}
                  </p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5 truncate">
                    {line.product.title}
                  </p>
                  <p className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--color-text-2)' }}>
                    {cadenceLabel(line)} · {deliveryLabel(line)}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p
                    className="text-sm font-black"
                    style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}
                  >
                    {formatGBP(line.monthlyPrice)}/mo
                  </p>
                  {line.shipEveryMonths > 1 && (
                    <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
                      {formatGBP(line.pricePerDelivery)} every {line.shipEveryMonths} mo
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        )}

        {/* Footer: flat fee + intro + commitment */}
        <div className="mt-4 pt-4 border-t border-[var(--color-border)] space-y-1.5">
          {hasIntro ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--color-text-2)]">First month ({introPct}% off)</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[11px] text-[var(--color-muted)] line-through">{formatGBP(monthlyTotal)}</span>
                  <span className="text-sm font-black" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
                    {formatGBP(firstMonth!)}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-muted)]">Then per month</span>
                <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{formatGBP(monthlyTotal)}/mo</span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-text-2)]">Flat monthly</span>
              <span className="text-sm font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                {formatGBP(monthlyTotal)}/mo
              </span>
            </div>
          )}
          <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
            {minMonths > 1 ? `${minMonths}-month minimum, then cancel or pause anytime.` : 'Cancel or pause anytime.'}
          </p>
        </div>
      </div>
    </div>
  )
}
