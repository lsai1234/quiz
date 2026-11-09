'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card, Note, Skeleton } from '@/components/system'

/**
 * Settings → Test views → Every email: each one drawn with sample data, in a
 * frame of its own. Nothing is queued or sent.
 */
interface Row {
  template: string
  label: string
  subject: string
}

const HEADING = { fontSize: 'var(--text-title)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' } as const
const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' } as const

export function TestEmails() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    fetch('/api/portal/test-views/emails', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((r: Row[]) => setRows(r))
      .catch(() => setFailed(true))
  }, [])

  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }} data-test-emails>
      <p style={META}>
        <Link href="/founderhub/settings/test-views" style={{ textDecoration: 'underline' }}>
          ← Test views
        </Link>
      </p>
      {failed && <Note tone="critical">Could not draw the emails. Reload the page to try again.</Note>}
      {!rows && !failed && <Skeleton width="100%" height="calc(var(--space-8) * 4)" radius="var(--radius-card)" />}
      {rows?.map((r) => (
        <Card key={r.template} elevation={1}>
          <div style={{ display: 'grid', gap: 'var(--space-2)' }} data-test-email={r.template}>
            <h2 style={HEADING}>{r.label}</h2>
            <p style={META}>Subject: {r.subject}</p>
            <iframe
              title={r.label}
              src={`/api/portal/test-views/emails?template=${encodeURIComponent(r.template)}`}
              loading="lazy"
              style={{ width: '100%', height: 'calc(var(--space-8) * 14)', border: '1px solid var(--edge)', borderRadius: 'var(--radius-card)', background: 'var(--surface-1)' }}
            />
          </div>
        </Card>
      ))}
    </div>
  )
}
