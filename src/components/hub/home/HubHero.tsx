'use client'

import Link from 'next/link'
import { Badge, Card, ChargeMeter, buttonSurface } from '@/components/system'
import { HUB_COPY as C } from '@/lib/hub/copy'
import type { HubHome } from '@/lib/hub/home-types'
import { body, eyebrow, meta } from './ui'

/**
 * The top of the hub: the day, a greeting, and their stack's name, set
 * straight on the ground so the first card on the page is the day's own
 * (`TodayCard`). Under it, the hub's pass: how long it's open, poured as a
 * meter of the 90 days for a one-off buyer. A closed hub says so and offers
 * the way back in.
 */
export function HubHero({ home, name }: { home: HubHome; name: string | null }) {
  const a = home.access
  const now = new Date()
  const first = home.firstName ?? (name ? name.trim().split(/\s+/)[0] : null)
  const open = a.state === 'subscriber' || a.state === 'member'
  const cta = buttonSurface('primary', 'md')
  const today = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div data-hub-hero style={{ paddingTop: 'var(--space-2)' }}>
      <p style={eyebrow}>{today}</p>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-hero)',
          fontWeight: 'var(--weight-strong)',
          letterSpacing: 'var(--tracking-display)',
          lineHeight: 'var(--leading-tight)',
          color: 'var(--ink-1)',
          marginTop: 'var(--space-2)',
        }}
      >
        {C.greeting(now.getHours(), first)}
      </h1>
      {home.guide?.stackName && <p style={{ ...body, fontSize: 'var(--text-body)', marginTop: 'var(--space-2)' }}>{home.guide.stackName}</p>}

      {open && (
        <div style={{ marginTop: 'var(--space-4)' }} data-hub-pass>
          <Card padding="tight" solid>
            <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2) var(--space-3)', padding: '0 var(--space-1)' }}>
              {a.state === 'subscriber' && (
                <Badge tone="accent" dot>
                  {a.plan === 'paused' ? C.memberPaused : a.plan === 'active' ? C.memberMonthly : a.hubPlan === 'active' ? C.memberHub : C.memberMonthly}
                </Badge>
              )}
              {a.state === 'member' && a.daysLeft != null && (
                <Badge tone="positive" dot>
                  {C.memberFor(a.daysLeft)}
                </Badge>
              )}
              <p style={{ ...meta, flex: 1, minWidth: 0 }}>
                {a.state === 'subscriber' ? (a.plan === 'active' || a.plan === 'paused' ? C.monthlyKeeps : C.membershipKeeps) : C.anyOrderAdds}
              </p>
            </div>
            {a.state === 'member' && a.daysLeft != null && (
              <div style={{ marginTop: 'var(--space-3)', padding: '0 var(--space-1) var(--space-1)' }}>
                <ChargeMeter value={(a.daysLeft / 90) * 100} label={C.memberFor(a.daysLeft)} showValue={false} tone="positive" size="sm" />
              </div>
            )}
          </Card>
        </div>
      )}

      {a.state === 'ended' && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Badge tone="attention">{C.endedTitle}</Badge>
        </div>
      )}
      {(a.state === 'ended' || a.state === 'none') && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <p style={body}>{a.state === 'ended' ? C.endedBody : C.noneBody}</p>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Link href="/" className={cta.className} style={cta.style}>
              {a.state === 'ended' ? C.endedCta : C.noneCta}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
