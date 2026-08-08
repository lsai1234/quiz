'use client'

import { useState } from 'react'
import { FulfilmentQueue } from '@/components/portal/FulfilmentQueue'
import type { QueueKind } from '@/lib/orders/queue'

const TABS: { value: QueueKind | 'all'; label: string; blurb: string }[] = [
  { value: 'all', label: 'Everything', blurb: 'Every paid order waiting on you, one-off and subscription.' },
  { value: 'one-off', label: 'Single orders', blurb: 'First-time and one-off purchases. Check the address is real and the items are in stock.' },
  { value: 'subscription', label: 'Subscriptions', blurb: 'This cycle’s renewals. Check nothing on the plan has gone out of stock or changed price.' },
]

/**
 * The daily supplier review.
 *
 * We do not ask PowerBody for anything until a founder has looked at it, so
 * every paid order lands here first and waits. Clearing this queue each day is
 * the job; approving is the confirmation, sending is the consequence.
 */
export default function QueuePage() {
  const [tab, setTab] = useState<QueueKind | 'all'>('all')
  const active = TABS.find((t) => t.value === tab)!

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Daily review queue
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-0.5">{active.blurb}</p>
        <p className="text-[11px] text-[var(--color-muted)] mt-1">
          Nothing is ordered from PowerBody until you approve it — including subscription renewals.
        </p>
      </div>

      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap"
            style={{
              background: tab === t.value ? 'var(--color-accent)' : 'var(--color-surface-2)',
              color: tab === t.value ? 'var(--color-bg)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Remounting on tab change is deliberate: each queue has its own selection
          and a checkbox carried across tabs would approve the wrong order. */}
      <FulfilmentQueue key={tab} kind={tab === 'all' ? undefined : tab} />
    </div>
  )
}
