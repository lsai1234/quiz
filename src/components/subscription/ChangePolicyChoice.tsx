'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { ChangePolicy } from '@/lib/recharge/types'

const ACCENT = '#00D4FF'

/**
 * "What should we do if this becomes unavailable?" — two options, one component.
 *
 * Used at checkout (plan-level and per-product) and again in the hub, so the
 * wording, the money consequence and the reassurance line have a single
 * definition. If the copy is right in one place it's right in all of them.
 *
 * Both options resolve without the member doing anything; neither leaves a
 * decision hanging over them. What makes that fair rather than presumptuous is
 * the promise underneath: we tell you, and you can change it.
 */

export interface ChangePolicyChoiceProps {
  policy: ChangePolicy
  onChange: (policy: ChangePolicy) => void
  /** The monthly this choice affects — the whole plan, or one line's share. */
  monthly: number
  /**
   * What removing would take off the monthly. Given for a single product (we can
   * name the figure); omitted plan-wide (it depends which product it turns out
   * to be).
   */
  removesMonthly?: number
  /** The member's dietary/stimulant exclusions in words, e.g. "vegan". */
  constraintsLabel?: string | null
  /** `compact` drops the reassurance line, for repeated per-product rows. */
  variant?: 'full' | 'compact'
}

interface OptionCopy {
  id: ChangePolicy
  label: string
  consequence: string
}

function optionsFor(monthly: number, removesMonthly?: number): OptionCopy[] {
  const after = removesMonthly !== undefined ? Math.max(0, Math.round((monthly - removesMonthly) * 100) / 100) : null

  return [
    {
      id: 'auto-swap',
      label: 'Keep my plan whole',
      consequence:
        `We swap in the closest match at the same or lower price — your ` +
        `${formatGBP(monthly)}/mo doesn’t change.`,
    },
    {
      id: 'remove',
      label: 'Take it off my plan',
      consequence:
        removesMonthly !== undefined && after !== null
          ? `Your monthly drops by ${formatGBP(removesMonthly)} to ${formatGBP(after)} from your next payment.`
          : 'Your monthly drops by whatever that item was costing, from your next payment.',
    },
  ]
}

export function ChangePolicyChoice({
  policy,
  onChange,
  monthly,
  removesMonthly,
  constraintsLabel,
  variant = 'full',
}: ChangePolicyChoiceProps) {
  const options = optionsFor(monthly, removesMonthly)

  return (
    <div>
      <div className="grid gap-2" role="radiogroup" aria-label="If this becomes unavailable">
        {options.map((option) => {
          const active = policy === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.id)}
              className="text-left rounded-2xl p-3.5 transition-all active:scale-[0.99]"
              style={{
                background: active ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : 'var(--color-surface-2)',
                border: `1px solid ${active ? ACCENT : 'var(--color-border)'}`,
              }}
            >
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ border: `2px solid ${active ? ACCENT : 'var(--color-border-2)'}` }}
                >
                  {active && <span className="w-2 h-2 rounded-full" style={{ background: ACCENT }} />}
                </span>
                <span className="min-w-0">
                  <span
                    className="block text-sm font-bold"
                    style={{ color: active ? ACCENT : 'var(--color-text)', fontFamily: 'var(--font-display)' }}
                  >
                    {option.label}
                  </span>
                  <span className="block text-[11px] leading-relaxed text-[var(--color-muted)] mt-0.5">
                    {option.consequence}
                  </span>
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {constraintsLabel && policy === 'auto-swap' && (
        <p className="text-[11px] leading-relaxed mt-2.5 px-1" style={{ color: ACCENT }}>
          You told us you need {constraintsLabel} products, so we’ll only ever swap to another one.
          If there isn’t a suitable match, we’ll take it off and lower your bill instead of sending
          you something that might not suit you.
        </p>
      )}

      {variant === 'full' && (
        <p className="text-[11px] leading-relaxed text-[var(--color-muted)] mt-2.5 px-1">
          Either way we’ll email you to say what happened — and you can always change it yourself in
          your hub.
        </p>
      )}
    </div>
  )
}
