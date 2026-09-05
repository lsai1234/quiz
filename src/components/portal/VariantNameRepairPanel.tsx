'use client'

import { useCallback, useEffect, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Button, Note } from '@/components/system'

interface Candidate {
  productId: string
  title: string
  skus: string[]
}

interface Scan {
  products: Candidate[]
  total: number
  variants: number
}

interface Repair {
  productId: string
  title: string
  fixed: Record<string, string>
  unresolved: string[]
}

/**
 * Flavours that came in as bare SKU codes.
 *
 * Import used to fetch the detail for a row's MAIN sku only. The feed index
 * gave every flavour its stock, so all of them were orderable — but nothing
 * asked PowerBody what the others were CALLED, and the name only exists on the
 * detail call. So a six-flavour product went live with one real name and five
 * codes in its picker: "P45757" where "Orange" belongs.
 *
 * New imports are fixed. This is the pass for everything already in the shop.
 *
 * Sits with the sync and description panels, above the three that bring new
 * products in, because it is about products already here.
 */
export function VariantNameRepairPanel() {
  const [scan, setScan] = useState<Scan | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [repaired, setRepaired] = useState<Repair[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/portal/products/repair-variants')
      .then((r) => r.json())
      .then((d) => setScan(Array.isArray(d.products) ? d : null))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  useEffect(load, [load])

  async function run() {
    setBusy(true)
    setError(null)
    setDone(null)
    setRepaired(null)
    try {
      const res = await fetch('/api/portal/products/repair-variants', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.ok === false) {
        setError(d.error ?? 'Could not reach PowerBody to read the flavour names.')
        return
      }
      setRepaired(d.repaired ?? [])
      setDone(
        d.variants > 0
          ? `${d.variants} flavour${d.variants === 1 ? '' : 's'} named across ${d.total} product${d.total === 1 ? '' : 's'}.` +
              (d.unresolved > 0 ? ` ${d.unresolved} still have no name at PowerBody.` : '')
          : (d.message ?? 'Nothing needed changing.'),
      )
      // The shop, the product page and the variant picker all read these.
      invalidateCatalogue()
      load()
    } finally {
      setBusy(false)
    }
  }

  if (!loaded || !scan) return null

  const clean = scan.total === 0
  // Nothing to say when it is clean and nothing was just run — the panel would
  // be a permanent reminder of a fixed bug.
  if (clean && !done) return null

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
            Flavour names
          </h2>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
            {clean
              ? 'Every flavour has a name.'
              : `${scan.variants} flavour${scan.variants === 1 ? '' : 's'} across ${scan.total} product${scan.total === 1 ? '' : 's'} are showing a SKU code instead of a name.`}
          </p>
        </div>
        {!clean && (
          <Button size="sm" loading={busy} disabled={busy} onClick={run}>
            Fix flavour names
          </Button>
        )}
      </div>

      {!clean && !busy && (
        <Note tone="attention">
          Anything imported before flavour lookups were fixed only ever had its FIRST flavour named — the rest
          show their supplier code in the picker. This reads the real names from PowerBody and puts them back.
          It only touches labels that still look like codes, so anything you have renamed by hand is left alone,
          and it is safe to re-run.
        </Note>
      )}

      {error && (
        <Note tone="critical" live="assertive">
          {error}
        </Note>
      )}

      {done && !error && (
        <Note tone="positive" live="polite">
          {done}
        </Note>
      )}

      {!clean && !busy && scan.products.length > 0 && !repaired && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <p
            style={{
              fontSize: 'var(--text-micro)',
              fontWeight: 'var(--weight-strong)',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            Affected ({scan.total})
          </p>
          {scan.products.slice(0, 12).map((c) => (
            <div
              key={c.productId}
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--edge)',
                borderRadius: 'var(--radius-row)',
                padding: 'var(--space-3)',
              }}
            >
              <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
                {c.title}
              </p>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
                {c.skus.length} unnamed: {c.skus.slice(0, 6).join(', ')}
                {c.skus.length > 6 ? '…' : ''}
              </p>
            </div>
          ))}
          {scan.products.length > 12 && (
            <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
              …and {scan.products.length - 12} more.
            </p>
          )}
        </div>
      )}

      {repaired && repaired.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <p
            style={{
              fontSize: 'var(--text-micro)',
              fontWeight: 'var(--weight-strong)',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            Named ({repaired.length})
          </p>
          {repaired.map((r) => (
            <div
              key={r.productId}
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--edge)',
                borderRadius: 'var(--radius-row)',
                padding: 'var(--space-3)',
                display: 'grid',
                gap: 'var(--space-1)',
              }}
            >
              <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
                {r.title}
              </p>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)', lineHeight: 'var(--leading-snug)' }}>
                {Object.entries(r.fixed).map(([sku, label]) => `${sku} → ${label}`).join(' · ')}
              </p>
              {r.unresolved.length > 0 && (
                <p style={{ fontSize: 'var(--text-micro)', color: 'var(--tone-attention)' }}>
                  PowerBody had no name for {r.unresolved.join(', ')} — still showing the code.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
