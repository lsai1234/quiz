'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'

const ACCENT = '#00D4FF'

/**
 * Longest we wait for the feed before giving up and saying so.
 *
 * The route bounds its own work well inside this, so anything slower is a
 * request that is not coming back. Waiting forever is the one thing this must
 * not do: a spinner with no end looks identical to a broken page, and it takes
 * the SKU lookup down with it.
 */
const FEED_TIMEOUT_MS = 45_000

/** When to admit the feed is taking a while, rather than looking frozen. */
const SLOW_AFTER_MS = 6_000

interface Row {
  sku: string
  name: string
  brand: string
  category: string
  wholesalePrice: number
  rrp: number
  currency: string
  stock: number
  inStock: boolean
  margin: number
  marginPct: number
  mappedId: string
  stackSlots: string[]
  hasStimulants: boolean
  alreadyAdded: boolean
}

const money = (n: number) => `£${n.toFixed(2)}`

/** How much of the live feed has had its name/brand/image fetched. Null on the
 *  mock supplier, which is always complete. */
interface Progress {
  total: number
  detailed: number
  pending: number
  /** False when the feed was only partly paged inside the time budget. */
  listComplete?: boolean
}

export function SupplierBrowser() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [slow, setSlow] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [brand, setBrand] = useState('all')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [hideAdded, setHideAdded] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Bumped whenever a request is superseded or the component goes away, so a
  // late reply from an abandoned load can't write over the current state.
  const requestRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(() => {
    const id = ++requestRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setError(null)
    setLoading(true)
    setSlow(false)

    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, FEED_TIMEOUT_MS)
    const slowTimer = setTimeout(() => {
      if (requestRef.current === id) setSlow(true)
    }, SLOW_AFTER_MS)

    fetch('/api/portal/supplier', { signal: controller.signal, cache: 'no-store' })
      .then(async (res) => {
        // Read as text first: a gateway timeout or a crashed route answers with
        // an HTML page, and `res.json()` on that throws something meaningless.
        const text = await res.text()
        let payload: { products?: unknown; progress?: Progress | null; source?: string; error?: string }
        try {
          payload = JSON.parse(text)
        } catch {
          throw new Error(
            res.ok
              ? 'The feed answered with something we could not read.'
              : `The feed request failed (HTTP ${res.status}).`,
          )
        }
        if (!res.ok || payload.error) {
          throw new Error(payload.error ?? `The feed request failed (HTTP ${res.status}).`)
        }
        // A 200 with no products is a broken response, not an empty catalogue —
        // treating it as "still loading" is what left this stuck on a spinner.
        if (!Array.isArray(payload.products)) {
          throw new Error('The feed answered without a product list.')
        }
        if (requestRef.current !== id) return
        setRows(payload.products as Row[])
        setSource(payload.source ?? null)
        setProgress(payload.progress ?? null)
      })
      .catch((err: unknown) => {
        if (requestRef.current !== id) return // superseded or unmounted
        setError(
          timedOut
            ? `PowerBody did not answer within ${Math.round(FEED_TIMEOUT_MS / 1000)}s. Their feed is paged and rate-limited, so this can happen on a first load — try again, or use the SKU box above in the meantime.`
            : err instanceof Error && err.message
              ? err.message
              : 'Could not load the PowerBody feed.',
        )
      })
      .finally(() => {
        clearTimeout(timeout)
        clearTimeout(slowTimer)
        if (requestRef.current === id) setLoading(false)
      })
  }, [])

  useEffect(() => {
    load()
    return () => {
      requestRef.current++
      abortRef.current?.abort()
    }
  }, [load])

  const categories = useMemo(() => ['all', ...Array.from(new Set((rows ?? []).map((r) => r.category))).sort()], [rows])
  const brands = useMemo(() => ['all', ...Array.from(new Set((rows ?? []).map((r) => r.brand))).sort()], [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows ?? []).filter((r) => {
      if (category !== 'all' && r.category !== category) return false
      if (brand !== 'all' && r.brand !== brand) return false
      if (inStockOnly && !r.inStock) return false
      if (hideAdded && r.alreadyAdded) return false
      if (q && !`${r.name} ${r.brand} ${r.sku}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, query, category, brand, inStockOnly, hideAdded])

  const selectable = filtered.filter((r) => !r.alreadyAdded)
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.sku))

  function toggle(sku: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.sku)))
  }

  const add = useCallback(async (skus: string[]) => {
    if (skus.length === 0) return
    setAdding(true)
    const res = await fetch('/api/portal/supplier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus }),
    })
    if (res.ok) {
      const d = await res.json().catch(() => ({}))
      setSelected(new Set())
      invalidateCatalogue() // shop/quiz pick up the new products on next mount
      const how = d.aiUsed ? 'AI-classified' : 'auto-classified'
      setNotice(`Added ${d.added} product${d.added === 1 ? '' : 's'} — ${how}. Review and tweak them in Products before launch.`)
      load()
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Failed to add products.')
    }
    setAdding(false)
  }, [load])

  const addedCount = rows ? rows.filter((r) => r.alreadyAdded).length : 0

  return (
    <div className="space-y-4">
      {notice && (
        <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, color: 'var(--color-text-2)', border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)` }}>
          {notice}
        </p>
      )}

      {error && (
        <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: 'var(--color-surface-2)', color: 'var(--color-red)', border: '1px solid color-mix(in srgb, var(--color-red) 30%, transparent)' }}>
          {error}
        </p>
      )}

      {/* Above the feed on purpose: importing a SKU you already know must not
          depend on the browse list, which is the slow, rate-limited part. */}
      <SkuLookup onAdd={add} adding={adding} />

      <div className="h-px" style={{ background: 'var(--color-border)' }} />

      {!rows ? (
        loading ? (
          <div className="space-y-1.5">
            <p className="text-sm text-[var(--color-muted)]">Loading the PowerBody feed…</p>
            {slow && (
              <p className="text-xs text-[var(--color-muted)]">
                Their feed is paged and rate-limited, so a first load can take up to a minute. The SKU box above works
                straight away.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-[var(--color-muted)]">The browse list could not be loaded.</p>
            <button
              onClick={load}
              className="text-xs font-bold px-3 py-2 rounded-xl border"
              style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT }}
            >
              Try again
            </button>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {/* Summary + bulk action */}
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <p className="text-xs text-[var(--color-muted)]">
              {rows.length} products in the feed{source ? ` (${source} supplier)` : ''} ·{' '}
              <strong style={{ color: 'var(--color-text)' }}>{addedCount}</strong> in your catalogue
            </p>
            <div className="flex items-center gap-2">
              <button onClick={load} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] disabled:opacity-40">
                {loading ? 'Refreshing…' : 'Refresh stock'}
              </button>
              <button
                onClick={() => add([...selected])}
                disabled={adding || selected.size === 0}
                className="text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-40"
                style={{ background: ACCENT, color: '#001018' }}
              >
                {adding ? 'Adding…' : `Add ${selected.size || ''} to catalogue`.trim()}
              </button>
            </div>
          </div>

          {/* Still filling in names/images for the rest of the feed. */}
          {progress && progress.pending > 0 && (
            <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
              <strong style={{ color: 'var(--color-text-2)' }}>
                {progress.detailed} of {progress.total} products have full details.
              </strong>{' '}
              PowerBody rate-limit us, so names and images fill in a batch at a time — refresh to fetch more, or leave it
              to the nightly job. Prices and stock are already correct for all {progress.total}, and you can pull in any
              product right now by SKU above.
              {progress.listComplete === false && ' The feed itself is still being paged, so more products will appear too.'}
            </p>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, brand or SKU"
              className="flex-1 min-w-[180px] text-sm rounded-xl px-3 py-2 border"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="text-sm rounded-xl px-3 py-2 border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
              {categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}
            </select>
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className="text-sm rounded-xl px-3 py-2 border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
              {brands.map((b) => <option key={b} value={b}>{b === 'all' ? 'All brands' : b}</option>)}
            </select>
            <label className="text-xs flex items-center gap-1.5 text-[var(--color-muted)]"><input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} /> In stock</label>
            <label className="text-xs flex items-center gap-1.5 text-[var(--color-muted)]"><input type="checkbox" checked={hideAdded} onChange={(e) => setHideAdded(e.target.checked)} /> Hide added</label>
          </div>

          {selectable.length > 0 && (
            <label className="text-xs flex items-center gap-1.5 text-[var(--color-muted)]">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Select all {selectable.length} shown
            </label>
          )}

          {/* Rows */}
          <div className="space-y-2">
            {filtered.map((r) => (
              <div key={r.sku} className="rounded-2xl border p-3.5 flex items-center gap-3" style={{ background: 'var(--color-surface)', borderColor: r.alreadyAdded ? `color-mix(in srgb, ${ACCENT} 30%, transparent)` : 'var(--color-border)' }}>
                <input type="checkbox" disabled={r.alreadyAdded} checked={selected.has(r.sku)} onChange={() => toggle(r.sku)} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{r.name}</span>
                    <span className="text-[10px] font-semibold uppercase text-[var(--color-muted)]">{r.brand}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px] text-[var(--color-muted)]">
                    <span>{r.category}</span>
                    <span>·</span>
                    <span style={{ color: r.inStock ? 'var(--color-text-2)' : 'var(--color-red)' }}>{r.inStock ? `${r.stock} in stock` : 'Out of stock'}</span>
                    <span>·</span>
                    <span>Cost {money(r.wholesalePrice)} → RRP {money(r.rrp)}</span>
                    <span className="font-bold" style={{ color: ACCENT }}>{r.marginPct}% margin</span>
                  </div>
                </div>
                {r.alreadyAdded ? (
                  <span className="text-[10px] font-bold uppercase shrink-0" style={{ color: ACCENT }}>Added</span>
                ) : (
                  <button onClick={() => add([r.sku])} disabled={adding} className="text-xs font-bold px-3 py-1.5 rounded-xl border shrink-0 disabled:opacity-40" style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT }}>Add</button>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-[var(--color-muted)] py-6 text-center">
                No products match those filters.
                {progress && progress.pending > 0 && ' Products still waiting on details can only be matched by SKU — try the SKU box above.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Pull in specific products by SKU.
 *
 * The browse list above can only search what has been detailed so far, and on a
 * large feed that is a fraction of it for a while. This goes straight at named
 * SKUs — it fetches their details on demand — so a product you already know the
 * code for is always reachable, whatever the browse list is showing. Takes a
 * pasted blob (commas, spaces or newlines) because that is how SKUs arrive:
 * out of a spreadsheet or an email from the supplier.
 */
function SkuLookup({ onAdd, adding }: { onAdd: (skus: string[]) => Promise<void>; adding: boolean }) {
  const [input, setInput] = useState('')
  const [results, setResults] = useState<Row[] | null>(null)
  const [notFound, setNotFound] = useState<string[]>([])
  const [looking, setLooking] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function lookup() {
    if (!input.trim()) return
    setLooking(true)
    setErr(null)
    try {
      const res = await fetch('/api/portal/supplier/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus: input }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(d.error ?? 'Lookup failed.')
        setResults(null)
        return
      }
      setResults(d.products ?? [])
      setNotFound(d.notFound ?? [])
    } finally {
      setLooking(false)
    }
  }

  const addable = (results ?? []).filter((r) => !r.alreadyAdded)

  return (
    <div className="rounded-2xl border p-3.5 space-y-2.5" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
      <div>
        <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
          Find by SKU
        </p>
        <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
          Paste one or more SKUs — commas, spaces or new lines. Works for any product in the feed, detailed or not.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <textarea
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
          placeholder="e.g. PB-WHEY-1KG, PB-CREA-500"
          className="flex-1 min-w-[220px] text-sm rounded-xl px-3 py-2 border resize-y"
          style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        />
        <button
          onClick={lookup}
          disabled={looking || !input.trim()}
          className="text-xs font-bold px-3 py-2 rounded-xl border disabled:opacity-40 self-start"
          style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT }}
        >
          {looking ? 'Looking…' : 'Look up'}
        </button>
      </div>

      {err && <p className="text-xs" style={{ color: 'var(--color-red)' }}>{err}</p>}

      {notFound.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--color-red)' }}>
          Not in the feed: {notFound.join(', ')}
        </p>
      )}

      {results && results.length === 0 && notFound.length === 0 && (
        <p className="text-xs text-[var(--color-muted)]">Nothing found for those SKUs.</p>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          {results.map((r) => (
            <div key={r.sku} className="rounded-xl border p-3 flex items-center gap-3" style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{r.name}</span>
                  <span className="text-[10px] font-semibold uppercase text-[var(--color-muted)]">{r.brand}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px] text-[var(--color-muted)]">
                  <span>{r.sku}</span>
                  <span>·</span>
                  <span style={{ color: r.inStock ? 'var(--color-text-2)' : 'var(--color-red)' }}>
                    {r.inStock ? `${r.stock} in stock` : 'Out of stock'}
                  </span>
                  <span>·</span>
                  <span>Cost {money(r.wholesalePrice)} → RRP {money(r.rrp)}</span>
                  <span className="font-bold" style={{ color: ACCENT }}>{r.marginPct}% margin</span>
                </div>
              </div>
              {r.alreadyAdded ? (
                <span className="text-[10px] font-bold uppercase shrink-0" style={{ color: ACCENT }}>Added</span>
              ) : (
                <button
                  onClick={() => onAdd([r.sku])}
                  disabled={adding}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl border shrink-0 disabled:opacity-40"
                  style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT }}
                >
                  Add
                </button>
              )}
            </div>
          ))}

          {addable.length > 1 && (
            <button
              onClick={() => onAdd(addable.map((r) => r.sku))}
              disabled={adding}
              className="text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-40"
              style={{ background: ACCENT, color: '#001018' }}
            >
              {adding ? 'Adding…' : `Add all ${addable.length} to catalogue`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
