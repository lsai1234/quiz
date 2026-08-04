'use client'

import type { UnitEconomics } from '@/lib/pricing/unit-economics'

const GREEN = '#34d399'
const AMBER = '#fbbf24'
const RED = '#f87171'

const money = (n: number) => `${n < 0 ? '−' : ''}£${Math.abs(n).toFixed(2)}`

/**
 * The cost stack, drawn.
 *
 * The point of a waterfall here is that there is nowhere for a number to come
 * from except a row you can see. Each bar's width is the step's share of what
 * the customer paid, so the VAT and delivery bars are visibly large next to the
 * profit — which is the whole argument the page is making.
 */
export function Waterfall({ economics, target }: { economics: UnitEconomics; target: number }) {
  const scale = Math.max(economics.grossRevenue, 0.01)
  const positive = economics.contribution > 0
  const meets = economics.marginPct >= target
  const colour = !positive ? RED : !meets ? AMBER : GREEN

  return (
    <div>
      <div className="space-y-1.5">
        {economics.steps.map((step) => {
          const share = Math.min(1, Math.abs(step.amount) / scale)
          const isRevenue = step.amount >= 0
          return (
            <div key={step.id}>
              <div className="flex items-baseline justify-between gap-3 text-[11px]">
                <span className="text-[var(--color-text-2)]">
                  {step.label}
                  {step.estimated && (
                    <span className="ml-1 text-[10px] px-1 py-px rounded" style={{ color: AMBER, background: `color-mix(in srgb, ${AMBER} 14%, transparent)` }}>
                      estimated
                    </span>
                  )}
                </span>
                <span className="font-semibold whitespace-nowrap" style={{ color: isRevenue ? 'var(--color-text)' : 'var(--color-muted)' }}>
                  {money(step.amount)}
                  <span className="text-[var(--color-muted)] font-normal"> → {money(step.runningTotal)}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full mt-0.5 overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(1.5, share * 100)}%`,
                    background: isRevenue ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-muted) 55%, transparent)',
                    marginLeft: isRevenue ? 0 : `${Math.max(0, (1 - share) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5 leading-snug">{step.note}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-3 pt-3 border-t flex items-baseline justify-between gap-3" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)]">What we keep</p>
          <p className="text-[10px] text-[var(--color-muted)]">
            {(Math.round(economics.marginPct * 1000) / 10).toFixed(1)}% of the {money(economics.netRevenue)} we kept after VAT
            {' · '}
            {(Math.round(economics.marginOfGrossPct * 1000) / 10).toFixed(1)}% of what they paid
          </p>
        </div>
        <p className="text-2xl font-black whitespace-nowrap" style={{ color: colour, fontFamily: 'var(--font-display)' }}>
          {money(economics.contribution)}
        </p>
      </div>
    </div>
  )
}
