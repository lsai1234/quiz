'use client'

import { useCallback, useEffect, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Badge, Button, Card, Note } from '@/components/system'
import { FilePickButton, readFileText } from '@/components/portal/FilePickButton'
import { ProductLink, useProductIndex } from '@/components/portal/fixups/product-index'
import type { FixupPanelProps } from '@/components/portal/fixups/types'

interface Candidate {
  productId: string
  title: string
  skus: string[]
  namedAfterAFlavour?: boolean
  flavourWearingTheName?: boolean
}

interface Scan {
  products: Candidate[]
  total: number
  variants: number
  misnamed?: number
}

interface Repair {
  productId: string
  title: string
  fixed: Record<string, string>
  unresolved: string[]
  renamedTo?: string
}

const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' } as const
/** How many products to list before the rest fold behind "Show all". */
const LISTED = 12
const EYEBROW = { fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-strong)', textTransform: 'uppercase', color: 'var(--ink-3)' } as const

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
 * The route decides which products it covers and takes no list, so it also
 * names flavours on products still waiting for review — harmless (it only
 * touches labels that are still codes), and marked as such in the list so the
 * count is not mistaken for products on sale.
 */
export function VariantNameRepairPanel({ onSummary, onRunningChange }: FixupPanelProps) {
  const index = useProductIndex()
  const [scan, setScan] = useState<Scan | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [repaired, setRepaired] = useState<Repair[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(() => {
    setLoadError(null)
    fetch('/api/portal/products/repair-variants', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => null)
        if (r.ok && Array.isArray(d?.products)) setScan(d)
        else setLoadError(d?.error ?? `The server answered with an error (HTTP ${r.status}).`)
      })
      .catch(() => setLoadError('Could not reach the server — check the connection.'))
  }, [])

  useEffect(load, [load])
  useEffect(() => onRunningChange?.(busy), [busy, onRunningChange])

  const waiting = (id: string) => index.byId.get(id)?.state === 'pending'

  useEffect(() => {
    if (!onSummary) return
    if (loadError) return onSummary({ count: null, line: 'Could not count — see inside.' })
    if (!scan) return onSummary({ count: null, line: 'Counting…' })
    onSummary({
      count: scan.total,
      line:
        scan.total === 0
          ? 'Every flavour has a name, and no product is named after one of its own flavours.'
          : [
              scan.variants > 0 ? `${scan.variants} flavour${scan.variants === 1 ? '' : 's'} showing a code instead of a name` : null,
              scan.misnamed ? `${scan.misnamed} product${scan.misnamed === 1 ? '' : 's'} with the product and flavour names the wrong way round` : null,
            ]
              .filter(Boolean)
              .join('; ') + ` — ${scan.total} product${scan.total === 1 ? '' : 's'} in all.`,
    })
  }, [onSummary, scan, loadError])

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
      const d = await res.json().catch(() => null)
      if (!res.ok || !d || d.ok === false) {
        setError(
          d?.error ??
            `The repair did not come back (HTTP ${res.status}) — most likely PowerBody were slow and it ran out of time. ` +
              'Use the catalogue CSV instead: it needs nothing from their API.',
        )
        return
      }
      setRepaired(d.repaired ?? [])
      setDone(
        d.variants > 0 || d.renamed > 0
          ? [
              d.variants > 0
                ? `${d.variants} flavour${d.variants === 1 ? '' : 's'} named across ${d.total} product${d.total === 1 ? '' : 's'}` +
                  (d.source === 'csv' ? ', from the catalogue file.' : '.')
                : null,
              d.renamed > 0
                ? `${d.renamed} product${d.renamed === 1 ? '' : 's'} renamed off a flavour and onto the name the flavours share.`
                : null,
              d.unresolved > 0 ? `${d.unresolved} could not be found and still show their code.` : null,
            ]
              .filter(Boolean)
              .join(' ')
          : (d.message ?? 'Nothing needed changing.'),
      )
      // Reported but not fatal: the file may have covered everything anyway.
      if (d.apiError) setNote(`PowerBody's API did not answer (${d.apiError}), so only the file was used.`)
      // The shop, the product page and the variant picker all read these.
      invalidateCatalogue()
      load()
    } catch {
      setError('Could not reach the server — check the connection, then try again. Nothing was changed.')
    } finally {
      setBusy(false)
    }
  }

  /** The catalogue file, for the narrow pass or (`force`) the full re-label. */
  async function chooseCsv(file: File, force: boolean) {
    setError(null)
    const text = await readFileText(file).catch(() => null)
    if (!text) {
      setError('That file could not be read. Download the catalogue from PowerBody again and pick the new copy.')
      return
    }
    await run(text, force)
  }

  if (loadError) {
    return (
      <Note tone="critical">
        The flavour names could not be checked: {loadError}{' '}
        <Button size="sm" variant="ghost" icon="refresh" onClick={load}>
          Try again
        </Button>
      </Note>
    )
  }
  if (!scan) return <p style={META}>Counting…</p>

  const clean = scan.total === 0

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
        {!clean && (
          <>
            <FilePickButton
              size="sm"
              variant="primary"
              accept=".csv,text/csv"
              loading={busy}
              disabled={busy}
              onFile={(file) => void chooseCsv(file, false)}
            >
              Use catalogue CSV
            </FilePickButton>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run()}>
              Try PowerBody API
            </Button>
          </>
        )}
        <FilePickButton size="sm" variant="ghost" accept=".csv,text/csv" disabled={busy} onFile={(file) => void chooseCsv(file, true)}>
          Re-label all from CSV
        </FilePickButton>
      </div>

      {clean && <p style={META}>Every flavour has a name. Re-label from the catalogue if any of them read as whole product names.</p>}

      {!clean && !busy && (
        <Note tone="attention">
          Anything imported before flavour lookups were fixed only ever had its FIRST flavour named — the rest
          show their supplier code. It only touches labels that still look like codes, so anything you have
          renamed by hand is left alone, and it is safe to re-run.
          <br />
          <br />
          It also fixes the mix-up at the other end, in both directions: import took the row&rsquo;s MAIN
          SKU&rsquo;s name for the whole product, and a main SKU is a flavour — so &ldquo;Hydration+, Blue
          Raspberry - 240 grams&rdquo; became the product, with &ldquo;Hydration+&rdquo; listed under it as
          one of its flavours. The product is renamed to what its flavours share, and a flavour row wearing
          that shared name is relabelled with the flavour that tells it apart. A label or a title you wrote
          yourself is never touched, and the web address never changes.
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

      {busy && (
        <p style={{ ...META, color: 'var(--ink-2)' }} role="status">
          Naming flavours… with the API this is one call per SKU, so it can take a minute.
        </p>
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
          <p style={EYEBROW}>Affected ({scan.total})</p>
          <ul style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {(showAll ? scan.products : scan.products.slice(0, LISTED)).map((c) => (
              <Card key={c.productId} as="li" solid padding="tight">
                <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
                  <ProductLink id={c.productId} section="variants">
                    {c.title}
                  </ProductLink>
                  {waiting(c.productId) && <Badge tone="info">Waiting for review</Badge>}
                </div>
                <p style={META}>
                  {c.skus.length > 0 && (
                    <>
                      {c.skus.length} unnamed: {c.skus.slice(0, 6).join(', ')}
                      {c.skus.length > 6 ? '…' : ''}
                    </>
                  )}
                  {c.skus.length > 0 && (c.namedAfterAFlavour || c.flavourWearingTheName) ? ' · ' : ''}
                  {[
                    c.namedAfterAFlavour ? 'title looks like one of its own flavours' : null,
                    c.flavourWearingTheName ? 'a flavour is wearing the product’s name' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </Card>
            ))}
          </ul>
          {scan.products.length > LISTED && (
            <div>
              <Button size="sm" variant="ghost" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${scan.products.length}`}
              </Button>
            </div>
          )}
        </div>
      )}

      {repaired && repaired.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <p style={EYEBROW}>Named ({repaired.length})</p>
          <ul style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {repaired.map((r) => (
              <Card key={r.productId} as="li" solid padding="tight">
                <p style={{ fontSize: 'var(--text-body-sm)' }}>
                  <ProductLink id={r.productId} section="variants">
                    {r.title}
                  </ProductLink>
                  {r.renamedTo && <span style={{ color: 'var(--ink-2)' }}> → {r.renamedTo}</span>}
                </p>
                <p style={{ ...META, color: 'var(--ink-2)', lineHeight: 'var(--leading-snug)' }}>
                  {Object.entries(r.fixed).map(([sku, label]) => `${sku} → ${label}`).join(' · ')}
                </p>
                {r.unresolved.length > 0 && (
                  <p style={{ fontSize: 'var(--text-micro)', color: 'var(--tone-attention)' }}>
                    PowerBody had no name for {r.unresolved.join(', ')} — still showing the code. Name{' '}
                    {r.unresolved.length === 1 ? 'it' : 'them'} on the product&rsquo;s page.
                  </p>
                )}
              </Card>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
