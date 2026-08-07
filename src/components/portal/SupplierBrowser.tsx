'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'

const ACCENT = '#00D4FF'

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
}

export function SupplierBrowser() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [brand, setBrand] = useState('all')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [hideAdded, setHideAdded] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    fetch('/api/portal/supplier')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setError(d.error)
        setRows(d.products)
        setProgress(d.progress ?? null)
      })
      .catch(() => setError('Could not load the PowerBody feed.'))
  }, [])

  useEffect(() => { load() }, [load])

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

  if (error && !rows) return <p className="text-sm" style={{ color: 'var(--color-red)' }}>{error}</p>
  if (!rows) return <p className="text-sm text-[var(--color-muted)]">Loading the PowerBody feed…</p>

  const addedCount = rows.filter((r) => r.alreadyAdded).length

  return (
    <div className="space-y-4">
      {/* Summary + bulk action */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className="text-xs text-[var(--color-muted)]">
          {rows.length} products in the feed · <strong style={{ color: 'var(--color-text)' }}>{addedCount}</strong> in your catalogue
        </p>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-xs font-bold px-3 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)]">Refresh stock</button>
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

      {notice && (
        <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, color: 'var(--color-text-2)', border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)` }}>
          {notice}
        </p>
      )}

      {/* Still filling in names/images for the rest of the feed. */}
      {progress && progress.pending > 0 && (
        <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
          <strong style={{ color: 'var(--color-text-2)' }}>
            {progress.detailed} of {progress.total} products have full details.
          </strong>{' '}
          PowerBody rate-limit us, so names and images fill in a batch at a time — refresh to fetch more, or leave it
          to the nightly job. Prices and stock are already correct for all {progress.total}, and you can pull in any
          product right now by SKU below.
        </p>
      )}

      <SkuLookup onAdd={add} adding={adding} />

      <div className="h-px" style={{ background: 'var(--color-border)' }} />

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
