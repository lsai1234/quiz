'use client'

import { Badge, Button, Card, ChargeMeter, Ground } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import { COPY, PLAN, gbp } from './plan'

/**
 * The same screen, rebuilt on the design system.
 *
 * Same data, same copy, same order, same actions — `compare.test.tsx` asserts
 * the two arms render identical text. What differs is only the material: a lit
 * ground rather than flat black, three elevations rather than one, a specular
 * edge on every surface, a gradient primary with a bloom under it, and the
 * product status shown as a `ChargeMeter` where the old screen used a ring.
 *
 * Nothing is added that the old screen does not have. It would be easy to win
 * this comparison by writing better copy or surfacing more information here, and
 * that would make the result worthless.
 */

const TONE_MAP = {
  good: 'positive',
  building: 'accent',
  essential: 'info',
  review: 'attention',
} as const

export function AfterDashboard() {
  return (
    <Ground>
      <header
        className="sticky top-0 z-10"
        style={{
          background: 'var(--surface-2)',
          backdropFilter: 'blur(var(--blur-nav)) saturate(var(--blur-saturate))',
          WebkitBackdropFilter: 'blur(var(--blur-nav)) saturate(var(--blur-saturate))',
          borderBottom: '1px solid var(--edge)',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: '0 var(--gutter)', height: 'var(--space-8)', minHeight: 'var(--control-lg)', gap: 'var(--space-3)' }}
        >
          <span
            style={{
              fontSize: 'var(--text-lead)',
              fontWeight: 'var(--weight-display)',
              fontFamily: 'var(--font-display)',
              letterSpacing: 'var(--tracking-display)',
              color: 'var(--ink-1)',
            }}
          >
            CHRGD
          </span>
          <span style={{ color: 'var(--ink-3)' }}>
            <Icon name="log-out" size={18} />
          </span>
        </div>
      </header>

      <main style={{ padding: 'var(--space-6) var(--gutter) var(--space-8)' }}>
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <Eyebrow tone="var(--accent)">{COPY.eyebrow}</Eyebrow>
          <h1
            style={{
              fontSize: 'var(--text-display)',
              fontWeight: 'var(--weight-display)',
              fontFamily: 'var(--font-display)',
              letterSpacing: 'var(--tracking-display)',
              lineHeight: 'var(--leading-tight)',
              color: 'var(--ink-1)',
              marginTop: 'var(--space-2)',
            }}
          >
            {PLAN.greeting}
          </h1>
        </div>

        {/* Hero — next box. The one card on the screen that gets a bloom. */}
        <Card elevation={2} glow="accent" padding="roomy" className="mb-5">
          <div className="flex items-center" style={{ gap: 'var(--space-2)', color: 'var(--accent)' }}>
            <Icon name="truck" size={14} />
            <Eyebrow tone="var(--accent)">{COPY.nextEyebrow}</Eyebrow>
          </div>
          <p
            style={{
              fontSize: 'var(--text-display)',
              fontWeight: 'var(--weight-display)',
              fontFamily: 'var(--font-display)',
              letterSpacing: 'var(--tracking-display)',
              lineHeight: 'var(--leading-tight)',
              color: 'var(--ink-1)',
              marginTop: 'var(--space-2)',
            }}
          >
            {PLAN.nextBox.dateLabel}
          </p>

          <div className="flex items-center" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            {PLAN.nextBox.itemTitles.map((title) => (
              <span
                key={title}
                className="system-glass flex items-center justify-center shrink-0"
                style={{
                  width: 'var(--control-md)',
                  height: 'var(--control-md)',
                  borderRadius: 'var(--radius-row)',
                  background: 'var(--surface-3)',
                  border: '1px solid var(--edge)',
                  borderTopColor: 'var(--edge-top)',
                  color: 'var(--ink-2)',
                }}
              >
                <Icon name="capsule" size={18} />
              </span>
            ))}
          </div>
          <p
            style={{
              fontSize: 'var(--text-body-sm)',
              lineHeight: 'var(--leading-snug)',
              color: 'var(--ink-2)',
              marginTop: 'var(--space-3)',
            }}
          >
            {PLAN.nextBox.itemTitles.slice(0, 3).join(', ')} +{PLAN.nextBox.itemTitles.length - 3} more
          </p>

          <div className="flex" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-5)' }}>
            <Button variant="primary" icon="box" fullWidth>{COPY.editNext}</Button>
            <Button variant="secondary" icon="plus">{COPY.add}</Button>
          </div>
        </Card>

        {/* Billing */}
        <Card elevation={1} className="mb-5">
          <div className="flex items-baseline justify-between" style={{ gap: 'var(--space-3)' }}>
            <Eyebrow>{COPY.billingEyebrow}</Eyebrow>
            <span
              style={{
                fontSize: 'var(--text-title)',
                fontWeight: 'var(--weight-display)',
                fontFamily: 'var(--font-display)',
                letterSpacing: 'var(--tracking-title)',
                color: 'var(--accent)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {gbp(PLAN.monthly)}/mo
            </span>
          </div>
          <p
            style={{
              fontSize: 'var(--text-body-sm)',
              lineHeight: 'var(--leading-loose)',
              color: 'var(--ink-2)',
              marginTop: 'var(--space-2)',
            }}
          >
            {COPY.billingBody}
          </p>

          <div
            className="system-glass"
            style={{
              marginTop: 'var(--space-4)',
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-row)',
              background: 'var(--surface-2)',
              border: '1px solid var(--edge)',
              borderTopColor: 'var(--edge-top)',
            }}
          >
            {/* Label, then amount, then date — the same reading order as the
                control's `MoneyRow`, so `compare.test.tsx` can hold the two to
                identical text without the layouts having to be identical. */}
            <div className="flex items-baseline justify-between" style={{ gap: 'var(--space-3)' }}>
              <p
                style={{
                  fontSize: 'var(--text-body)',
                  fontWeight: 'var(--weight-strong)',
                  fontFamily: 'var(--font-display)',
                  color: 'var(--ink-1)',
                }}
              >
                {COPY.nextChargeLabel}
              </p>
              <span
                style={{
                  fontSize: 'var(--text-title)',
                  fontWeight: 'var(--weight-display)',
                  fontFamily: 'var(--font-display)',
                  letterSpacing: 'var(--tracking-title)',
                  color: 'var(--accent)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {gbp(PLAN.nextCharge.amount)}
              </span>
            </div>
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
              {PLAN.nextCharge.dateLabel}
            </p>
          </div>

          <p
            style={{
              fontSize: 'var(--text-meta)',
              lineHeight: 'var(--leading-loose)',
              color: 'var(--ink-3)',
              marginTop: 'var(--space-3)',
            }}
          >
            {COPY.settlement}
          </p>
        </Card>

        {/* Your stack */}
        <div
          className="flex items-end justify-between"
          style={{ gap: 'var(--space-3)', marginTop: 'var(--space-8)', marginBottom: 'var(--space-3)' }}
        >
          <div>
            <Eyebrow>{COPY.stackEyebrow}</Eyebrow>
            <p
              style={{
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-strong)',
                color: 'var(--ink-2)',
                marginTop: 'var(--space-1)',
              }}
            >
              {COPY.stackSub}
            </p>
          </div>
          <Button variant="secondary" size="sm" icon="plus">{COPY.addProduct}</Button>
        </div>

        <ul className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
          {PLAN.lines.map((line) => (
            <Card key={line.id} as="li" elevation={1} interactive>
              <div className="flex items-start justify-between" style={{ gap: 'var(--space-2)' }}>
                <Badge tone="accent">{line.slot}</Badge>
                <Badge tone={TONE_MAP[line.status.tone]} dot>{line.status.label}</Badge>
              </div>

              <div className="flex items-start" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <span
                  className="system-glass flex items-center justify-center shrink-0"
                  style={{
                    width: 'var(--control-lg)',
                    height: 'var(--control-lg)',
                    borderRadius: 'var(--radius-row)',
                    background: 'var(--surface-3)',
                    border: '1px solid var(--edge)',
                    borderTopColor: 'var(--edge-top)',
                    color: 'var(--ink-2)',
                  }}
                >
                  <Icon name="capsule" size={24} />
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    style={{
                      fontSize: 'var(--text-lead)',
                      fontWeight: 'var(--weight-strong)',
                      fontFamily: 'var(--font-display)',
                      letterSpacing: 'var(--tracking-title)',
                      lineHeight: 'var(--leading-snug)',
                      color: 'var(--ink-1)',
                    }}
                  >
                    {line.title}
                  </p>
                  <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
                    {line.variant}
                  </p>
                  <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)', marginTop: 'var(--space-1)' }}>
                    {line.cadence}
                  </p>
                </div>

                <span
                  className="shrink-0"
                  style={{
                    fontSize: 'var(--text-body)',
                    fontWeight: 'var(--weight-display)',
                    fontFamily: 'var(--font-display)',
                    color: 'var(--accent)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {gbp(line.price)}
                </span>
              </div>

              {/* The same information the old screen put in a 26px ring on the
                  corner of the thumbnail. `showValue` is off deliberately: the
                  ring carries no text, so neither can this, or the comparison
                  becomes "which screen tells you more" — which the new one would
                  win on content rather than on design. The label survives as the
                  accessible name. */}
              {line.progress != null && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <ChargeMeter value={line.progress} label="Building" size="sm" showValue={false} />
                </div>
              )}

              <div className="flex" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <Button variant="secondary" size="sm">{COPY.change}</Button>
                <Button variant="ghost" size="sm">{COPY.manage}</Button>
              </div>
            </Card>
          ))}
        </ul>
      </main>
    </Ground>
  )
}

/** The system has no `Eyebrow` primitive; this is the idiom, inline. */
function Eyebrow({ children, tone = 'var(--ink-3)' }: { children: React.ReactNode; tone?: string }) {
  return (
    <p
      style={{
        fontSize: 'var(--text-micro)',
        fontWeight: 'var(--weight-strong)',
        fontFamily: 'var(--font-display)',
        letterSpacing: 'var(--tracking-eyebrow)',
        textTransform: 'uppercase',
        color: tone,
      }}
    >
      {children}
    </p>
  )
}
