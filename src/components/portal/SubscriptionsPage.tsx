'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { countdownTo, type SubscriptionHealth, type SubscriptionSummary } from '@/lib/changes/health'
import { formatGBP } from '@/lib/stack-blueprint/pricing'

const ACCENT = '#00D4FF'
const AMBER = '#fbbf24'
const GREEN = '#34d399'

const HEALTH: Record<SubscriptionHealth, { label: string; colour: string }> = {
  'requires-action': { label: 'Requires action', colour: AMBER },
  scheduled: { label: 'Scheduled', colour: ACCENT },
  healthy: { label: 'Healthy', colour: GREEN },
}

interface Payload {
  count: number
  requiresAction: number
  monthlyRevenue: number
  subscriptions: SubscriptionSummary[]
}

export function SubscriptionsPage() {
  const [data, setData] = useState<Payload | null>(null)

  useEffect(() => {
    fetch('/api/portal/subscriptions')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ count: 0, requiresAction: 0, monthlyRevenue: 0, subscriptions: [] }))
  }, [])

  if (!data) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-black mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Subscriptions
        </h2>
        <p className="text-sm text-[var(--color-muted)]">
          {data.count} member{data.count === 1 ? '' : 's'} · {formatGBP(data.monthlyRevenue)}/mo recurring
          {data.requiresAction > 0 && ` · ${data.requiresAction} needing attention`}
        </p>
      </div>

      {data.subscriptions.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)] py-8 text-center">No active subscriptions yet.</p>
      ) : (
        <div className="space-y-2">
          {data.subscriptions.map((s) => (
            <Link
              key={s.userId}
              href={`/portal/commerce/subscriptions/${s.userId}`}
              className="block rounded-2xl border p-4 transition-colors hover:border-[var(--color-border-2)]"
              style={{
                background: 'var(--color-surface)',
                borderColor:
                  s.health === 'requires-action'
                    ? `color-mix(in srgb, ${AMBER} 35%, transparent)`
                    : 'var(--color-border)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>
                    {s.email}
                  </p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                    {formatGBP(s.flatMonthly)}/mo · {s.lineCount} product{s.lineCount === 1 ? '' : 's'} ·{' '}
                    {s.defaultChangePolicy === 'remove' ? 'removes on outage' : 'swaps on outage'}
                    {s.overriddenLines > 0 && ` (${s.overriddenLines} set individually)`}
                  </p>
                  {s.health === 'requires-action' && s.nextAutoApplyAt && (
                    <p className="text-[11px] mt-1" style={{ color: AMBER }}>
                      {s.openCount} open · applies {countdownTo(s.nextAutoApplyAt)} without you
                    </p>
                  )}
                </div>
                <span
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{
                    color: HEALTH[s.health].colour,
                    background: `color-mix(in srgb, ${HEALTH[s.health].colour} 14%, transparent)`,
                  }}
                >
                  {HEALTH[s.health].label}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
