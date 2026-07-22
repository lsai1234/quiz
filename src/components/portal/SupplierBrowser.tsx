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

export function SupplierBrowser() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [brand, setBrand] = useState('all')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [hideAdded, setHideAdded] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    setError(null)
    fetch('/api/portal/supplier')
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setRows(d.products)))
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
      setSelected(new Set())
      invalidateCatalogue() // shop/quiz pick up the new products on next mount
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
        {filtered.length === 0 && <p className="text-sm text-[var(--color-muted)] py-6 text-center">No products match those filters.</p>}
      </div>
    </div>
  )
}
