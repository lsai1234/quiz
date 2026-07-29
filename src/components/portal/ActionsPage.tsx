'use client'

import { useCallback, useEffect, useState } from 'react'
import { ActionQueue } from './ActionQueue'
import type { ChangeEvent } from '@/lib/changes/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

const ACCENT = '#00D4FF'

interface RunSummary {
  scanned: number
  outOfStock: number
  discontinued: number
  recovered: number
  raised: number
  applied: number
  cancelled: number
  baselineOnly: boolean
  dryRun: boolean
}

export function ActionsPage() {
  const [events, setEvents] = useState<ChangeEvent[] | null>(null)
  const [catalogue, setCatalogue] = useState<CatalogueProduct[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [forceSku, setForceSku] = useState('')

  const load = useCallback(() => {
    fetch('/api/portal/changes')
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .catch(() => setEvents([]))
  }, [])

  useEffect(() => {
    load()
    fetch('/api/catalogue')
      .then((r) => r.json())
      .then((d) => setCatalogue(d.products ?? []))
      .catch(() => {})
  }, [load])

  const run = useCallback(
    async (dryRun: boolean) => {
      setRunning(true)
      setSummary(null)
      const res = await fetch('/api/portal/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun, ...(forceSku.trim() ? { forceOosSku: forceSku.trim() } : {}) }),
      })
      const d: RunSummary & { events?: ChangeEvent[] } = await res.json().catch(() => ({}) as RunSummary)
      if (res.ok) {
        setEvents(d.events ?? [])
        setSummary(describeRun(d))
      }
      setRunning(false)
    },
    [forceSku],
  )

  const resolve = useCallback(
    async (id: string, action: string, replacementProductId?: string) => {
      setBusyId(id)
      const res = await fetch(`/api/portal/changes/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, replacementProductId }),
      })
      if (res.ok) {
        const d = await res.json()
        setSummary(d.notified > 0 ? 'Done — the member has been emailed.' : 'Done.')
        load()
      }
      setBusyId(null)
    },
    [load],
  )

  const bulk = useCallback(
    async (productId: string, action: string, replacementProductId?: string) => {
      setBusyId(productId)
      const res = await fetch('/api/portal/changes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, action, replacementProductId }),
      })
      if (res.ok) {
        const d = await res.json()
        setSummary(`Resolved for ${d.resolved} member${d.resolved === 1 ? '' : 's'} — all emailed.`)
        load()
      }
      setBusyId(null)
    },
    [load],
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Requires action
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          Products that have gone away or moved price on a live subscription. Each one already has an
          answer and a deadline — you&apos;re here to overrule it, not to unblock it.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2 justify-between">
        <div className="flex items-end gap-2">
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--color-muted)] block mb-1">
              Force a SKU out of stock (demo)
            </label>
            <input
              value={forceSku}
              onChange={(e) => setForceSku(e.target.value)}
              placeholder="e.g. ON-GOLD-WHEY-2270"
              className="text-sm rounded-xl px-3 py-2 border"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
          <button
            onClick={() => run(false)}
            disabled={running}
            className="text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-40"
            style={{ background: ACCENT, color: '#001018' }}
          >
            {running ? 'Checking…' : 'Run check'}
          </button>
          <button
            onClick={() => run(true)}
            disabled={running}
            className="text-xs font-bold px-4 py-2 rounded-xl border disabled:opacity-40"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}
            title="Compute and preview without writing anything"
          >
            Dry run
          </button>
        </div>
      </div>

      {summary && <p className="text-xs text-[var(--color-muted)]">{summary}</p>}

      {!events ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        <ActionQueue events={events} catalogue={catalogue} busyId={busyId} onResolve={resolve} onBulk={bulk} />
      )}
    </div>
  )
}

function describeRun(d: RunSummary): string {
  if (d.baselineOnly) {
    return 'First run — recorded a baseline of the supplier feed. Changes are detected from the next one.'
  }
  const parts = [
    `Scanned ${d.scanned} subscription${d.scanned === 1 ? '' : 's'}`,
    `${d.outOfStock} SKU${d.outOfStock === 1 ? '' : 's'} out of stock`,
    d.discontinued > 0 ? `${d.discontinued} discontinued` : null,
    d.recovered > 0 ? `${d.recovered} back in stock` : null,
    `${d.raised} affected line${d.raised === 1 ? '' : 's'}`,
    d.applied > 0 ? `${d.applied} resolved automatically` : null,
    d.cancelled > 0 ? `${d.cancelled} closed` : null,
  ].filter(Boolean)
  return `${d.dryRun ? 'Dry run · ' : ''}${parts.join(' · ')}.`
}
