'use client'

import { useCallback, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import type { SupplierRow } from '@/lib/supplier/row'
import { Badge, Button, Card, Textarea } from '@/components/system'


/**
 * Import PowerBody products by SKU.
 *
 * There used to be a browse list of the whole feed here. It was the wrong shape
 * for the API underneath: PowerBody's cheap call carries no names, and the call
 * that does is one request per product and rate-limited — so a browsable
 * catalogue meant either a list of bare supplier codes or thousands of throttled
 * requests to make it readable. Neither is a way to choose what to sell.
 *
 * Going by SKU turns that on its head. You already know what you want — it comes
 * off their site, a spreadsheet or an email — and asking for exactly those costs
 * exactly those calls. What comes back is the whole product: image, name, brand,
 * real RRP, live stock, and what we would charge and keep for it.
 *
 * WHY THERE ARE TWO BOXES
 * ───────────────────────
 * A SKU is not what the detail call takes. PowerBody key `getProductInfo` on a
 * product id, and the only way to get from a SKU to one is to page their list
 * feed until the row turns up. That search is fine when the SKU is there and
 * awful when it isn't: nothing tells the pager to stop, so it reads the whole
 * catalogue and usually runs out of the build budget first — which is why a
 * mistyped or unstocked SKU reports "PowerBody did not answer within 20s"
 * instead of "not in the feed".
 *
 * The product ID box skips the search. It calls `getProductInfo` directly: one
 * request, no paging, nothing that can time out. So it is both the fast path for
 * a product you can already identify and the way through when the feed is slow
 * or a SKU cannot be found in it. Ids are on PowerBody's own product pages, and
 * every looked-up row shows the one it resolved — so a SKU that works once
 * yields an id that keeps working.
 */
export function SupplierImport() {
  const [input, setInput] = useState('')
  const [idInput, setIdInput] = useState('')
  const [results, setResults] = useState<SupplierRow[] | null>(null)
  const [notFound, setNotFound] = useState<string[]>([])
  const [notFoundIds, setNotFoundIds] = useState<string[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [looking, setLooking] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** Codes sampled from the feed, for when you haven't got one to hand. */
  const [samples, setSamples] = useState<string[] | null>(null)
  const [sampling, setSampling] = useState(false)

  const loadSamples = useCallback(async () => {
    setSampling(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/supplier/skus?limit=40', { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'Could not read the supplier feed.')
        return
      }
      setSamples(d.skus ?? [])
    } catch {
      setError('Could not read the supplier feed.')
    } finally {
      setSampling(false)
    }
  }, [])

  const lookup = useCallback(async () => {
    if (!input.trim() && !idInput.trim()) return
    setLooking(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/portal/supplier/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus: input, productIds: idInput }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'Lookup failed.')
        setResults(null)
        return
      }
      setResults(d.products ?? [])
      setNotFound(d.notFound ?? [])
      setNotFoundIds(d.notFoundIds ?? [])
      setSource(d.source ?? null)
    } catch {
      setError('Could not reach the supplier.')
      setResults(null)
    } finally {
      setLooking(false)
    }
  }, [input, idInput])

  /**
   * Add looked-up rows.
   *
   * Rows rather than SKUs, because a row already knows the product id the
   * lookup resolved — and sending that back means the add goes straight to the
   * detail call instead of paging the feed all over again to rediscover a
   * mapping we have in our hands. Rows without one (a supplier with no ids)
   * fall back to their SKU.
   */
  const add = useCallback(async (rows: SupplierRow[], combine = false) => {
    if (rows.length === 0) return
    setAdding(true)
    setError(null)
    try {
      const productIds = rows.map((r) => r.productId).filter((id): id is string => Boolean(id))
      const skus = rows.filter((r) => !r.productId).map((r) => r.sku)
      const res = await fetch('/api/portal/supplier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus, productIds, combine }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'Failed to add products.')
        return
      }
      invalidateCatalogue()
      // Re-resolve first so the rows show as already added rather than offering
      // Add again — and only then say so, because the refresh clears the notice
      // on its way past.
      await lookup()
      const how = d.aiUsed ? 'AI-classified' : 'auto-classified'
      // Deliberately not "added to your shop": it isn't, until it is reviewed.
      setNotice(
        d.combined
          ? `${d.skusAdded} SKUs combined into one product with ${d.skusAdded} variants and ${how}, waiting in ` +
            'Products → Review. Nothing is on sale until you approve it there.'
          : `${d.added} product${d.added === 1 ? '' : 's'} pulled in and ${how}, waiting in Products → Review. ` +
            'Nothing is on sale until you approve it there.',
      )
    } catch {
      setError('Failed to add products.')
    } finally {
      setAdding(false)
    }
  }, [lookup])

  const addable = (results ?? []).filter((r) => !r.alreadyAdded)

  return (
    <div className="space-y-4">
      {notice && (
        <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: `var(--accent-fill)`, color: 'var(--ink-2)', border: `1px solid var(--accent-line)` }}>
          {notice}
        </p>
      )}
      {error && (
        <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: 'var(--surface-2)', color: 'var(--tone-critical)', border: '1px solid var(--critical-line)' }}>
          {error}
        </p>
      )}

      <Card padding="tight" className="space-y-2.5">
        <div>
          <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
            Add by SKU
          </p>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
            Paste one or more SKUs — commas, spaces or new lines. Each one comes back with its picture, name, brand,
            live stock and real cost, so you can check it before adding.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <Textarea
            label="SKUs to look up"
            hideLabel
            className="flex-1 min-w-[14rem]"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter looks up; Shift+Enter keeps a multi-line paste editable.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                lookup()
              }
            }}
            rows={2}
            placeholder="e.g. ON-GOLD-WHEY-2270, APP-CREA-250"
          />
          <Button
            variant="primary"
            loading={looking}
            disabled={!input.trim() && !idInput.trim()}
            onClick={lookup}
          >
            Look up
          </Button>
        </div>

        <div className="pt-1">
          <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
            …or by product ID
          </p>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
            PowerBody look products up by ID, not SKU — so a SKU has to be searched for in their feed first, and a SKU
            that isn’t there takes the search to the end of the catalogue and times out. An ID skips the search: one
            call, no waiting. Use this when a SKU won’t resolve.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <Textarea
            label="Product IDs to look up"
            hideLabel
            className="flex-1 min-w-[14rem]"
            value={idInput}
            onChange={(e) => setIdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                lookup()
              }
            }}
            rows={2}
            placeholder="e.g. 44338, 28352"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" loading={sampling} onClick={loadSamples}>
            Show me some SKUs
          </Button>
          {source && results && (
            <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
              Answered by the {source} supplier.
            </span>
          )}
        </div>

        {samples && (
          <div className="rounded-xl p-2.5 space-y-2" style={{ background: 'var(--surface-2)' }}>
            {samples.length === 0 ? (
              <p className="text-[11px] text-[var(--ink-3)]">The feed came back empty.</p>
            ) : (
              <>
                <p className="text-[10px] text-[var(--ink-3)]">
                  {samples.length} codes from the feed — tap to add one to the box. Codes only: names and prices come
                  from looking them up.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {samples.map((sku) => (
                    <Button
                      key={sku}
                      size="sm"
                      // No aria-label: the SKU is the visible text and so is the
                      // name. An "Add SKU … to the box" label that does not start
                      // with what is written on the button breaks voice control.
                      onClick={() => setInput((v) => (v.trim() ? `${v.trim()}, ${sku}` : sku))}
                    >
                      {sku}
                    </Button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setInput(samples.join(', '))}>
                  Put all {samples.length} in the box
                </Button>
              </>
            )}
          </div>
        )}
      </Card>

      {notFound.length > 0 && (
        <div role="status" className="space-y-1">
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--tone-critical)' }}>
            Not in the feed: {notFound.join(', ')}
          </p>
          {/* The feed answered and these were not in it, which is a real answer
              — but it is also what a slow feed looks like, so point at the box
              that cannot fail the same way. */}
          <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
            If you can see one of these on PowerBody’s site, take its product ID from the page and use the ID box —
            that skips the feed search entirely.
          </p>
        </div>
      )}

      {notFoundIds.length > 0 && (
        <p role="status" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--tone-critical)' }}>
          PowerBody returned no product for {notFoundIds.length === 1 ? 'ID' : 'IDs'}: {notFoundIds.join(', ')}
        </p>
      )}

      {results && results.length === 0 && notFound.length === 0 && notFoundIds.length === 0 && (
        <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>Nothing found for those codes.</p>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          {results.map((r) => (
            <ProductCard key={r.productId ?? r.sku} row={r} adding={adding} onAdd={() => add([r])} />
          ))}

          {addable.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" loading={adding} onClick={() => add(addable)}>
                {`Add all ${addable.length} separately`}
              </Button>
              {/* PowerBody sell each flavour as its own SKU, so this is how four
                  codes become one product with a flavour picker. */}
              <Button size="sm" loading={adding} onClick={() => add(addable, true)}>
                Add as ONE product ({addable.length} variants)
              </Button>
            </div>
          )}
          {addable.length > 1 && (
            <p className="text-[10px] text-[var(--ink-3)]">
              Combine when these are flavours of the same tub. Different sizes stay separate — a variant carries its own
              price and SKU but not its own cost, servings or weight.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const money = (n: number) => `£${n.toFixed(2)}`

/** One looked-up product, in full: what it is and what it would make us. */
function ProductCard({ row: r, adding, onAdd }: { row: SupplierRow; adding: boolean; onAdd: () => void }) {
  return (
    <div className="rounded-2xl border p-3.5 flex items-start gap-3" style={{ background: 'var(--surface-1)', borderColor: 'var(--edge)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {r.imageUrl ? (
        <img src={r.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded-xl shrink-0 grid place-items-center text-[9px] text-[var(--ink-3)]" style={{ background: 'var(--surface-2)' }}>
          No image
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>{r.name}</span>
          {r.brand && <span className="text-[10px] font-semibold uppercase text-[var(--ink-3)]">{r.brand}</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px] text-[var(--ink-3)]">
          <span>{r.sku}</span>
          {/* Shown because it is the code that always works: looking this
              product up again by ID needs no feed search and cannot time out. */}
          {r.productId && (
            <>
              <span>·</span>
              <span>ID {r.productId}</span>
            </>
          )}
          {r.category && (
            <>
              <span>·</span>
              <span>{r.category}</span>
            </>
          )}
          <span>·</span>
          <span style={{ color: r.inStock ? 'var(--ink-2)' : 'var(--tone-critical)' }}>
            {r.inStock ? `${r.stock} in stock` : 'Out of stock'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px] text-[var(--ink-3)]">
          {/* What we pay → what we would charge → what we would keep. */}
          <span>Cost {money(r.wholesalePrice)} → sell {money(r.sellPrice)}</span>
          <span className="font-bold" style={{ color: r.marginPct > 0 ? 'var(--accent)' : 'var(--tone-critical)' }}>
            {r.marginEstimated ? '≈' : ''}{r.marginPct}% margin
          </span>
          {r.rrp !== null && <span>RRP {money(r.rrp)}</span>}
        </div>
      </div>

      {r.alreadyAdded ? (
        <Badge tone="accent" icon="check" className="shrink-0">
          Added
        </Badge>
      ) : (
        <Button size="sm" className="shrink-0" loading={adding} aria-label={`Add ${r.name}`} onClick={onAdd}>
          Add
        </Button>
      )}
    </div>
  )
}
