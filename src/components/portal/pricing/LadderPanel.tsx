'use client'

import type { LadderCheck } from '@/lib/pricing/ladder'

const GREEN = '#34d399'
const AMBER = '#fbbf24'
const RED = '#f87171'

const money = (n: number) => `£${n.toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`
const pp = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n * 1000) / 10)}pp`

const LABEL: Record<string, string> = {
  essentials: 'Essentials',
  performance: 'Performance',
  complete: 'Complete',
}

/**
 * Is there a reason to subscribe?
 *
 * This panel exists because for a while there wasn't, and nothing said so. The
 * one-off bundle tiers and the subscribe-&-save ladder were set in different
 * parts of the config and collided: a 5-item Performance stack tripped the
 * £120+ one-off tier at 20% against a 15% subscription rate, so the biggest
 * segment in the business PAID MORE to subscribe than to buy the same box once.
 *
 * Every individual setting was defensible. The relationship between them was
 * wrong, and a relationship is exactly what a page of individual number-boxes
 * hides. So this renders the comparison itself, next to the boxes that decide
 * it — change a rate and the verdict moves under your hand.
 */
export function LadderPanel({ check, compact = false }: { check: LadderCheck; compact?: boolean }) {
  const tone = check.coherent ? GREEN : RED

  return (
    <div
      className={compact ? 'rounded-xl border p-3 mt-1' : 'rounded-2xl border p-5'}
      style={{
        background: `color-mix(in srgb, ${tone} 8%, transparent)`,
        borderColor: `color-mix(in srgb, ${tone} 40%, transparent)`,
      }}
    >
      <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)]">
        Is there a reason to subscribe?
      </p>
      <p
        className={compact ? 'text-base font-black my-0.5' : 'text-2xl font-black my-1'}
        style={{ color: tone, fontFamily: 'var(--font-display)' }}
      >
        {check.coherent ? 'Yes — every bundle beats buying once' : 'Not on every bundle'}
      </p>
      <p className="text-[11px] text-[var(--color-text-2)] leading-relaxed mb-3">{check.summary}</p>

      <div className="space-y-1.5">
        {check.rungs.map((r) => {
          const rowTone = !r.healthy ? (r.advantage < 0 ? RED : AMBER) : GREEN
          return (
            <div key={r.level} className="border-b border-[var(--color-border)] last:border-0 pb-1.5 last:pb-0">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-[var(--color-text-2)]">
                  <strong className="text-[var(--color-text)]">{LABEL[r.level] ?? r.level}</strong>{' '}
                  <span className="text-[var(--color-muted)]">
                    {r.items} items, {money(r.listPrice)}
                  </span>
                </span>
                <span className="text-[11px] whitespace-nowrap">
                  <span className="text-[var(--color-muted)]">
                    buy once {pct(r.oneOffPct)} → subscribe {pct(r.subscriptionPct)}
                  </span>{' '}
                  <strong style={{ color: rowTone }}>{pp(r.advantage)}</strong>
                </span>
              </div>
              <p className="text-[10px] text-[var(--color-muted)]">
                Member lands {pct(Math.abs(r.vsRrpSubscribed))}{' '}
                {r.vsRrpSubscribed >= 0 ? 'below' : 'ABOVE'} RRP on the plan,{' '}
                {pct(Math.abs(r.vsRrpOneOff))} {r.vsRrpOneOff >= 0 ? 'below' : 'ABOVE'} buying once.
              </p>
              {r.warning && (
                <p className="text-[10px] mt-0.5 leading-snug" style={{ color: rowTone }}>
                  {r.warning}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-[var(--color-muted)] mt-2.5 leading-relaxed">
        The list price is anchored {pct(check.anchorPremium)} above the supplier&apos;s RRP, so any discount
        below <strong>{pct(check.minDiscountForRrp)}</strong> leaves the member paying more than they would on
        the high street. Every rung has to clear that line before it can be a saving at all.
      </p>
    </div>
  )
}
