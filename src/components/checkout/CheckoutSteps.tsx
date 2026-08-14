'use client'

import { ACCENT, GLASS, tint } from '@/lib/ui/tokens'
import { Icon } from '@/components/ui/Icon'

/**
 * Where you are between "Start subscription" and being charged.
 *
 * Subscribing is three screens on two different sites, and until this existed
 * the member met each one cold: a sign-in box appears over the stack with no
 * indication that terms are still to come, then terms with no indication that
 * Stripe is, then a redirect off the site entirely. Nothing was wrong at any
 * step and the whole thing still felt like being passed around.
 *
 * Three steps, named for what they ask of the member rather than what the system
 * does, with the last one saying plainly that payment happens somewhere else.
 */
export type CheckoutStep = 'account' | 'terms' | 'payment'

const STEPS: { id: CheckoutStep; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'terms', label: 'Terms' },
  { id: 'payment', label: 'Payment' },
]

export function CheckoutSteps({ current }: { current: CheckoutStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current)

  return (
    <ol className="flex items-center gap-1.5 mt-2.5" aria-label="Checkout progress">
      {STEPS.map((step, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        return (
          <li
            key={step.id}
            className="flex items-center gap-1.5 flex-1 min-w-0"
            aria-current={active ? 'step' : undefined}
          >
            <span
              className="flex items-center gap-1.5 rounded-full pl-1.5 pr-2.5 py-1 min-w-0"
              style={{
                background: active ? tint(ACCENT, 14) : GLASS.surface,
                border: `1px solid ${active ? tint(ACCENT, 45) : GLASS.hairline}`,
              }}
            >
              <span
                className="flex items-center justify-center w-4 h-4 rounded-full shrink-0 text-[9px] font-black"
                style={{
                  background: done || active ? ACCENT : GLASS.hairlineStrong,
                  color: done || active ? 'var(--color-bg)' : 'var(--color-muted)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                {done ? <Icon name="check" size={9} /> : i + 1}
              </span>
              <span
                className="text-[10px] font-bold uppercase tracking-wider truncate"
                style={{
                  color: active ? ACCENT : 'var(--color-muted)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                {step.label}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
