'use client'

import type { LadderCheck } from '@/lib/pricing/ladder'


const money = (n: number) => `£${n.toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`
const round2 = (n: number) => Math.round(n * 100) / 100
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
  const tone = check.coherent ? 'var(--tone-positive)' : 'var(--tone-critical)'

  return (
    <div
      className={compact ? 'rounded-xl border p-3 mt-1' : 'rounded-2xl border p-5'}
      style={{
        background: `color-mix(in srgb, ${tone} 8%, transparent)`,
        borderColor: `color-mix(in srgb, ${tone} 40%, transparent)`,
      }}
    >
      <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--ink-3)]">
        Is there a reason to subscribe?
      </p>
      <p
        className={compact ? 'text-base font-black my-0.5' : 'text-2xl font-black my-1'}
        style={{ color: tone, fontFamily: 'var(--font-display)' }}
      >
        {check.coherent ? 'Yes — every bundle beats buying once' : 'Not on every bundle'}
      </p>
      <p className="text-[11px] text-[var(--ink-2)] leading-relaxed mb-3">{check.summary}</p>

      <div className="space-y-1.5">
        {check.rungs.map((r) => {
          const rowTone = !r.healthy ? (r.advantage < 0 ? 'var(--tone-critical)' : 'var(--tone-attention)') : 'var(--tone-positive)'
          return (
            <div key={r.level} className="border-b border-[var(--edge)] last:border-0 pb-1.5 last:pb-0">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-[var(--ink-2)]">
                  <strong className="text-[var(--ink-1)]">{LABEL[r.level] ?? r.level}</strong>{' '}
                  <span className="text-[var(--ink-3)]">
                    {r.items} items, {money(r.listPrice)}
                  </span>
                </span>
                <span className="text-[11px] whitespace-nowrap">
                  <span className="text-[var(--ink-3)]">
                    buy once {pct(r.oneOffPct)} → subscribe {pct(r.subscriptionPct)}
                  </span>{' '}
                  <strong style={{ color: rowTone }}>{pp(r.advantage)}</strong>
                </span>
              </div>
              <p className="text-[10px] text-[var(--ink-3)]">
                On a {money(r.listPrice)} box: {money(r.paysSubscribed)} on a plan against{' '}
                {money(r.paysOneOff)} buying once — {money(round2(r.paysOneOff - r.paysSubscribed))} a month better off.
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

      {check.clipped && (
        <p className="text-[11px] mt-2.5 rounded-lg px-2.5 py-2 leading-relaxed"
          style={{ background: `var(--attention-fill)`, color: 'var(--tone-attention)' }}>
          <strong>The biggest bundle plus the deepest first month promises more than we can give.</strong> Together
          they ask for {pct(check.clipped.advertised)} off, but a price set at {check.markupOnCost}× what we pay can
          only go to {pct(check.clipped.delivered)} before it is below cost. Someone taking the deepest first month
          on the biggest bundle sees a smaller discount than the one advertised. Either bring the first-month offer
          down, or accept selling that month nearer cost.
        </p>
      )}
      <p className="text-[10px] text-[var(--ink-3)] mt-2.5 leading-relaxed">
        Prices are {check.markupOnCost}× what we pay, and nothing is ever sold below cost plus a little — so the most
        that can come off any product is <strong>{pct(check.deepestPossibleDiscount)}</strong>, whatever the discounts
        add up to. The deepest we currently offer is {pct(check.deepestOffered)}.
      </p>
    </div>
  )
}
