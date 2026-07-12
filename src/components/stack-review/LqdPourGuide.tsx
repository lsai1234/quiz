'use client'

/**
 * CHRGD LQD — "Your month, poured." Shown on the stack review only in drinks
 * mode: the convenience story (why one box of ready-made drinks beats a shelf
 * of tubs and pill bottles), the monthly drinks tally, and a per-drink pour
 * guide. Suggestions, not a schedule — the package promise is drink what we
 * send, whenever you want.
 */
import type { SubscriptionLine } from '@/lib/stack-blueprint/pricing'
import { monthlyDrinksOf, pourMomentFor } from '@/lib/lqd'

const ACCENT = '#00D4FF'

const CONVENIENCE = [
  { title: 'Arrives ready', note: 'Every drink is pre-made. Nothing to mix, measure or remember.' },
  { title: 'Replaces the shelf', note: 'One box instead of tubs, shakers and pill bottles.' },
  { title: 'You’re covered', note: 'Drink what we send and your month is handled.' },
]

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
        No powders. No pills. No mixing. Everything below turns up as a real,
        ready-made drink — open whichever you fancy, whenever you fancy it.
      </p>

      {/* Why this beats the shelf of tubs and pill bottles */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {CONVENIENCE.map(({ title, note }) => (
          <div
            key={title}
            className="rounded-xl px-2.5 py-3 text-center"
            style={{ background: 'color-mix(in srgb, var(--color-text) 4%, transparent)', border: '1px solid var(--color-border)' }}
          >
            <p className="text-[11px] font-black leading-tight mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              {title}
            </p>
            <p className="text-[10px] text-[var(--color-muted)] leading-snug">{note}</p>
          </div>
        ))}
      </div>

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
