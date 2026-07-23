'use client'

import { useCallback, useEffect, useState } from 'react'

const ACCENT = '#00D4FF'
const AMBER = '#fbbf24'

interface Exception {
  id: string
  customerEmail: string | null
  productTitle: string
  slotTitle: string
  sku: string | null
  allowSubstitution: boolean
  suggestedReplacementId: string | null
  suggestedReplacementTitle: string | null
}

export function StockAlerts() {
  const [exceptions, setExceptions] = useState<Exception[] | null>(null)
  const [running, setRunning] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [forceSku, setForceSku] = useState('')
  const [summary, setSummary] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/portal/stock-alerts').then((r) => r.json()).then((d) => setExceptions(d.exceptions ?? [])).catch(() => setExceptions([]))
  }, [])

  useEffect(() => { load() }, [load])

  const run = useCallback(async () => {
    setRunning(true)
    setSummary(null)
    const res = await fetch('/api/portal/stock-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forceSku.trim() ? { forceOosSku: forceSku.trim() } : {}),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      setExceptions(d.exceptions ?? [])
      setSummary(`Scanned ${d.scanned} active subscription${d.scanned === 1 ? '' : 's'} · ${d.outOfStock} SKU${d.outOfStock === 1 ? '' : 's'} out of stock · ${d.newExceptions} affected line${d.newExceptions === 1 ? '' : 's'}.`)
    }
    setRunning(false)
  }, [forceSku])

  const resolve = useCallback(async (id: string, action: string, replacementProductId?: string) => {
    setBusyId(id)
    const res = await fetch(`/api/portal/stock-alerts/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, replacementProductId }),
    })
    if (res.ok) setExceptions((prev) => (prev ?? []).filter((e) => e.id !== id))
    setBusyId(null)
  }, [])

  const btn = 'text-xs font-bold px-3 py-2 rounded-xl border disabled:opacity-40'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 justify-between">
        <div className="flex items-end gap-2">
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--color-muted)] block mb-1">Force a SKU out of stock (demo)</label>
            <input value={forceSku} onChange={(e) => setForceSku(e.target.value)} placeholder="e.g. ON-CREA-634"
              className="text-sm rounded-xl px-3 py-2 border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} />
          </div>
          <button onClick={run} disabled={running} className="text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-40" style={{ background: ACCENT, color: '#001018' }}>
            {running ? 'Checking…' : 'Run stock check'}
          </button>
        </div>
      </div>
      {summary && <p className="text-xs text-[var(--color-muted)]">{summary}</p>}

      {!exceptions ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : exceptions.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)] py-8 text-center">No stock alerts. Every active subscription&apos;s products are in stock.</p>
      ) : (
        <div className="space-y-2">
          {exceptions.map((e) => (
            <div key={e.id} className="rounded-2xl border p-4" style={{ background: 'var(--color-surface)', borderColor: `color-mix(in srgb, ${AMBER} 35%, transparent)` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{e.productTitle}</p>
                  <p className="text-[11px] text-[var(--color-muted)]">{e.slotTitle} · SKU {e.sku ?? '—'} · {e.customerEmail ?? 'member'}</p>
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: AMBER, background: `color-mix(in srgb, ${AMBER} 14%, transparent)` }}>Out of stock</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {e.allowSubstitution ? (
                  e.suggestedReplacementId ? (
                    <button onClick={() => resolve(e.id, 'substitute', e.suggestedReplacementId!)} disabled={busyId === e.id} className={btn} style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT }}>
                      Swap to {e.suggestedReplacementTitle}
                    </button>
                  ) : (
                    <span className="text-[11px] text-[var(--color-muted)] self-center">Member allows a swap, but nothing in the same category is in stock.</span>
                  )
                ) : (
                  <span className="text-[11px] self-center" style={{ color: AMBER }}>Member declined substitutions.</span>
                )}
                <button onClick={() => resolve(e.id, 'skip')} disabled={busyId === e.id} className={btn} style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}>Skip next box</button>
                <button onClick={() => resolve(e.id, 'notify')} disabled={busyId === e.id} className={btn} style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}>Notify member</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
