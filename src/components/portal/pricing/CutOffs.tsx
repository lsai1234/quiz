'use client'

import type { PricingThresholds } from '@/lib/pricing/thresholds'

const GREEN = '#34d399'
const AMBER = '#fbbf24'
const RED = '#f87171'

const money = (n: number) => `£${n.toFixed(2)}`

/**
 * The floors — what we're allowed to sell.
 *
 * The rest of the pricing area answers "what does this product make?", which is
 * the wrong shape for the decision it feeds. Nobody prices a catalogue one line
 * at a time. What you want is four numbers: below this, don't offer it.
 *
 * The two halves are deliberately different tests, and the panel says so,
 * because getting them the wrong way round is expensive in both directions. A
 * one-off has nothing behind it, so it has to pay every time. A subscription is
 * judged across its life, because the scratch card is *supposed* to lose money
 * on month one — that's rationed marketing, not a leak.
 */
export function CutOffs({ thresholds }: { thresholds: PricingThresholds }) {
  const problems = thresholds.thresholds.filter((t) => t.enforcedBy != null && !t.enforcedBy.ok)
  const tone = problems.length > 0 ? RED : GREEN

  return (
    <div className="space-y-3">
      <div
        className="rounded-2xl border p-5"
        style={{
          background: `color-mix(in srgb, ${tone} 8%, transparent)`,
          borderColor: `color-mix(in srgb, ${tone} 40%, transparent)`,
        }}
      >
        <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)]">
          What we can afford to sell
        </p>
        <p className="text-2xl font-black my-1" style={{ color: tone, fontFamily: 'var(--font-display)' }}>
          {problems.length === 0
            ? 'Nothing on sale loses money'
            : `${problems.length} setting${problems.length === 1 ? '' : 's'} lets loss-making orders through`}
        </p>
        <p className="text-[11px] text-[var(--color-text-2)] leading-relaxed">
          Two different tests, on purpose. <strong>A one-off has to pay every time</strong> — there is no renewal
          behind it, so if the checkout allows a losing basket we simply lose the money.{' '}
          <strong>A subscription only has to pay across its life</strong>, because the scratch card is meant to lose
          on month one. That is rationed marketing, not a leak.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {thresholds.thresholds.map((t) => {
          const bad = t.enforcedBy != null && !t.enforcedBy.ok
          return (
            <div
              key={t.id}
              className="rounded-2xl p-4"
              style={{
                background: 'var(--color-surface)',
                border: `1px solid ${bad ? RED : 'var(--color-border)'}`,
              }}
            >
              <p className="text-[11px] font-bold text-[var(--color-text)] leading-snug">{t.label}</p>
              <p
                className="text-3xl font-black my-1"
                style={{ color: bad ? RED : 'var(--color-text)', fontFamily: 'var(--font-display)' }}
              >
                {t.value == null ? '—' : money(t.value)}
              </p>
              <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">{t.meaning}</p>

              {t.lossBands.map((b) => (
                <p key={`${b.from}`} className="text-[11px] mt-2 rounded-lg px-2 py-1.5 leading-snug" style={{ background: `color-mix(in srgb, ${AMBER} 12%, transparent)`, color: AMBER }}>
                  <strong>
                    {money(b.from)}–{money(b.to)} also loses money.
                  </strong>{' '}
                  {b.reason}
                </p>
              ))}

              {t.enforcedBy && (
                <p
                  className="text-[11px] mt-2 rounded-lg px-2 py-1.5 leading-snug"
                  style={{
                    background: `color-mix(in srgb, ${bad ? RED : GREEN} 12%, transparent)`,
                    color: bad ? RED : GREEN,
                  }}
                >
                  {bad ? (
                    <>
                      <strong>&ldquo;{t.enforcedBy.label}&rdquo; is set to {money(t.enforcedBy.current)}</strong> — below
                      this floor, so orders that lose money can still get through. Raise it to at least{' '}
                      {t.value != null ? money(t.value) : '—'} on the Rules tab.
                    </>
                  ) : (
                    <>
                      Enforced — &ldquo;{t.enforcedBy.label}&rdquo; is set to {money(t.enforcedBy.current)}.
                    </>
                  )}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
