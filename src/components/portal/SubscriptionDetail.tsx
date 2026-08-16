'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { BillingChange, MemberSubscription } from '@/lib/recharge/types'
import type { ChangeEvent } from '@/lib/changes/types'
import type { Notification } from '@/lib/notify/types'
import type { ConsentRecord } from '@/lib/legal/consent'


interface Payload {
  userId: string
  user: { email: string; name: string; createdAt: string } | null
  subscription: MemberSubscription
  linePolicies: Record<string, string>
  constraints: string | null
  billingHistory: BillingChange[]
  changes: ChangeEvent[]
  notifications: Notification[]
  consents: ConsentRecord[]
}

const date = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
        {title}
      </h2>
      {subtitle && <p className="text-[11px] text-[var(--ink-3)] mb-2">{subtitle}</p>}
      <div className="rounded-2xl border border-[var(--edge)] p-4" style={{ background: 'var(--surface-1)' }}>
        {children}
      </div>
    </section>
  )
}

export function SubscriptionDetail({ userId }: { userId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/portal/subscriptions/${userId}`)
      .then(async (r) => (r.ok ? setData(await r.json()) : setError((await r.json()).error ?? 'Not found')))
      .catch(() => setError('Could not load that member'))
  }, [userId])

  if (error) return <p className="text-sm text-[var(--ink-3)]">{error}</p>
  if (!data) return <p className="text-sm text-[var(--ink-3)]">Loading…</p>

  const sub = data.subscription

  return (
    <div className="space-y-6">
      <div>
        <Link href="/founderhub/commerce/subscriptions" className="text-[11px] font-semibold underline text-[var(--ink-3)]">
          ← All subscriptions
        </Link>
        <h1 className="text-2xl font-black mt-2 mb-1" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          {sub.customerEmail}
        </h1>
        <p className="text-sm text-[var(--ink-3)]">
          {formatGBP(sub.flatMonthly)}/mo · {sub.status} · since {date(sub.startedAt)}
          {data.constraints && ` · needs ${data.constraints} products`}
        </p>
      </div>

      <Section
        title="Their plan"
        subtitle="What happens to each product if it becomes unavailable — the member's own choice."
      >
        <div className="space-y-2">
          {sub.lines.map((line) => (
            <div key={line.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--ink-2)] truncate">{line.productTitle}</p>
                <p className="text-[11px] text-[var(--ink-3)]">
                  {line.slotTitle} · {formatGBP(line.pricePerDelivery)} every{' '}
                  {line.deliveryIntervalMonths === 1 ? 'month' : `${line.deliveryIntervalMonths} months`}
                </p>
              </div>
              <span className="text-[10px] font-bold uppercase whitespace-nowrap" style={{ color: 'var(--accent)' }}>
                {data.linePolicies[line.id] === 'remove' ? 'Remove' : 'Swap'}
                {line.changePolicy ? ' ·  set' : ''}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Changes" subtitle="Everything that has happened to their plan, and what we did about it.">
        {data.changes.length === 0 ? (
          <p className="text-xs text-[var(--ink-3)]">Nothing has changed on this plan.</p>
        ) : (
          <div className="space-y-3">
            {data.changes.map((c) => (
              <div key={c.id}>
                <p className="text-xs font-semibold text-[var(--ink-2)]">
                  {c.productTitle} · {c.kind}
                </p>
                <p className="text-[11px] text-[var(--ink-3)]">
                  {c.status} · {c.resolutionDetail ?? 'awaiting resolution'}
                  {c.resolutionSource ? ` · by ${c.resolutionSource}` : ''} · {date(c.resolvedAt ?? c.createdAt)}
                </p>
                {c.status === 'applied' && !c.notifiedAt && (
                  <p className="text-[11px]" style={{ color: 'var(--tone-attention)' }}>
                    Applied but the member hasn&apos;t been emailed yet.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Billing history" subtitle="Every move in what they pay, and why.">
        {data.billingHistory.length === 0 ? (
          <p className="text-xs text-[var(--ink-3)]">Their monthly hasn&apos;t changed since they joined.</p>
        ) : (
          <div className="space-y-2">
            {[...data.billingHistory].reverse().map((b) => (
              <div key={b.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[var(--ink-2)]">
                    {formatGBP(b.previousMonthly)} → {formatGBP(b.newMonthly)}
                  </p>
                  <p className="text-[11px] text-[var(--ink-3)]">
                    {b.reason} · from {date(b.effectiveFrom)}
                    {b.oneOffCredit ? ` · ${formatGBP(b.oneOffCredit)} credited` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="What we've told them" subtitle="Every email sent about their plan.">
        {data.notifications.length === 0 ? (
          <p className="text-xs text-[var(--ink-3)]">Nothing sent yet.</p>
        ) : (
          <div className="space-y-2">
            {data.notifications.map((n) => (
              <div key={n.id}>
                <p className="text-xs font-semibold text-[var(--ink-2)]">{n.rendered.subject}</p>
                <p className="text-[11px]" style={{ color: n.status === 'failed' ? 'var(--tone-attention)' : 'var(--ink-3)' }}>
                  {n.status} · {date(n.sentAt ?? n.createdAt)}
                  {n.error ? ` · ${n.error}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Consent" subtitle="What they agreed to, and when.">
        {data.consents.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--tone-attention)' }}>
            No consent on record — this plan predates consent capture.
          </p>
        ) : (
          <div className="space-y-2">
            {data.consents.map((c) => (
              <div key={c.id}>
                <p className="text-xs font-semibold text-[var(--ink-2)]">
                  {c.documents.map((d) => `${d.id} v${d.version}`).join(' · ')}
                </p>
                <p className="text-[11px] text-[var(--ink-3)]">
                  {c.context} · {date(c.acceptedAt)}
                  {c.ip ? ` · ${c.ip}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
