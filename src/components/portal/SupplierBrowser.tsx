'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import type { SupplierRow } from '@/lib/supplier/row'

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

/** The shape both supplier endpoints answer with — see `lib/supplier/row.ts`. */
type Row = SupplierRow

/** How many SKUs one lookup call will take (`MAX_LOOKUP_SKUS` on the server). */
const MAX_DETAIL_BATCH = 50

const money = (n: number) => `£${n.toFixed(2)}`

/** How much of the live feed has had its name/brand/RRP fetched. Null on the
 *  mock supplier, whose fixtures are always whole. */
interface Progress {
  total: number
  detailed: number
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
  /** SKUs whose detail is being fetched right now. */
  const [detailing, setDetailing] = useState<Set<string>>(new Set())
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
  /** Selected rows still missing their name/RRP — what "Get details" would fetch. */
  const undetailedSelected = (rows ?? [])
    .filter((r) => selected.has(r.sku) && !r.detailed)
    .map((r) => r.sku)
    .slice(0, MAX_DETAIL_BATCH)

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

  /**
   * Fetch the descriptive half of specific products and fold it into the list.
   *
   * Browsing costs nothing because it reads only PowerBody's cheap list feed;
   * names, brands and RRPs are one throttled call per product, so they are
   * fetched for the products actually being looked at. Cached server-side, so a
   * product is only ever fetched once however often it is browsed.
   */
  const fetchDetails = useCallback(async (skus: string[]) => {
    const wanted = skus.slice(0, MAX_DETAIL_BATCH)
    if (wanted.length === 0) return
    setDetailing((prev) => new Set([...prev, ...wanted]))
    setError(null)
    try {
      const res = await fetch('/api/portal/supplier/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus: wanted }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'Could not fetch those product details.')
        return
      }
      const detailed: Row[] = Array.isArray(d.products) ? d.products : []
      if (detailed.length === 0) return
      const bySku = new Map(detailed.map((r) => [r.sku, r]))
      setRows((prev) => (prev ? prev.map((r) => bySku.get(r.sku) ?? r) : prev))
      setProgress((prev) =>
        prev ? { ...prev, detailed: Math.min(prev.total, prev.detailed + bySku.size) } : prev,
      )
    } catch {
      setError('Could not fetch those product details.')
    } finally {
      setDetailing((prev) => {
        const next = new Set(prev)
        for (const sku of wanted) next.delete(sku)
        return next
      })
    }
  }, [])

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
              {undetailedSelected.length > 0 && (
                <button
                  onClick={() => fetchDetails(undetailedSelected)}
                  disabled={detailing.size > 0}
                  className="text-xs font-bold px-3 py-2 rounded-xl border disabled:opacity-40"
                  style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT }}
                >
                  {detailing.size > 0 ? 'Fetching…' : `Get details for ${undetailedSelected.length}`}
                </button>
              )}
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

          {/* Why most rows are bare SKUs, and what to do about it. */}
          {progress && progress.detailed < progress.total && (
            <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
              <strong style={{ color: 'var(--color-text-2)' }}>
                {progress.detailed} of {progress.total} products have their names and images fetched.
              </strong>{' '}
              PowerBody send those one product at a time and rate-limit us, so browsing doesn’t fetch them. The money is
              all here regardless: we price from cost, so what you pay, what you’d charge and what you’d keep are live
              and correct for all {progress.total} — only the shipping weight is assumed, which moves the margin by a
              point or two. Press <strong>Details</strong> on a row for its name, tick a few and use{' '}
              <strong>Get details</strong>, or just add a product: adding always fetches the full record first.
              {progress.listComplete === false && ' The feed itself was only partly paged, so more products will appear on a refresh.'}
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
                    {r.category && (
                      <>
                        <span>{r.category}</span>
                        <span>·</span>
                      </>
                    )}
                    <span style={{ color: r.inStock ? 'var(--color-text-2)' : 'var(--color-red)' }}>{r.inStock ? `${r.stock} in stock` : 'Out of stock'}</span>
                    <span>·</span>
                    {/* What we pay → what we would charge → what we would keep.
                        All three come from the cheap feed, because we price from
                        cost rather than off PowerBody's RRP. */}
                    <span>Cost {money(r.wholesalePrice)} → sell {money(r.sellPrice)}</span>
                    <span
                      className="font-bold"
                      style={{ color: r.marginPct > 0 ? ACCENT : 'var(--color-red)' }}
                      title={`Keeps ${money(r.contribution)} a unit after VAT, delivery, card fees and returns.${
                        r.marginEstimated ? ' Shipping weight not fetched yet, so the delivery band is assumed.' : ''
                      }`}
                    >
                      {r.marginEstimated ? '≈' : ''}{r.marginPct}% margin
                    </span>
                    {r.rrp !== null && <span>RRP {money(r.rrp)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!r.detailed && (
                    <button
                      onClick={() => fetchDetails([r.sku])}
                      disabled={detailing.has(r.sku)}
                      className="text-xs font-bold px-3 py-1.5 rounded-xl border disabled:opacity-40"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                    >
                      {detailing.has(r.sku) ? 'Fetching…' : 'Details'}
                    </button>
                  )}
                  {r.alreadyAdded ? (
                    <span className="text-[10px] font-bold uppercase" style={{ color: ACCENT }}>Added</span>
                  ) : (
                    <button onClick={() => add([r.sku])} disabled={adding} className="text-xs font-bold px-3 py-1.5 rounded-xl border disabled:opacity-40" style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT }}>Add</button>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-[var(--color-muted)] py-6 text-center">
                No products match those filters.
                {progress && progress.detailed < progress.total && ' Products whose details have not been fetched can only be matched by SKU — try the SKU box above.'}
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
 * The browse list below shows PowerBody's cheap list feed, which carries no
 * names — so searching it by name finds nothing until products have been
 * detailed. This goes straight at named SKUs and fetches their full record on
 * the spot, which makes it the fastest route to "I know exactly what I want".
 * Takes a pasted blob (commas, spaces or newlines) because that is how SKUs
 * arrive: out of a spreadsheet or an email from the supplier.
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
          Paste one or more SKUs — commas, spaces or new lines. Fetches the full record for each: name, brand, RRP and
          margin.
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
                  <span>Cost {money(r.wholesalePrice)} → sell {money(r.sellPrice)}</span>
                  <span className="font-bold" style={{ color: r.marginPct > 0 ? ACCENT : 'var(--color-red)' }}>
                    {r.marginPct}% margin
                  </span>
                  {r.rrp !== null && <span>RRP {money(r.rrp)}</span>}
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
