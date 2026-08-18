'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { OptionRow } from '@/components/system'
import type { ChangePolicy } from '@/lib/recharge/types'

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
      {/* `OptionRow` rather than `Segmented`: each answer needs a sentence
          explaining what it does to a plan, and a sentence does not fit in a
          segment. The group is still a radiogroup, so arrow keys work and each
          option announces its position. */}
      <div className="grid" style={{ gap: 'var(--space-2)' }} role="radiogroup" aria-label="If this becomes unavailable">
        {options.map((option) => (
          <OptionRow
            key={option.id}
            role="radio"
            label={option.label}
            sub={option.consequence}
            selected={policy === option.id}
            onClick={() => onChange(option.id)}
          />
        ))}
      </div>

      {constraintsLabel && policy === 'auto-swap' && (
        <p className="text-[11px] leading-relaxed mt-2.5 px-1" style={{ color: 'var(--accent)' }}>
          You told us you need {constraintsLabel} products, so we’ll only ever swap to another one.
          If there isn’t a suitable match, we’ll take it off and lower your bill instead of sending
          you something that might not suit you.
        </p>
      )}

      {variant === 'full' && (
        <p className="text-[11px] leading-relaxed text-[var(--ink-3)] mt-2.5 px-1">
          Either way we’ll email you to say what happened — and you can always change it yourself in
          your hub.
        </p>
      )}
    </div>
  )
}
