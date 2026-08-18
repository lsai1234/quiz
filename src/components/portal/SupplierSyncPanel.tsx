'use client'

import { useCallback, useEffect, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Button } from '@/components/system'


interface Change {
  productId: string
  title: string
  sku: string
  wasInStock?: boolean
  nowInStock?: boolean
  costWas?: number
  costNow?: number
  costDeltaPct?: number
  marginPctWas?: number
  marginPctNow?: number
  belowFloor?: boolean
}

interface Report {
  at: string
  source: string
  scanned: number
  updated: number
  missing: string[]
  changes: Change[]
}

const money = (n: number) => `£${n.toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 100)}%`
const signedPct = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`

function when(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'less than an hour ago'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/**
 * What the supplier changed under us.
 *
 * The daily job re-checks every imported product's cost and stock against
 * PowerBody. Cost moves are the ones worth a founder's attention: we hold our
 * retail price steady on purpose — repricing goes through the change-review
 * flow, not a nightly sync — so a supplier increase comes straight out of
 * margin, and this is where you find out before the month's numbers do.
 */
export function SupplierSyncPanel() {
  const [report, setReport] = useState<Report | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/portal/supplier-sync')
      .then((r) => r.json())
      .then((d) => setReport(d.report ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  useEffect(load, [load])

  async function runNow() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/supplier-sync', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.ok === false) {
        setError(d.error ?? 'Sync failed.')
        return
      }
      setReport(d)
      // Stock and cost may have moved — let the shop and quiz re-read.
      invalidateCatalogue()
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return null

  const priceMoves = (report?.changes ?? []).filter((c) => c.costNow != null)
  const stockFlips = (report?.changes ?? []).filter((c) => c.nowInStock != null)
  const squeezed = priceMoves.filter((c) => c.belowFloor)

  return (
    <section
      className="rounded-2xl border p-4 space-y-3"
      style={{ background: 'var(--surface-1)', borderColor: 'var(--edge)' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
            Supplier check
          </h2>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
            {report
              ? `Last run ${when(report.at)} · ${report.scanned} product${report.scanned === 1 ? '' : 's'} checked${
                  report.source === 'mock' ? ' (mock supplier)' : ''
                }`
              : 'Has not run yet. It runs nightly, or check now.'}
          </p>
        </div>
        <Button size="sm" loading={busy} onClick={runNow}>
          Check now
        </Button>
      </div>

      {error && (
        <p role="status" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--tone-critical)' }}>
          {error}
        </p>
      )}

      {report && report.updated === 0 && report.missing.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--tone-positive)' }}>
          Nothing moved — every product is at the price and stock we already had.
        </p>
      )}

      {squeezed.length > 0 && (
        <p
          className="text-xs rounded-xl px-3 py-2 leading-relaxed"
          style={{
            background: `var(--critical-fill)`,
            border: `1px solid var(--critical-line)`,
            color: 'var(--tone-critical)',
          }}
        >
          <strong>
            {squeezed.length} product{squeezed.length === 1 ? '' : 's'} now below the margin floor.
          </strong>{' '}
          The supplier put their cost up and our retail price has not moved. Reprice {squeezed.length === 1 ? 'it' : 'them'}{' '}
          in Pricing, or drop {squeezed.length === 1 ? 'it' : 'them'} from the catalogue.
        </p>
      )}

      {priceMoves.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase text-[var(--ink-3)]">
            Cost changes ({priceMoves.length})
          </p>
          {priceMoves.map((c) => (
            <div
              key={c.productId}
              className="rounded-xl border px-3 py-2 flex items-center justify-between gap-3"
              style={{ background: 'var(--surface-2)', borderColor: c.belowFloor ? `var(--critical-line)` : 'var(--edge)' }}
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--ink-1)] truncate">{c.title}</p>
                <p className="text-[11px] text-[var(--ink-3)]">{c.sku}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-[var(--ink-2)]">
                  {c.costWas != null ? money(c.costWas) : '—'} → <strong>{money(c.costNow!)}</strong>
                  {c.costDeltaPct != null && (
                    <span style={{ color: c.costDeltaPct > 0 ? 'var(--tone-critical)' : 'var(--tone-positive)' }}> {signedPct(c.costDeltaPct)}</span>
                  )}
                </p>
                {c.marginPctNow != null && (
                  <p className="text-[11px]" style={{ color: c.belowFloor ? 'var(--tone-critical)' : 'var(--ink-3)' }}>
                    margin {c.marginPctWas != null ? `${pct(c.marginPctWas)} → ` : ''}
                    {pct(c.marginPctNow)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {stockFlips.length > 0 && (
        <p className="text-xs text-[var(--ink-2)]">
          <span style={{ color: 'var(--tone-attention)' }}>
            {stockFlips.filter((c) => c.nowInStock === false).length} went out of stock
          </span>
          {' · '}
          <span style={{ color: 'var(--tone-positive)' }}>
            {stockFlips.filter((c) => c.nowInStock === true).length} came back
          </span>
        </p>
      )}

      {report && report.missing.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--tone-attention)' }}>
          <strong>{report.missing.length} product{report.missing.length === 1 ? '' : 's'} no longer in the feed.</strong>{' '}
          PowerBody have most likely delisted {report.missing.length === 1 ? 'it' : 'them'} — worth removing from the
          catalogue.
        </p>
      )}
    </section>
  )
}
