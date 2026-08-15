'use client'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Icon } from '@/components/ui/Icon'
import { Chip } from '@/components/ui/Chip'
import { StatusBadge } from '@/components/hub/StatusBadge'
import { ProgressRing } from '@/components/hub/ProgressRing'
import { MoneyRow } from '@/components/hub/MoneyRow'
import { ACCENT, GLASS, tint, toneColor } from '@/lib/ui/tokens'
import { COPY, PLAN, gbp } from './plan'

/**
 * My Hub as it looks today.
 *
 * The control arm of the comparison, and the half that is easiest to get wrong
 * in a way that flatters the other one. So it is not a sketch of the current
 * design — it imports the *real* `@/components/ui` primitives the hub actually
 * runs on, keeps the old palette (`--color-*`, `GLASS`, `tint`), and copies the
 * markup out of `SubscriptionDashboard` and `StackItemCard`: the same
 * `rounded-3xl` hero with its corner bloom, the same `GLASS.surface` cards, the
 * same eyebrow-and-number billing panel, the same product rows.
 *
 * If this does not match what you see at `/myhub`, the comparison is invalid and
 * the fix is to correct this file — never to soften it.
 *
 * The one deliberate simplification, applied to both arms equally: no sheets, no
 * check-in, no settings disclosure. This is the resting screen, which is what a
 * preference test can actually judge.
 */
export function BeforeDashboard() {
  return (
    <div style={{ background: 'var(--color-bg)' }} className="min-h-full">
      <header
        className="sticky top-0 z-10"
        style={{
          background: 'color-mix(in srgb, var(--color-bg) 82%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${GLASS.hairline}`,
        }}
      >
        <div className="px-5 h-14 flex items-center justify-between gap-3">
          <span className="text-base font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            CHRGD
          </span>
          <Icon name="log-out" size={18} className="text-[var(--color-muted)]" />
        </div>
      </header>

      <main className="px-5 pt-6 pb-10">
        <div className="mb-6">
          <Eyebrow color={ACCENT}>{COPY.eyebrow}</Eyebrow>
          <h1
            className="text-2xl font-black mt-1.5"
            style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
          >
            {PLAN.greeting}
          </h1>
        </div>

        {/* Hero — next box */}
        <div
          className="rounded-3xl p-5 mb-5 relative overflow-hidden"
          style={{ background: GLASS.surface, border: `1px solid ${tint(ACCENT, 30)}` }}
        >
          <div
            className="absolute -top-16 -right-16 w-40 h-40 rounded-full"
            style={{ background: `radial-gradient(circle, ${tint(ACCENT, 22)}, transparent 70%)` }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 mb-1.5" style={{ color: ACCENT }}>
              <Icon name="truck" size={14} />
              <Eyebrow color={ACCENT}>{COPY.nextEyebrow}</Eyebrow>
            </div>
            <p
              className="text-2xl font-black text-[var(--color-text)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {PLAN.nextBox.dateLabel}
            </p>

            <div className="flex items-center gap-2 mt-3.5">
              {PLAN.nextBox.itemTitles.map((title) => (
                <span
                  key={title}
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: GLASS.raised, border: `1px solid ${GLASS.hairline}`, color: 'var(--color-muted)' }}
                >
                  <Icon name="capsule" size={18} />
                </span>
              ))}
            </div>
            <p className="text-xs text-[var(--color-text-2)] mt-2.5">
              {PLAN.nextBox.itemTitles.slice(0, 3).join(', ')} +{PLAN.nextBox.itemTitles.length - 3} more
            </p>

            <div className="flex gap-2 mt-4">
              <Button variant="primary" icon="box">{COPY.editNext}</Button>
              <Button variant="secondary" icon="plus" fullWidth={false} className="px-4">{COPY.add}</Button>
            </div>
          </div>
        </div>

        {/* Billing */}
        <div className="mb-5">
          <Card>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <Eyebrow>{COPY.billingEyebrow}</Eyebrow>
              <span
                className="text-lg font-black"
                style={{ color: ACCENT, fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}
              >
                {gbp(PLAN.monthly)}/mo
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-2)] leading-relaxed">{COPY.billingBody}</p>

            <div className="mt-4 rounded-xl p-4" style={{ background: GLASS.raised, border: `1px solid ${GLASS.hairline}` }}>
              <MoneyRow
                label={COPY.nextChargeLabel}
                value={gbp(PLAN.nextCharge.amount)}
                color={ACCENT}
                strong
                sub={PLAN.nextCharge.dateLabel}
              />
            </div>

            <p className="text-[11px] text-[var(--color-muted)] mt-3">{COPY.settlement}</p>
          </Card>
        </div>

        {/* Your stack */}
        <div className="flex items-end justify-between gap-3 mt-8 mb-3">
          <div>
            <Eyebrow>{COPY.stackEyebrow}</Eyebrow>
            <p className="text-xs font-semibold text-[var(--color-text-2)] mt-1">{COPY.stackSub}</p>
          </div>
          <Button variant="secondary" size="sm" icon="plus">{COPY.addProduct}</Button>
        </div>

        <div className="space-y-3">
          {PLAN.lines.map((line) => (
            <div
              key={line.id}
              className="rounded-2xl overflow-hidden"
              style={{ background: GLASS.surface, border: `1px solid ${GLASS.hairline}` }}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <Chip color={ACCENT}>{line.slot}</Chip>
                  <StatusBadge label={line.status.label} icon="bolt" tone={line.status.tone} />
                </div>

                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <span
                      className="w-14 h-14 rounded-xl flex items-center justify-center"
                      style={{ background: GLASS.raised, border: `1px solid ${GLASS.hairline}`, color: 'var(--color-muted)' }}
                    >
                      <Icon name="capsule" size={24} />
                    </span>
                    {line.progress != null && (
                      <div className="absolute -bottom-1.5 -right-1.5">
                        <ProgressRing pct={line.progress} size={26} stroke={2.5} color={toneColor('building')} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[15px] font-medium text-[var(--color-text)] leading-snug"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {line.title}
                    </p>
                    <p className="text-xs text-[var(--color-muted)] mt-0.5">{line.variant}</p>
                    <p className="text-xs text-[var(--color-text-2)] mt-1">{line.cadence}</p>
                  </div>

                  <span
                    className="text-sm font-black shrink-0"
                    style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
                  >
                    {gbp(line.price)}
                  </span>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button variant="secondary" size="sm">{COPY.change}</Button>
                  <Button variant="ghost" size="sm">{COPY.manage}</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
