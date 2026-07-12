'use client'

/**
 * CHRGD LQD — "Your month, poured." Shown on the stack review only in drinks
 * mode: the monthly drinks tally plus a per-drink pour guide. Suggestions, not
 * a schedule — the package promise is drink whatever, whenever.
 */
import type { SubscriptionLine } from '@/lib/stack-blueprint/pricing'
import { monthlyDrinksOf, pourMomentFor } from '@/lib/lqd'

const ACCENT = '#00D4FF'

export function LqdPourGuide({ plan }: { plan: SubscriptionLine[] }) {
  if (plan.length === 0) return null
  const monthlyDrinks = monthlyDrinksOf(plan)

  return (
    <div
      className="rounded-2xl p-5 mb-4"
      style={{
        border: `1px solid color-mix(in srgb, ${ACCENT} 22%, transparent)`,
        background: `linear-gradient(135deg, color-mix(in srgb, ${ACCENT} 7%, transparent), transparent 60%)`,
      }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
          CHRGD LQD · Your month, poured
        </p>
        {monthlyDrinks > 0 && (
          <p className="text-sm font-black whitespace-nowrap" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            ~{monthlyDrinks} <span className="font-semibold text-[var(--color-muted)] text-xs">drinks/mo</span>
          </p>
        )}
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed mb-4">
        Everything below mixes as a drink. Pour whatever you fancy, whenever you fancy it —
        these are just the moments each one works hardest.
      </p>

      <div className="space-y-3">
        {plan.map((line) => {
          const { moment, note } = pourMomentFor(line.product.stackSlots[0], line.product.hasStimulants)
          return (
            <div key={line.product.id} className="flex items-start gap-3">
              <span
                className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: ACCENT }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-[13px] leading-snug">
                  <span className="font-bold" style={{ color: 'var(--color-text)' }}>{line.product.title}</span>
                  <span className="text-[var(--color-muted)]"> — {moment.toLowerCase()}</span>
                </p>
                <p className="text-[11px] text-[var(--color-muted)] leading-snug mt-0.5">{note}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
