'use client'

import { useState } from 'react'
import { FulfilmentQueue } from '@/components/portal/FulfilmentQueue'
import type { QueueKind } from '@/lib/orders/queue'
import { Button } from '@/components/system'

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
        <h2 className="text-lg font-black" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          Daily review queue
        </h2>
        <p className="text-sm text-[var(--ink-3)] mt-0.5">{active.blurb}</p>
        <p className="text-[11px] text-[var(--ink-3)] mt-1">
          Nothing is ordered from PowerBody until you approve it — including subscription renewals.
        </p>
      </div>

      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <Button
            key={t.value}
            size="sm"
            variant={tab === t.value ? 'primary' : 'secondary'}
            aria-pressed={tab === t.value}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {/* Remounting on tab change is deliberate: each queue has its own selection
          and a checkbox carried across tabs would approve the wrong order. */}
      <FulfilmentQueue key={tab} kind={tab === 'all' ? undefined : tab} />
    </div>
  )
}
