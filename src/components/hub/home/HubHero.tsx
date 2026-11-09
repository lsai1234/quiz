'use client'

import Link from 'next/link'
import { Badge, Card, buttonSurface } from '@/components/system'
import { HUB_COPY as C } from '@/lib/hub/copy'
import type { HubHome } from '@/lib/hub/home-types'
import { body, meta, Ring } from './ui'

/**
 * The top of the hub: who they are, and how long their hub is open, drawn as
 * a ring of the 90 days. A running plan shows a full ring; a closed hub says
 * so and offers the way back in.
 */
export function HubHero({ home, name }: { home: HubHome; name: string | null }) {
  const a = home.access
  const hour = new Date().getHours()
  const first = home.firstName ?? (name ? name.trim().split(/\s+/)[0] : null)
  const open = a.state === 'subscriber' || a.state === 'member'
  const value = a.state === 'subscriber' ? 1 : a.state === 'member' ? (a.daysLeft ?? 0) / 90 : 0
  const cta = buttonSurface('primary', 'md')

  return (
    <div data-hub-hero>
      <Card padding="roomy" glow={open ? 'accent' : undefined}>
        <div className="flex items-center justify-between" style={{ gap: 'var(--space-4)' }}>
          <div className="min-w-0">
            <p
              style={{
                ...meta,
                color: 'var(--accent)',
                fontWeight: 'var(--weight-strong)',
                letterSpacing: 'var(--tracking-eyebrow)',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-micro)',
              }}
            >
              {C.hubName}
            </p>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-display)',
                fontWeight: 'var(--weight-strong)',
                letterSpacing: 'var(--tracking-display)',
                lineHeight: 'var(--leading-tight)',
                color: 'var(--ink-1)',
                marginTop: 'var(--space-2)',
              }}
            >
              {C.greeting(hour, first)}
            </h1>
            {home.guide?.stackName && <p style={{ ...body, marginTop: 'var(--space-1)' }}>{home.guide.stackName}</p>}
            <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
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
              {a.state === 'ended' && <Badge tone="attention">{C.endedTitle}</Badge>}
            </div>
            {open && <p style={{ ...meta, marginTop: 'var(--space-2)' }}>{a.state === 'subscriber' ? (a.plan === 'active' || a.plan === 'paused' ? C.monthlyKeeps : C.membershipKeeps) : C.anyOrderAdds}</p>}
          </div>
          {open && (
            <Ring value={value} size={96} stroke={8} label={a.state === 'member' && a.daysLeft != null ? C.memberFor(a.daysLeft) : C.memberMonthly}>
              <span className="hub-figure" style={{ fontSize: 'var(--text-title)', color: 'var(--ink-1)' }}>
                {a.state === 'member' ? a.daysLeft : '∞'}
              </span>
              <span style={{ ...meta, fontSize: 'var(--text-micro)' }}>{a.state === 'member' ? C.daysWord : C.monthlyWord}</span>
            </Ring>
          )}
        </div>
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
      </Card>
    </div>
  )
}
