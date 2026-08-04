'use client'

import type { BlendedEconomics, LeverHeadroom } from '@/lib/pricing/blended'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'
const RED = '#f87171'

const money = (n: number) => `${n < 0 ? '−' : ''}£${Math.abs(n).toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`

function leverValue(l: LeverHeadroom, v: number): string {
  return l.unit === 'pct' ? pct(v) : l.unit === 'months' ? `${v} months` : money(v)
}

/**
 * Does the business make money on the average order?
 *
 * Deliberately the first thing on the pricing page, because it is the only
 * question whose answer is "yes" or "no". Everything else on the page prices one
 * order under one set of assumptions; this is the one that says whether the mix
 * of them pays.
 *
 * The headroom table is the point. Nobody knows what share of orders will come
 * through partners, and rather than demanding a guess, it reports how far each
 * lever could move before the average reached zero — and says plainly when a
 * lever cannot break it at all.
 */
export function BlendedPanel({ blended }: { blended: BlendedEconomics }) {
  const b = blended
  const ok = b.profitable
  const thin = ok && b.marginPct < 0.15
  const tone = !ok ? RED : thin ? AMBER : GREEN

  const safeLevers = b.breakEven.filter((l) => l.breaksAt == null)
  const riskyLevers = b.breakEven.filter((l) => l.breaksAt != null)

  return (
    <div className="space-y-3">
      {/* The answer */}
      <div className="rounded-2xl border p-5" style={{ background: `color-mix(in srgb, ${tone} 8%, transparent)`, borderColor: `color-mix(in srgb, ${tone} 40%, transparent)` }}>
        <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)]">
          After commission, postage, discounts, VAT, card fees and returns
        </p>
        <p className="text-3xl font-black my-1" style={{ color: tone, fontFamily: 'var(--font-display)' }}>
          {ok ? 'We make ' : 'We lose '}{money(Math.abs(b.perOrder))}
          <span className="text-lg"> on the average order</span>
        </p>
        <p className="text-xs text-[var(--color-text-2)] leading-relaxed">
          {pct(b.marginPct)} of the {money(b.netRevenuePerOrder)} we keep per order, with{' '}
          {money(b.commissionPerOrder)} of that going to partners. Over their whole life a customer is worth{' '}
          <strong style={{ color: 'var(--color-text)' }}>{money(b.perCustomer)}</strong>.
        </p>
        {!ok && (
          <p className="text-xs mt-2 font-semibold" style={{ color: RED }}>
            The mix does not pay at these settings. The table below shows which lever to move.
          </p>
        )}
        {thin && (
          <p className="text-xs mt-2" style={{ color: AMBER }}>
            Positive, but thin. There is not much room for a supplier price rise or a worse return rate.
          </p>
        )}
      </div>

      {/* Where the average comes from */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-1">
          The orders behind that average
        </p>
        <p className="text-[11px] text-[var(--color-muted)] mb-3 leading-snug">
          Subscriptions are counted over their whole life and divided back down — one that bills six times is six
          orders, and only the first carries the intro offer.
        </p>
        <div className="space-y-2">
          {b.cases.map((c) => {
            const caseTone = c.contribution < 0 ? RED : c.marginPct < 0.15 ? AMBER : GREEN
            return (
              <div key={c.label}>
                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="text-[var(--color-text-2)]">
                    {c.label}
                    <span className="text-[var(--color-muted)]"> · {pct(c.weight)} of orders</span>
                  </span>
                  <span className="whitespace-nowrap font-semibold" style={{ color: caseTone }}>
                    {money(c.contribution)} <span className="font-normal text-[var(--color-muted)]">({pct(c.marginPct)})</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full mt-0.5 overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, c.weight * 100)}%`, background: caseTone }} />
                </div>
                {c.commission > 0 && (
                  <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
                    Member pays {money(c.paid)} · {money(c.commission)} to the partner
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Headroom — the answer to "I don't know what the attribution share will be" */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-1">
          How much would have to go wrong
        </p>
        <p className="text-[11px] text-[var(--color-muted)] mb-3 leading-snug">
          Each lever moved on its own, with everything else held where it is, until the average order reaches zero.
        </p>

        {safeLevers.length > 0 && (
          <div className="rounded-xl p-3 mb-2" style={{ background: `color-mix(in srgb, ${GREEN} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${GREEN} 30%, transparent)` }}>
            <p className="text-[11px] font-bold mb-1" style={{ color: GREEN }}>Cannot break the average at any level</p>
            <ul className="text-[11px] text-[var(--color-text-2)] space-y-0.5">
              {safeLevers.map((l) => (
                <li key={l.lever}>
                  <strong>{l.lever}</strong> — currently {leverValue(l, l.current)}. Even at 100% the average stays
                  positive.
                </li>
              ))}
            </ul>
          </div>
        )}

        {riskyLevers.length > 0 && (
          <div className="space-y-1.5">
            {riskyLevers.map((l) => {
              const room = l.headroom ?? 0
              const tight = room < 0.1
              return (
                <div key={l.lever} className="flex items-baseline justify-between gap-2 text-[11px] py-1 border-b border-[var(--color-border)] last:border-0">
                  <span className="text-[var(--color-text-2)]">{l.lever}</span>
                  <span className="whitespace-nowrap text-[var(--color-muted)]">
                    {leverValue(l, l.current)} → breaks at{' '}
                    <strong style={{ color: tight ? AMBER : 'var(--color-text)' }}>{leverValue(l, l.breaksAt!)}</strong>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Assumptions, flagged as assumptions */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-2">
          What this assumed
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
          {[
            ['Orders on subscription', pct(b.assumptions.subscriptionShare)],
            ['Orders via a partner', pct(b.assumptions.attributedShare)],
            ['Average subscriber life', `${b.assumptions.averageRetentionMonths} months`],
            ['Average first month off', pct(b.assumptions.effectiveIntroDiscount)],
            ['Average bundle discount', pct(b.assumptions.averageBundleDiscount)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg px-2 py-1.5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <p className="text-[10px] text-[var(--color-muted)]">{label}</p>
              <p className="font-bold text-[var(--color-text)]">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2 leading-relaxed">
          These are estimates until there are enough real orders to measure them from. The two that move the answer
          most are subscriber life and the subscription share — retention is what covers the cost of the first month,
          so a shorter average life is a much bigger risk than a deeper discount.
        </p>
      </div>
    </div>
  )
}
