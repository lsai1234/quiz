'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(() => {
    fetch('/api/portal/products/repair-variants')
      .then((r) => r.json())
      .then((d) => setScan(Array.isArray(d.products) ? d : null))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  useEffect(load, [load])

  async function run(csv?: string, force = false) {
    setBusy(true)
    setError(null)
    setDone(null)
    setNote(null)
    setRepaired(null)
    try {
      const res = await fetch('/api/portal/products/repair-variants', {
        method: 'POST',
        ...(csv || force
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, force }) }
          : {}),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.ok === false) {
        setError(d.error ?? 'Could not reach PowerBody to read the flavour names.')
        return
      }
      setRepaired(d.repaired ?? [])
      setDone(
        d.variants > 0
          ? `${d.variants} flavour${d.variants === 1 ? '' : 's'} named across ${d.total} product${d.total === 1 ? '' : 's'}` +
              (d.source === 'csv' ? ', from the catalogue file.' : '.') +
              (d.unresolved > 0 ? ` ${d.unresolved} could not be found and still show their code.` : '')
          : (d.message ?? 'Nothing needed changing.'),
      )
      // Reported but not fatal: the file may have covered everything anyway.
      if (d.apiError) setNote(`PowerBody's API did not answer (${d.apiError}), so only the file was used.`)
      // The shop, the product page and the variant picker all read these.
      invalidateCatalogue()
      load()
    } finally {
      setBusy(false)
    }
  }

  /** Which button opened the picker — the narrow pass, or the full rewrite. */
  const forceRef = useRef(false)

  async function chooseCsv(file: File | undefined) {
    if (!file) return
    setError(null)
    const text = await file.text().catch(() => null)
    if (!text) {
      setError('That file could not be read.')
      return
    }
    await run(text, forceRef.current)
  }

  function pickCsv(force: boolean) {
    forceRef.current = force
    // Cleared so choosing the same file twice still fires a change event.
    if (fileRef.current) fileRef.current.value = ''
    fileRef.current?.click()
  }

  if (!loaded || !scan) return null

  const clean = scan.total === 0

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
              ? 'Every flavour has a name. Re-label from the catalogue if any of them read as whole product names.'
              : `${scan.variants} flavour${scan.variants === 1 ? '' : 's'} across ${scan.total} product${scan.total === 1 ? '' : 's'} are showing a SKU code instead of a name.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => void chooseCsv(e.target.files?.[0])}
          />
          {!clean && (
            <>
              <Button size="sm" loading={busy} disabled={busy} onClick={() => pickCsv(false)}>
                Use catalogue CSV
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run()}>
                Try PowerBody API
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => pickCsv(true)}>
            Re-label all from CSV
          </Button>
        </div>
      </div>

      {!clean && !busy && (
        <Note tone="attention">
          Anything imported before flavour lookups were fixed only ever had its FIRST flavour named — the rest
          show their supplier code. It only touches labels that still look like codes, so anything you have
          renamed by hand is left alone, and it is safe to re-run.
          <br />
          <br />
          <strong>Use catalogue CSV</strong> is the reliable one: download the dropshipping catalogue from
          PowerBody (the file starting <code>sku;manufacturer_name;name</code>) and pick it here. It holds every
          SKU they sell, so nothing has to be fetched one at a time and nothing can time out halfway.{' '}
          <strong>Try PowerBody API</strong> looks each code up live instead, which is slower and is what fails
          when their API is busy.
        </Note>
      )}

      {!busy && (
        <Note tone="info">
          <strong>Re-label all from CSV</strong> rewrites every flavour of every multi-variant product, not just
          the ones showing a code. Use it when the labels read as whole product names — the catalogue&rsquo;s own
          flavour column gives &ldquo;Cola&rdquo; where working it out from the names could only manage
          &ldquo;Breathe Isotonic Energy Gel, Cola - 20 x 60g&rdquo;. It overwrites anything you have renamed by
          hand, which is why it is separate.
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

      {note && !error && <Note tone="attention">{note}</Note>}

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
