'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { countdownTo, type SubscriptionHealth, type SubscriptionSummary } from '@/lib/changes/health'
import { formatGBP } from '@/lib/stack-blueprint/pricing'


const HEALTH: Record<SubscriptionHealth, { label: string; colour: string }> = {
  'requires-action': { label: 'Requires action', colour: 'var(--tone-attention)' },
  scheduled: { label: 'Scheduled', colour: 'var(--accent)' },
  healthy: { label: 'Healthy', colour: 'var(--tone-positive)' },
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

  if (!data) return <p className="text-sm text-[var(--ink-3)]">Loading…</p>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-black mb-1" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          Subscriptions
        </h2>
        <p className="text-sm text-[var(--ink-3)]">
          {data.count} member{data.count === 1 ? '' : 's'} · {formatGBP(data.monthlyRevenue)}/mo recurring
          {data.requiresAction > 0 && ` · ${data.requiresAction} needing attention`}
        </p>
      </div>

      {data.subscriptions.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)] py-8 text-center">No active subscriptions yet.</p>
      ) : (
        <div className="space-y-2">
          {data.subscriptions.map((s) => (
            <Link
              key={s.userId}
              href={`/founderhub/commerce/subscriptions/${s.userId}`}
              className="block rounded-2xl border p-4 transition-colors hover:border-[var(--edge-strong)]"
              style={{
                background: 'var(--surface-1)',
                borderColor:
                  s.health === 'requires-action'
                    ? `var(--attention-line)`
                    : 'var(--edge)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--ink-1)] truncate" style={{ fontFamily: 'var(--font-display)' }}>
                    {s.email}
                  </p>
                  <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                    {formatGBP(s.flatMonthly)}/mo · {s.lineCount} product{s.lineCount === 1 ? '' : 's'} ·{' '}
                    {s.defaultChangePolicy === 'remove' ? 'removes on outage' : 'swaps on outage'}
                    {s.overriddenLines > 0 && ` (${s.overriddenLines} set individually)`}
                  </p>
                  {s.health === 'requires-action' && s.nextAutoApplyAt && (
                    <p className="text-[11px] mt-1" style={{ color: 'var(--tone-attention)' }}>
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
