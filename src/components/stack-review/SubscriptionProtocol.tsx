'use client'

import type { SubscriptionLine } from '@/lib/stack-blueprint/pricing'
import { cadenceNote, formatGBP } from '@/lib/stack-blueprint/pricing'
import type { QuizAnswers } from '@/lib/types'
import { ProductTile } from './ProductTile'

const ACCENT = '#00D4FF'

const FREQ_LABEL: Record<string, string> = {
  '1-2x': '1–2× a week',
  '3-4x': '3–4× a week',
  '5-6x': '5–6× a week',
  daily: 'every day',
}

/** How many months of the delivery schedule to visualise. */
const HORIZON = 3

/** Whether a line delivers in month `m` (1-indexed), given its ship cadence. */
function shipsInMonth(line: SubscriptionLine, m: number): boolean {
  const every = Math.max(1, line.shipEveryMonths)
  return (m - 1) % every === 0
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

export function SubscriptionProtocol({ plan, answers, minMonths = 1, monthlyTotal, firstMonth, introPct = 0 }: Props) {
  if (plan.length === 0) return null

  const freq = answers?.trainingFrequency ? FREQ_LABEL[answers.trainingFrequency] : null
  const hasIntro = introPct > 0 && firstMonth != null && firstMonth < monthlyTotal

  const note = cadenceNote(plan)

  const months = Array.from({ length: HORIZON }, (_, i) => {
    const m = i + 1
    return { m, lines: plan.filter((l) => shipsInMonth(l, m)) }
  })

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
            ? `One flat monthly payment, sized to how you train — ${freq}. Here's what lands each month:`
            : "One flat monthly payment. Here's what lands each month:"}
        </p>

        {/* Delivery timeline — what arrives in each of the next three months */}
        <div className="flex items-stretch gap-2">
          {months.map(({ m, lines }) => (
            <div
              key={m}
              className="flex-1 rounded-xl p-2.5 flex flex-col"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <p
                className="text-[9px] font-bold tracking-widest uppercase mb-2"
                style={{ color: m === 1 ? ACCENT : 'var(--color-muted)', fontFamily: 'var(--font-display)' }}
              >
                Month {m}
              </p>
              {lines.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-1.5 flex-1 content-start">
                    {lines.map((line) => (
                      <ProductTile
                        key={line.product.id}
                        imageUrl={line.product.imageUrl}
                        slot={line.product.stackSlots[0]}
                        title={line.product.title}
                        size={34}
                      />
                    ))}
                  </div>
                  <p className="text-[9px] font-semibold mt-2" style={{ color: 'var(--color-text-2)' }}>
                    {lines.length} {lines.length === 1 ? 'item' : 'items'}
                  </p>
                </>
              ) : (
                <div className="flex-1 flex items-center">
                  <p className="text-[9px] leading-snug" style={{ color: 'var(--color-muted)' }}>
                    Still stocked — no delivery
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Derived from the plan, not asserted over it — see `cadenceNote`. A
            stack of three-month tubs used to be captioned "most items refill
            every month" directly under a timeline showing two empty months. */}
        {note && (
          <p className="text-[10px] mt-2.5 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            {note}
          </p>
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
