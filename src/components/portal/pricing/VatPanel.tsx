'use client'

import { useEffect, useState } from 'react'
import type { VatPosition } from '@/lib/pricing/vat-position'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'
const RED = '#f87171'

const money = (n: number) => `£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const money2 = (n: number) => `£${Math.abs(n).toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`

const TONE: Record<VatPosition['verdict']['tone'], string> = { ok: GREEN, watch: AMBER, act: RED }

interface Payload {
  position: VatPosition
  basis: { averageCostRatio: number; averageGrams: number; productsCosted: number; catalogueSize: number }
}

/**
 * VAT, answered rather than displayed.
 *
 * Three questions in the order a founder actually asks them: am I required to
 * register yet, what would it cost me, and what do I do about it. The middle one
 * is the part that needs care — the input VAT we're currently eating is a big
 * visible number that makes registering look attractive, and it is a trap. Both
 * sides are shown together so the net answer is unavoidable.
 */
export function VatPanel({ registered }: { registered: boolean }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/portal/vat')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load the VAT position.'))
    // Re-read when the registered toggle flips, so the panel matches the rules.
  }, [registered])

  if (!data) return <p className="text-sm text-[var(--color-muted)]">{error ?? 'Loading…'}</p>

  const p = data.position
  const tone = TONE[p.verdict.tone]
  const risePct = Math.round((p.repriceFactor - 1) * 1000) / 10
  const barPct = Math.min(100, p.pctOfThreshold * 100)

  return (
    <div className="space-y-4">
      {/* The answer */}
      <div className="rounded-2xl border p-5" style={{ background: `color-mix(in srgb, ${tone} 7%, transparent)`, borderColor: `color-mix(in srgb, ${tone} 35%, transparent)` }}>
        <p className="text-sm font-black mb-1" style={{ color: tone, fontFamily: 'var(--font-display)' }}>
          {p.verdict.headline}
        </p>
        <p className="text-xs leading-relaxed text-[var(--color-text-2)]">{p.verdict.detail}</p>
      </div>

      {/* Threshold tracker */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            Rolling 12-month turnover
          </p>
          <p className="text-[11px] text-[var(--color-muted)]">{p.orderCount} order{p.orderCount === 1 ? '' : 's'}</p>
        </div>

        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {money(p.rollingTurnover)}
          </span>
          <span className="text-xs text-[var(--color-muted)]">of {money(p.threshold)} · {pct(p.pctOfThreshold)}</span>
        </div>

        <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'var(--color-surface-2)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(1, barPct)}%`, background: p.mustRegister ? RED : barPct > 80 ? AMBER : ACCENT }} />
        </div>

        <div className="text-[11px] text-[var(--color-muted)] space-y-0.5">
          <p>
            {money2(p.monthlyRunRate)} a month at the current run rate.
            {p.headroom > 0
              ? ` ${money(p.headroom)} of headroom left.`
              : ' The threshold has been passed.'}
          </p>
          {p.projectedCrossing && !p.mustRegister && (
            <p>
              At this rate registration becomes compulsory around{' '}
              <strong style={{ color: 'var(--color-text)' }}>
                {new Date(p.projectedCrossing).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </strong>
              {p.monthsToThreshold != null && ` — about ${p.monthsToThreshold} month${p.monthsToThreshold === 1 ? '' : 's'} away.`}
            </p>
          )}
          <p>
            The threshold is on <em>taxable turnover over any rolling 12 months</em>, not a tax year — so it can be
            crossed by a good quarter, and HMRC expect registration within 30 days of the end of the month it happened.
          </p>
        </div>
      </div>

      {/* The two-sided decision — the whole point of the panel */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          What registering is worth
        </p>
        <p className="text-[11px] text-[var(--color-muted)] mb-3 leading-snug">
          Both sides, because one on its own misleads. Annualised at the current run rate, holding shelf prices where
          they are.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="rounded-xl p-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
            <p className="text-[10px] uppercase font-bold text-[var(--color-muted)]">We&apos;d claim back</p>
            <p className="text-xl font-black" style={{ color: GREEN, fontFamily: 'var(--font-display)' }}>{money(p.inputVatLost)}</p>
            <p className="text-[10px] text-[var(--color-muted)] leading-snug">
              VAT PowerBody charge us on goods and delivery that we currently can&apos;t reclaim.
            </p>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
            <p className="text-[10px] uppercase font-bold text-[var(--color-muted)]">We&apos;d hand over</p>
            <p className="text-xl font-black" style={{ color: RED, fontFamily: 'var(--font-display)' }}>{money(p.outputVatOwed)}</p>
            <p className="text-[10px] text-[var(--color-muted)] leading-snug">
              VAT on sales, collected for HMRC. A fifth of every shelf price.
            </p>
          </div>
        </div>

        <div className="rounded-xl p-3" style={{ background: `color-mix(in srgb, ${p.netCostOfRegistering > 0 ? AMBER : GREEN} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${p.netCostOfRegistering > 0 ? AMBER : GREEN} 30%, transparent)` }}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-bold text-[var(--color-text)]">
              {p.netCostOfRegistering > 0 ? 'Net cost of registering' : 'Net gain from registering'}
            </p>
            <p className="text-lg font-black" style={{ color: p.netCostOfRegistering > 0 ? AMBER : GREEN, fontFamily: 'var(--font-display)' }}>
              {money(p.netCostOfRegistering)}<span className="text-xs">/yr</span>
            </p>
          </div>
          <p className="text-[10px] text-[var(--color-muted)] mt-1 leading-relaxed">
            {money2(Math.abs(p.costPerOrder))} per order. The reason the two numbers don&apos;t cancel is that VAT is
            charged on the whole shelf price but reclaimed only on costs — so registering costs you the VAT rate times
            your <em>margin</em>. Claiming back input VAT only wins if your costs exceed your net revenue, i.e. if
            you&apos;re losing money anyway.
          </p>
        </div>

        {risePct > 0 && (
          <p className="text-[11px] text-[var(--color-text-2)] mt-3 leading-relaxed">
            To hold the same profit after registering, shelf prices would need to rise about{' '}
            <strong style={{ color: ACCENT }}>{risePct}%</strong> — on a {money2(50)} order that&apos;s{' '}
            {money2(50 * p.repriceFactor)}. Whether the market takes that is the real question; the arithmetic is the
            easy half.
          </p>
        )}
      </div>

      {/* Honest limits */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-2">What this doesn&apos;t know</p>
        <ul className="text-[11px] text-[var(--color-muted)] space-y-1 list-disc pl-4 leading-relaxed">
          <li>
            The <strong>Flat Rate Scheme</strong> and other HMRC schemes, which can change the answer for a small
            business and are worth asking an accountant about before you register.
          </li>
          <li>
            <strong>Zero-rated products.</strong> Most sports nutrition is standard-rated, but some items sold as food
            aren&apos;t. Set those per product so their margins stop being 20% wrong.
          </li>
          <li>
            <strong>Making Tax Digital</strong> and the quarterly return itself — registering is an admin commitment,
            not only a margin one.
          </li>
          <li>
            Turnover here is {p.orderCount} order{p.orderCount === 1 ? '' : 's'} from this hub. Anything sold elsewhere
            counts towards the same threshold and isn&apos;t in this number.
          </li>
        </ul>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">
          Thresholds are public HMRC figures ({money(p.threshold)} to register, {money(90000)} since April 2024). This
          models what registration does to your margin — it isn&apos;t tax advice.
        </p>
      </div>
    </div>
  )
}
