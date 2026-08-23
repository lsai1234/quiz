'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Note } from '@/components/system'

/**
 * The line at the top of the hub that says something is wrong.
 *
 * A monitoring page only works if somebody opens it, and nobody opens a
 * monitoring page on a good day — which is precisely why the bad day goes
 * unnoticed for a fortnight. So the verdict is brought to the screen the founder
 * already lands on, and this is the only thing in the hub allowed to interrupt.
 *
 * It renders nothing when everything is fine. That is deliberate and it is what
 * keeps it worth reading: a permanent status widget showing a green tick becomes
 * furniture within a week, and then the day it turns red it is still furniture.
 */
export function HealthBanner() {
  const [summary, setSummary] = useState<{
    status: 'ok' | 'warn' | 'fail'
    failing: string[]
    warning: string[]
  } | null>(null)

  useEffect(() => {
    fetch('/api/portal/monitoring?summary=1')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setSummary)
      // A failure to fetch the health summary is not worth a banner of its own —
      // it would be a banner about the banner.
      .catch(() => {})
  }, [])

  if (!summary || summary.status === 'ok') return null

  const failing = summary.status === 'fail'
  const items = failing ? summary.failing : summary.warning

  return (
    <Note tone={failing ? 'critical' : 'attention'} icon="alert-triangle" live="polite">
      <strong>{failing ? 'Something needs attention.' : 'Worth a look.'}</strong>{' '}
      {items.slice(0, 3).join(' · ')}
      {items.length > 3 ? ` · and ${items.length - 3} more` : ''}.{' '}
      <Link
        href="/founderhub/monitoring"
        className="system-focus"
        style={{ color: 'inherit', fontWeight: 'var(--weight-strong)' }}
      >
        Open monitoring
      </Link>
    </Note>
  )
}
