'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, EmptyState, Note, Skeleton } from '@/components/system'
import type { FeedbackAccess, MemberFeedback } from '@/lib/member-feedback/store'

/**
 * Settings → Member feedback: everything members wrote on the hub's feedback
 * page (`/myhub/feedback`), newest first.
 *
 * Each message says who sent it and where they were with us at the time (on a
 * plan, in their 90 days after an order, and so on), because "the calendar is
 * confusing" means something different from someone who has used it for six
 * months than from someone who signed up yesterday. Reply opens an email to
 * them. Messages that arrived since the inbox was last opened say "New".
 */

const ACCESS_LABEL: Record<FeedbackAccess, string> = {
  subscriber: 'On a plan',
  member: 'Bought recently',
  ended: 'Hub closed',
  none: 'No order yet',
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

type Loaded = { entries: MemberFeedback[]; seenAt: string | null; limit: number }

export function MemberFeedbackInbox() {
  const [data, setData] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const res = await fetch('/api/portal/member-feedback')
      if (!res.ok) throw new Error(String(res.status))
      setData((await res.json()) as Loaded)
      // Read up to now. The badges on screen keep the time from before this visit.
      void fetch('/api/portal/member-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seen: true }),
      }).catch(() => {})
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(entry: MemberFeedback) {
    if (!window.confirm('Delete this message? It can’t be brought back.')) return
    setRemoving(entry.id)
    try {
      const res = await fetch(`/api/portal/member-feedback?id=${encodeURIComponent(entry.id)}`, { method: 'DELETE' })
      if (res.ok) setData((d) => (d ? { ...d, entries: d.entries.filter((e) => e.id !== entry.id) } : d))
    } finally {
      setRemoving(null)
    }
  }

  if (failed) {
    return (
      <div style={{ display: 'grid', gap: 'var(--space-3)', justifyItems: 'start' }}>
        <Note tone="critical" live="assertive">The feedback didn’t load.</Note>
        <Button variant="secondary" size="sm" icon="refresh" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ display: 'grid', gap: 'var(--space-3)' }} aria-busy="true">
        <Skeleton width="100%" height="calc(var(--space-8) * 3)" radius="var(--radius-card)" />
        <Skeleton width="100%" height="calc(var(--space-8) * 3)" radius="var(--radius-card)" />
      </div>
    )
  }

  if (data.entries.length === 0) {
    return (
      <EmptyState icon="chat" title="Nothing yet">
        Members send feedback from their hub, with the “Tell us what you think” button at the bottom of the home. It will show up here.
      </EmptyState>
    )
  }

  const isNew = (e: MemberFeedback) => !data.seenAt || e.createdAt > data.seenAt
  const fresh = data.entries.filter(isNew).length

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }} data-feedback-inbox>
      <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }}>
        {data.entries.length} {data.entries.length === 1 ? 'message' : 'messages'}
        {fresh > 0 && ` · ${fresh} new since you last looked`}
        {data.entries.length >= data.limit && ` · showing the latest ${data.limit}`}
      </p>
      <ul style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {data.entries.map((e) => (
          <li key={e.id} data-feedback-entry>
            <Card padding="tight">
              <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                {isNew(e) && <Badge tone="accent">New</Badge>}
                <span style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
                  {e.name?.trim() || 'No name given'}
                </span>
                <Badge>{ACCESS_LABEL[e.access] ?? e.access}</Badge>
                <span style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginLeft: 'auto' }}>{when(e.createdAt)}</span>
              </div>
              <p style={{ fontSize: 'var(--text-body)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-1)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {e.text}
              </p>
              <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                {e.email && (
                  <a
                    href={`mailto:${e.email}?subject=${encodeURIComponent('Your feedback to CHRGD')}`}
                    className="system-focus"
                    style={{ fontSize: 'var(--text-meta)', color: 'var(--accent)', overflowWrap: 'anywhere' }}
                  >
                    Reply to {e.email}
                  </a>
                )}
                <Button variant="ghost" size="sm" icon="trash" loading={removing === e.id} onClick={() => void remove(e)} className="ml-auto">
                  Delete
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
