'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Button, Note, buttonSurface } from '@/components/system'

interface Renamed {
  productId: string
  from: string
  to: string
  flavours: Record<string, string>
}

interface Scan {
  products: Renamed[]
  total: number
  renamed: number
  flavours: number
}

/**
 * Products named after one of their own flavours.
 *
 * ── Why this is beside the other name panel and not inside it ───────────────
 * They repair different damage from different sources. "Flavour names" asks
 * PowerBody what a SKU is called, because it exists for rows that have no name
 * at all — the "P45757" in a picker. This one asks nobody: it is for names that
 * are all present, all correct as supplier names, and on the wrong rows.
 *
 *   Protein Bars, Caramel Chaos - 12 x 60g       ← the product
 *     ├ Protein Bars                             ← the product's name, on a row
 *     ├ Bars, Chocolate Chip Cookie Dough - …
 *     └ Protein Bars, Dark Chocolate Mint - …
 *
 * The title opens with one of its own rows and then keeps going, so that row is
 * wearing the product's name and the title is carrying that row's flavour.
 * Provable from what we already hold — which is why this one cannot time out,
 * cannot half-fail, and does the whole catalogue in a single press.
 *
 * Silent when there is nothing to fix. A panel that says "0 products" every day
 * is a panel people stop reading.
 */
export function NameOrderRepairPanel() {
  const [scan, setScan] = useState<Scan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Scan | null>(null)

  const load = useCallback(() => {
    fetch('/api/portal/products/repair-names')
      .then((r) => r.json())
      .then((d) => setScan(Array.isArray(d.products) ? d : null))
      .catch(() => {})
  }, [])

  useEffect(load, [load])

  async function run() {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch('/api/portal/products/repair-names', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.ok === false) {
        setError(d.error ?? `That did not go through (HTTP ${res.status}).`)
        return
      }
      setDone({ products: d.repaired ?? [], total: d.total, renamed: d.renamed, flavours: d.flavours })
      // The shop, the product page and the variant picker all read these.
      invalidateCatalogue()
      load()
    } catch {
      setError('Unable to reach the server.')
    } finally {
      setBusy(false)
    }
  }

  if (!scan || (scan.total === 0 && !done)) return null

  return (
    <section
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--edge)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        display: 'grid',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <div>
          <h2
            style={{
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-strong)',
              fontFamily: 'var(--font-display)',
              color: 'var(--ink-1)',
            }}
          >
            Products named after one of their flavours
          </h2>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
            {scan.total === 0
              ? 'Every product is named after itself. Nothing left to put right.'
              : [
                  scan.renamed > 0
                    ? `${scan.renamed} product${scan.renamed === 1 ? ' is' : 's are'} wearing a flavour’s name.`
                    : null,
                  scan.flavours > 0
                    ? `${scan.flavours} flavour label${scan.flavours === 1 ? '' : 's'} repeat the product’s name.`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
          </p>
        </div>
        {scan.total > 0 && (
          <Button size="sm" loading={busy} disabled={busy} onClick={() => void run()}>
            Put {scan.total} product{scan.total === 1 ? '' : 's'} right
          </Button>
        )}
      </div>

      {scan.total > 0 && !busy && (
        <Note tone="attention">
          Import took the row&rsquo;s MAIN SKU&rsquo;s name for the whole product, and a main SKU is one flavour
          of it — so &ldquo;Protein Bars, Caramel Chaos - 12 x 60g&rdquo; became the product, with &ldquo;Protein
          Bars&rdquo; sitting under it as a flavour. This puts both ends back: the product takes the name its
          flavours share, and the row that was wearing it takes the flavour the title was carrying. Every other
          row stops repeating the product&rsquo;s name.
          <br />
          <br />
          It reads nothing from PowerBody — the evidence is in the names we already hold — so it cannot time out
          or finish halfway, and it is safe to re-run. The web address never changes.
        </Note>
      )}

      {scan.products.length > 0 && !done && (
        <ul style={{ display: 'grid', gap: 'var(--space-1)', margin: 0, padding: 0, listStyle: 'none' }}>
          {scan.products.slice(0, 8).map((p) => (
            <li key={p.productId} style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', overflowWrap: 'anywhere' }}>
              <Link href={`/founderhub/products/dashboard/${p.productId}`} style={{ color: 'var(--accent)' }}>
                {p.from}
              </Link>
              {p.from !== p.to ? ` → ${p.to}` : ''}
              {Object.keys(p.flavours).length > 0
                ? ` · ${Object.keys(p.flavours).length} flavour${Object.keys(p.flavours).length === 1 ? '' : 's'} trimmed`
                : ''}
            </li>
          ))}
          {scan.products.length > 8 && (
            <li style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
              …and {scan.products.length - 8} more.
            </li>
          )}
        </ul>
      )}

      {done && (
        <Note tone="positive" live="polite">
          {done.total === 0
            ? 'Nothing needed changing.'
            : `${done.renamed} product${done.renamed === 1 ? '' : 's'} renamed, ${done.flavours} flavour label${done.flavours === 1 ? '' : 's'} trimmed.`}
          {done.products.length > 0 && (
            <>
              {' '}
              <Link href="/founderhub/products/dashboard" {...buttonSurface('ghost', 'sm')}>
                Check them on the dashboard
              </Link>
            </>
          )}
        </Note>
      )}

      {error && (
        <Note tone="critical" live="assertive">
          {error}
        </Note>
      )}
    </section>
  )
}
