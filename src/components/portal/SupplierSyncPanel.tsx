'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Button, Card, Note } from '@/components/system'
import { ProductLink, useProductIndex } from '@/components/portal/fixups/product-index'
import type { FixupPanelProps } from '@/components/portal/fixups/types'
import { SUPPLIER_SETTINGS_HREF } from '@/lib/portal/product-links'

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

const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' } as const
const LINK = { color: 'var(--accent)', fontWeight: 'var(--weight-strong)', textDecoration: 'underline', textUnderlineOffset: '0.2em' } as const
const EYEBROW = { fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-strong)', textTransform: 'uppercase', color: 'var(--ink-3)' } as const

function when(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'less than an hour ago'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** How many products' names to list before folding the rest into a count. */
const LISTED = 12

/**
 * What the supplier changed under us.
 *
 * The daily job re-checks every imported product's cost and stock against
 * PowerBody. Cost moves are the ones worth a founder's attention: we hold our
 * retail price steady on purpose — repricing goes through the change-review
 * flow, not a nightly sync — so a supplier increase comes straight out of
 * margin, and this is where you find out before the month's numbers do.
 *
 * ── "Not reached", not "delisted" ───────────────────────────────────────────
 * PowerBody's product list stops part-way through their range, and a product
 * past that point is only checked if we hold its product id. One with neither
 * comes back unmatched — which this panel used to call "no longer in the feed …
 * most likely delisted, worth removing". For most of them that was simply
 * false, and it pointed the founder at deleting products that were fine. So it
 * says what is known: they were not reached this time. The fix is to give them
 * an id (a pull from PowerBody on the product's page finds it), after which the
 * next check reaches them — and if PowerBody really have dropped one, that pull
 * is what will say so.
 */
export function SupplierSyncPanel({ onSummary, onRunningChange }: FixupPanelProps) {
  const index = useProductIndex()
  const [report, setReport] = useState<Report | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** What went wrong with "Check now", and whether the supplier checks are the way on. */
  const [error, setError] = useState<{ text: string; checks: boolean } | null>(null)
  const [allMissing, setAllMissing] = useState(false)

  const load = useCallback(() => {
    setLoadError(null)
    fetch('/api/portal/supplier-sync', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => null)
        if (r.ok && d) setReport(d.report ?? null)
        else setLoadError(d?.error ?? `The server answered with an error (HTTP ${r.status}).`)
      })
      .catch(() => setLoadError('Could not reach the server — check the connection.'))
      .finally(() => setLoaded(true))
  }, [])

  useEffect(load, [load])
  useEffect(() => onRunningChange?.(busy), [busy, onRunningChange])

  const priceMoves = (report?.changes ?? []).filter((c) => c.costNow != null)
  const stockFlips = (report?.changes ?? []).filter((c) => c.nowInStock != null)
  const squeezed = priceMoves.filter((c) => c.belowFloor)
  const missing = report?.missing ?? []

  useEffect(() => {
    if (!onSummary) return
    if (loadError) return onSummary({ count: null, line: 'Could not read the last check — see inside.' })
    if (!loaded) return onSummary({ count: null, line: 'Reading the last check…' })
    if (!report) return onSummary({ count: 0, line: 'Has not run yet. It runs nightly, or check now.' })
    const bits = [
      `Last run ${when(report.at)}, ${report.scanned} product${report.scanned === 1 ? '' : 's'} checked`,
      priceMoves.length ? `${priceMoves.length} cost change${priceMoves.length === 1 ? '' : 's'}` : null,
      squeezed.length ? `${squeezed.length} below the margin floor` : null,
      missing.length ? `${missing.length} not reached` : null,
    ].filter(Boolean)
    onSummary({ count: squeezed.length + missing.length, line: `${bits.join(' · ')}.` })
  }, [onSummary, loaded, loadError, report, priceMoves.length, squeezed.length, missing.length])

  async function runNow() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/supplier-sync', { method: 'POST' })
      const d = await res.json().catch(() => null)
      if (res.status === 401) {
        setError({ text: 'Your session has expired, so the check did not run. Sign in again, then check now.', checks: false })
        return
      }
      if (!res.ok || !d || d.ok === false) {
        setError(
          d?.error
            ? { text: `The check did not finish: ${d.error} Nothing was changed by it.`, checks: true }
            : {
                text: `The check did not come back (HTTP ${res.status}) — most likely PowerBody were slow and it ran out of time. Nothing was changed by it; try again in a few minutes.`,
                checks: true,
              },
        )
        return
      }
      setReport(d)
      // Stock and cost may have moved — let the shop and quiz re-read.
      invalidateCatalogue()
    } catch {
      setError({ text: 'Could not reach the server — check the connection, then try again.', checks: false })
    } finally {
      setBusy(false)
    }
  }

  const titleOf = (id: string) => index.byId.get(id)?.product.title ?? id

  if (loadError) {
    return (
      <Note tone="critical">
        The last supplier check could not be read: {loadError}{' '}
        <Button size="sm" variant="ghost" icon="refresh" onClick={load}>
          Try again
        </Button>
      </Note>
    )
  }
  if (!loaded) return <p style={META}>Reading the last check…</p>

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--space-2)' }}>
        <p style={{ ...META, color: 'var(--ink-2)' }}>
          {report
            ? `Last run ${when(report.at)} · ${report.scanned} product${report.scanned === 1 ? '' : 's'} checked${
                report.source === 'mock' ? ' (sample supplier — nothing was asked of PowerBody)' : ''
              }`
            : 'Has not run yet. It runs nightly, or check now.'}
        </p>
        <Button size="sm" variant="primary" icon="refresh" loading={busy} onClick={() => void runNow()}>
          Check now
        </Button>
      </div>

      {busy && (
        <p style={{ ...META, color: 'var(--ink-2)' }} role="status">
          Reading PowerBody&rsquo;s stock and prices for every imported product — this can take a minute or two.
        </p>
      )}

      {error && (
        <Note tone="critical" live="assertive">
          {error.text}
          {error.checks && (
            <>
              {' '}
              <Link href={SUPPLIER_SETTINGS_HREF} style={LINK}>
                Run the checks
              </Link>{' '}
              to see what PowerBody are answering.
            </>
          )}
        </Note>
      )}

      {report && report.updated === 0 && missing.length === 0 && (
        <Note tone="positive">Nothing moved — every product is at the price and stock we already had.</Note>
      )}

      {squeezed.length > 0 && (
        <Note tone="critical" icon="alert-triangle">
          <strong>
            {squeezed.length} product{squeezed.length === 1 ? '' : 's'} now below the margin floor.
          </strong>{' '}
          PowerBody put their cost up and our retail price has not moved. Open {squeezed.length === 1 ? 'it' : 'each'} to
          reprice it on its page, or remove it from sale.
        </Note>
      )}

      {priceMoves.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <p style={EYEBROW}>Cost changes ({priceMoves.length})</p>
          <ul style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {priceMoves.map((c) => (
              <Card key={`${c.productId}:${c.sku}`} as="li" solid padding="tight" tone={c.belowFloor ? 'critical' : undefined}>
                <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
                  <div className="min-w-0">
                    <p style={{ fontSize: 'var(--text-body-sm)' }}>
                      <ProductLink id={c.productId} section="variants">
                        {c.title}
                      </ProductLink>
                    </p>
                    <p style={META}>{c.sku}</p>
                  </div>
                  <div className="shrink-0" style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)' }}>
                      {c.costWas != null ? money(c.costWas) : '—'} → <strong>{money(c.costNow!)}</strong>
                      {c.costDeltaPct != null && (
                        <span style={{ color: c.costDeltaPct > 0 ? 'var(--tone-critical)' : 'var(--tone-positive)' }}>
                          {' '}
                          {signedPct(c.costDeltaPct)}
                        </span>
                      )}
                    </p>
                    {c.marginPctNow != null && (
                      <p style={{ fontSize: 'var(--text-meta)', color: c.belowFloor ? 'var(--tone-critical)' : 'var(--ink-3)' }}>
                        margin {c.marginPctWas != null ? `${pct(c.marginPctWas)} → ` : ''}
                        {pct(c.marginPctNow)}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </ul>
        </div>
      )}

      {stockFlips.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <p style={EYEBROW}>Stock changes ({stockFlips.length})</p>
          <ul style={{ display: 'grid', gap: 'var(--space-1)' }}>
            {stockFlips.map((c) => (
              <li key={`${c.productId}:${c.sku}:stock`} style={META}>
                <ProductLink id={c.productId} section="variants">
                  {c.title}
                </ProductLink>{' '}
                ({c.sku}){' '}
                <span style={{ color: c.nowInStock ? 'var(--tone-positive)' : 'var(--tone-attention)' }}>
                  {c.nowInStock ? 'came back in stock' : 'went out of stock'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missing.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <Note tone="attention">
            <strong>
              {missing.length} product{missing.length === 1 ? ' was' : 's were'} not reached this time.
            </strong>{' '}
            PowerBody&rsquo;s product list stops part-way, and for {missing.length === 1 ? 'this one' : 'these'} we hold no
            PowerBody product id to ask by instead — so {missing.length === 1 ? 'its' : 'their'} stock and cost were not
            checked. That is not the same as being delisted. Open {missing.length === 1 ? 'it' : 'each'} and use{' '}
            <strong>Pull from PowerBody</strong>: it finds the id, after which every check reaches it — and if PowerBody
            really have dropped it, the pull says so.
          </Note>
          <ul style={{ display: 'grid', gap: 'var(--space-1)' }} aria-label="Not reached this time">
            {(allMissing ? missing : missing.slice(0, LISTED)).map((id) => (
              <li key={id} style={META}>
                <ProductLink id={id} section="supplier">
                  {titleOf(id)}
                </ProductLink>
              </li>
            ))}
          </ul>
          {missing.length > LISTED && (
            <div>
              <Button size="sm" variant="ghost" aria-expanded={allMissing} onClick={() => setAllMissing((v) => !v)}>
                {allMissing ? 'Show fewer' : `Show all ${missing.length}`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
