'use client'

import { useState } from 'react'
import { formatGBP, type PlanComparison } from '@/lib/stack-blueprint/pricing'
import { PLAN_COPY, whyPricesDiffer } from '@/lib/offer/plan-copy'
import type { PlanType } from '@/lib/store'

/**
 * How do you want it? (the clarity pass): the one choice that decides which
 * price every depth below shows, made before the depths, so a monthly price
 * is never set beside a one-off one as if they were the same thing.
 *
 * Each option says what it buys; the one chosen says how it works; and "Why
 * are the prices different?" explains, from this stack's own figures, why a
 * month and one of each are different numbers (`whyPricesDiffer`).
 */
export function PlanSwitch({
  planType,
  onChange,
  canSubscribe,
  monthly,
  oneOff,
  monthlyPct,
  comparison,
}: {
  planType: PlanType
  onChange: (plan: PlanType) => void
  canSubscribe: boolean
  monthly: number
  oneOff: number
  monthlyPct: number
  comparison: PlanComparison | null
}) {
  const [why, setWhy] = useState(false)
  const isSub = planType === 'subscription' && canSubscribe
  const option = (plan: PlanType, label: string, price: string, on: boolean, disabled = false) => (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(plan)}
      className="flex flex-col items-start gap-0.5 rounded-xl px-3.5 py-3 text-left transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: on ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'var(--color-surface)',
        border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`,
      }}
    >
      <span className="text-[13px] font-bold" style={{ color: on ? 'var(--color-accent)' : 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        {label}
      </span>
      <span className="text-[12px]" style={{ color: 'var(--color-text-2)' }}>
        {price}
      </span>
    </button>
  )

  return (
    <div className="px-5 max-w-lg mx-auto" data-plan-switch={isSub ? 'subscription' : 'oneoff'}>
      <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
        {PLAN_COPY.heading}
      </p>
      <div role="radiogroup" aria-label={PLAN_COPY.heading} className="grid grid-cols-2 gap-2">
        {option('oneoff', PLAN_COPY.once, `${formatGBP(oneOff)} · ${PLAN_COPY.oneOfEach}`, !isSub)}
        {option('subscription', PLAN_COPY.monthly, canSubscribe ? `${formatGBP(monthly)} ${PLAN_COPY.aMonth}` : PLAN_COPY.onceOnly, isSub, !canSubscribe)}
      </div>
      <p className="mt-2.5 text-[12px] leading-snug" style={{ color: 'var(--color-text-2)' }}>
        {isSub ? PLAN_COPY.monthlyLine(monthlyPct) : PLAN_COPY.onceLine}
      </p>
      {canSubscribe && comparison && (
        <>
          <button
            type="button"
            aria-expanded={why}
            onClick={() => setWhy((w) => !w)}
            className="mt-1.5 text-[12px] font-semibold underline underline-offset-2"
            style={{ color: 'var(--color-text)' }}
          >
            {PLAN_COPY.why}
          </button>
          {why && (
            <div className="mt-2 space-y-1.5 rounded-xl px-3.5 py-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} data-plan-why>
              {whyPricesDiffer(comparison, monthlyPct).map((line) => (
                <p key={line} className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
                  {line}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
