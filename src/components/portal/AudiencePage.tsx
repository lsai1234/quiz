'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Input, Select } from '@/components/system'
import { BroadcastComposer } from './BroadcastComposer'
import type { AudienceMember, LeadSource } from '@/lib/audience/types'

/**
 * Founders Hub → Audience: who has given us an email address.
 *
 * Two numbers matter more than the list, so they come first: how many addresses
 * exist, and how many of those we may actually email. Those are different
 * numbers — an address collected without a tick is a lead we may not market to —
 * and a page that showed only the total would be quietly inviting somebody to
 * paste it all into a mail merge.
 *
 * Which is why the export button says what it will hand over, and why the
 * withheld count is on screen rather than in a tooltip.
 */

const SOURCE_LABEL: Record<LeadSource, string> = {
  'quiz-reveal': 'Quiz — the reveal',
  'quiz-build': 'Quiz — build screen',
  checkout: 'Checkout',
  manual: 'Added by hand',
}

interface Payload {
  total: number
  marketable: number
  suppressed: number
  members: AudienceMember[]
}

function when(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card elevation={1} solid padding="normal">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">{label}</p>
      <p
        className="text-2xl font-black mt-1 tabular-nums"
        style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-[var(--ink-3)] mt-1">{hint}</p>}
    </Card>
  )
}

export function AudiencePage() {
  const [data, setData] = useState<Payload | null>(null)
  const [source, setSource] = useState('')
  const [search, setSearch] = useState('')
  const [marketableOnly, setMarketableOnly] = useState(false)

  const load = useCallback(() => {
    const params = new URLSearchParams()
    if (source) params.set('source', source)
    if (search.trim()) params.set('q', search.trim())
    if (marketableOnly) params.set('marketable', '1')

    fetch(`/api/portal/audience?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ total: 0, marketable: 0, suppressed: 0, members: [] }))
  }, [source, search, marketableOnly])

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  const exportHref = () => {
    const params = new URLSearchParams()
    if (source) params.set('source', source)
    if (search.trim()) params.set('q', search.trim())
    return `/api/portal/audience/export?${params}`
  }

  if (!data) return <p className="text-sm text-[var(--ink-3)]">Loading…</p>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-black mb-1" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          Audience
        </h2>
        <p className="text-sm text-[var(--ink-3)]">
          Everyone who has given us an email address, and whether we may write to them.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Addresses" value={data.total} />
        <Stat label="You may email" value={data.marketable} hint="Opted in, not since stopped" />
        <Stat label="Opted out" value={data.suppressed} hint="Never in an export" />
        <Stat label="Customers" value={data.members.filter((m) => m.userId != null).length} hint="Have an account" />
      </div>

      <Card elevation={1} solid padding="normal">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem]">
            <Input
              label="Search"
              compact
              placeholder="Address or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-w-[11rem]">
            <Select
              label="Where from"
              compact
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">Anywhere</option>
              {Object.entries(SOURCE_LABEL).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </Select>
          </div>
          <Button
            variant={marketableOnly ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setMarketableOnly((v) => !v)}
          >
            {marketableOnly ? 'Showing emailable only' : 'Show emailable only'}
          </Button>
          <a href={exportHref()} download>
            <Button variant="secondary" size="sm" icon="download">
              Export {data.marketable} for sending
            </Button>
          </a>
        </div>
        <p className="text-[11px] text-[var(--ink-3)] mt-3">
          The export carries only addresses you may email, and gives every row its own unsubscribe
          link — so a campaign sent from Gmail or Mailchimp has a working way out, and the opt-outs
          come back here.
        </p>
      </Card>

      <BroadcastComposer />

      {data.members.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)] py-8 text-center">
          No addresses yet. They arrive from the quiz as people ask for their stack.
        </p>
      ) : (
        <div className="space-y-2">
          {data.members.map((member) => (
            <Card key={member.email} elevation={1} solid padding="normal" as="article">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--ink-1)' }}>
                    {member.email}
                  </p>
                  <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                    {member.firstName ? `${member.firstName} · ` : ''}
                    {SOURCE_LABEL[member.source] ?? member.source}
                    {member.primaryGoal ? ` · ${member.primaryGoal.replace(/-/g, ' ')}` : ''}
                    {` · joined ${when(member.firstSeenAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {member.userId && <Badge tone="info">Customer</Badge>}
                  {member.marketable ? (
                    <Badge tone="positive" dot>
                      {member.basis === 'soft-opt-in' ? 'Bought from us' : 'Opted in'}
                    </Badge>
                  ) : member.suppressedAt || member.optedInAt ? (
                    <Badge tone="attention">Opted out</Badge>
                  ) : (
                    <Badge tone="neutral">No permission</Badge>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
