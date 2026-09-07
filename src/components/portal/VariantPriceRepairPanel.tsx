'use client'

import { useCallback, useEffect, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Button, Note } from '@/components/system'

interface Candidate {
  productId: string
  title: string
  variants: number
  onePrice: boolean
  servingsKnown: number
  picturesKnown: number
}

interface Scan {
  products: Candidate[]
  total: number
}

interface Repair {
  productId: string
  title: string
  changed: Record<string, string>
}

/**
 * Variants that were all given the main SKU's price and the main SKU's servings.
 *
 * Import merged a roster row's sibling SKUs into one product and priced them
 * from the row's main SKU, because a flavour of one tub costs one price. That
 * holds for flavours and for nothing else, and the sheet is written by a person:
 * the glycine row merged 100 × 1000mg capsules (£11.12 to us, 33 servings) with
 * a 454g bag of the same powder (£20.04, 454 servings), and both went live at
 * one price with one serving count.
 *
 * New imports give every SKU its own price and its own count. This is the pass
 * for everything already in the shop.
 *
 * Sits with the flavour-name repair, above the panels that bring new products
 * in, because it is about products already here.
 */
export function VariantPriceRepairPanel() {
  const [scan, setScan] = useState<Scan | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [repaired, setRepaired] = useState<Repair[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/portal/products/repair-variant-pricing')
      .then((r) => r.json())
      .then((d) => setScan(Array.isArray(d.products) ? d : null))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  useEffect(load, [load])

  async function run(force: boolean) {
    setBusy(true)
    setError(null)
    setDone(null)
    setNote(null)
    setRepaired(null)
    try {
      const res = await fetch('/api/portal/products/repair-variant-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.ok === false) {
        setError(d.error ?? 'Could not reach PowerBody for costs and serving counts.')
        return
      }
      setRepaired(d.repaired ?? [])
      setDone(
        d.variants > 0
          ? `${d.variants} variant${d.variants === 1 ? '' : 's'} corrected across ${d.total} product${d.total === 1 ? '' : 's'}.`
          : (d.message ?? 'Every variant already carries its own price and serving count.'),
      )
      // Reported, not fatal: the prices land from the cheap feed read even when
      // the per-product detail calls that carry serving counts do not.
      if (d.servingsError) setNote(`Serving counts could not be read (${d.servingsError}) — prices were still applied.`)
      else if (d.priceError) setNote(`Costs could not be read (${d.priceError}) — only serving counts were applied.`)
      // The shop, the product page and the per-serving price all read these.
      invalidateCatalogue()
      load()
    } finally {
      setBusy(false)
    }
  }

  if (!loaded || !scan) return null

  const suspect = scan.products.filter((p) => p.onePrice)

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
            Variant prices, servings &amp; pictures
          </h2>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
            {scan.total === 0
              ? 'No product has more than one supplier SKU behind it.'
              : `${scan.total} product${scan.total === 1 ? '' : 's'} merge more than one supplier SKU. ` +
                `${suspect.length} of them show every variant at the same price, and ` +
                `${scan.products.filter((p) => p.picturesKnown === 0).length} have no per-flavour pictures yet.`}
          </p>
        </div>
        {scan.total > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button size="sm" loading={busy} disabled={busy} onClick={() => void run(false)}>
              Fix mispriced variants
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(true)}>
              Re-price all from cost
            </Button>
          </div>
        )}
      </div>

      {scan.total > 0 && !busy && (
        <Note tone="attention">
          Anything imported before this was fixed was priced from the row&rsquo;s MAIN SKU, so two genuinely
          different things under one master SKU — 100 capsules and a 454g bag of the same powder — went live at
          one price with one serving count.
          <br />
          <br />
          <strong>Fix mispriced variants</strong> only touches products whose SKUs actually cost different amounts
          and are still showing one shelf price, which is the exact signature of that bug; a product you have
          priced by hand already has variants that differ, so it is left alone. Serving counts and costs are read
          from PowerBody either way — those are facts, not decisions. So is the photograph: PowerBody hold one
          per SKU and a flavour is its own SKU at their end, so a six-flavour product has six real pictures and
          the shop was showing one of them six times. A picture already set is never replaced. It is safe to
          re-run.
          <br />
          <br />
          <strong>Re-price all from cost</strong> rewrites every variant of every multi-SKU product back to
          cost × 2, overwriting prices you have set yourself. That is why it is separate.
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

      {!busy && suspect.length > 0 && !repaired && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <p
            style={{
              fontSize: 'var(--text-micro)',
              fontWeight: 'var(--weight-strong)',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            Every variant at one price ({suspect.length})
          </p>
          {suspect.slice(0, 12).map((c) => (
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
                {c.variants} variants · {c.servingsKnown} with their own serving count ·{' '}
                {c.picturesKnown} with their own picture
              </p>
            </div>
          ))}
          {suspect.length > 12 && (
            <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
              …and {suspect.length - 12} more.
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
            Corrected ({repaired.length})
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
                {Object.entries(r.changed).map(([sku, what]) => `${sku}: ${what}`).join(' · ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
