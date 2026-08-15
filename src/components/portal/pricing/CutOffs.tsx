'use client'

import type { PricingThresholds } from '@/lib/pricing/thresholds'


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
 * judged across its life, because a first-month offer is *supposed* to lose
 * money on month one — that's rationed marketing, not a leak.
 *
 * `introDiscount` is the rate actually in force, so the panel can stop
 * explaining a giveaway that isn't running. It is currently zero: a partner's
 * code is the only extra discount on the site.
 */
export function CutOffs({ thresholds, introDiscount }: { thresholds: PricingThresholds; introDiscount: number }) {
  const problems = thresholds.thresholds.filter((t) => t.enforcedBy != null && !t.enforcedBy.ok)
  const tone = problems.length > 0 ? 'var(--tone-critical)' : 'var(--tone-positive)'

  return (
    <div className="space-y-3">
      <div
        className="rounded-2xl border p-5"
        style={{
          background: `color-mix(in srgb, ${tone} 8%, transparent)`,
          borderColor: `color-mix(in srgb, ${tone} 40%, transparent)`,
        }}
      >
        <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--ink-3)]">
          What we can afford to sell
        </p>
        <p className="text-2xl font-black my-1" style={{ color: tone, fontFamily: 'var(--font-display)' }}>
          {problems.length === 0
            ? 'Nothing on sale loses money'
            : `${problems.length} setting${problems.length === 1 ? '' : 's'} lets loss-making orders through`}
        </p>
        <p className="text-[11px] text-[var(--ink-2)] leading-relaxed">
          Two different tests, on purpose. <strong>A one-off has to pay every time</strong> — there is no renewal
          behind it, so if the checkout allows a losing basket we simply lose the money.{' '}
          {introDiscount > 0 ? (
            <>
              <strong>A subscription only has to pay across its life</strong>, because the first month is meant to
              lose. That is rationed marketing, not a leak.
            </>
          ) : (
            <>
              <strong>A subscription is still judged across its life</strong>, but with no first-month offer running
              there is nothing being given away up front, so the two bars currently sit together.
            </>
          )}
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
                background: 'var(--surface-1)',
                border: `1px solid ${bad ? 'var(--tone-critical)' : 'var(--edge)'}`,
              }}
            >
              <p className="text-[11px] font-bold text-[var(--ink-1)] leading-snug">{t.label}</p>
              <p
                className="text-3xl font-black my-1"
                style={{ color: bad ? 'var(--tone-critical)' : 'var(--ink-1)', fontFamily: 'var(--font-display)' }}
              >
                {t.value == null ? '—' : money(t.value)}
              </p>
              <p className="text-[11px] text-[var(--ink-3)] leading-relaxed">{t.meaning}</p>

              {t.lossBands.map((b) => (
                <p key={`${b.from}`} className="text-[11px] mt-2 rounded-lg px-2 py-1.5 leading-snug" style={{ background: `var(--attention-fill)`, color: 'var(--tone-attention)' }}>
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
                    background: `color-mix(in srgb, ${bad ? 'var(--tone-critical)' : 'var(--tone-positive)'} 12%, transparent)`,
                    color: bad ? 'var(--tone-critical)' : 'var(--tone-positive)',
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
