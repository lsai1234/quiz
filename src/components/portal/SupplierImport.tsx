'use client'

import { useCallback, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import type { SupplierRow } from '@/lib/supplier/row'


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
 */
export function SupplierImport() {
  const [input, setInput] = useState('')
  const [results, setResults] = useState<SupplierRow[] | null>(null)
  const [notFound, setNotFound] = useState<string[]>([])
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
    if (!input.trim()) return
    setLooking(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/portal/supplier/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus: input }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'Lookup failed.')
        setResults(null)
        return
      }
      setResults(d.products ?? [])
      setNotFound(d.notFound ?? [])
      setSource(d.source ?? null)
    } catch {
      setError('Could not reach the supplier.')
      setResults(null)
    } finally {
      setLooking(false)
    }
  }, [input])

  const add = useCallback(async (skus: string[], combine = false) => {
    if (skus.length === 0) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/supplier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus, combine }),
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

      <div className="rounded-2xl border p-3.5 space-y-2.5" style={{ background: 'var(--surface-1)', borderColor: 'var(--edge)' }}>
        <div>
          <p className="text-sm font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
            Add by SKU
          </p>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
            Paste one or more SKUs — commas, spaces or new lines. Each one comes back with its picture, name, brand,
            live stock and real cost, so you can check it before adding.
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
            placeholder="e.g. ON-GOLD-WHEY-2270, APP-CREA-250"
            className="flex-1 min-w-[220px] text-sm rounded-xl px-3 py-2 border resize-y"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--edge)', color: 'var(--ink-1)' }}
          />
          <button
            onClick={lookup}
            disabled={looking || !input.trim()}
            className="text-xs font-bold px-3 py-2 rounded-xl border disabled:opacity-40 self-start"
            style={{ borderColor: `var(--accent-line)`, color: 'var(--accent)' }}
          >
            {looking ? 'Looking…' : 'Look up'}
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadSamples}
            disabled={sampling}
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border disabled:opacity-40"
            style={{ borderColor: 'var(--edge)', color: 'var(--ink-3)' }}
          >
            {sampling ? 'Reading the feed…' : 'Show me some SKUs'}
          </button>
          {source && results && (
            <span className="text-[10px] text-[var(--ink-3)]">Answered by the {source} supplier.</span>
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
                    <button
                      key={sku}
                      onClick={() => setInput((v) => (v.trim() ? `${v.trim()}, ${sku}` : sku))}
                      className="text-[10px] font-semibold px-2 py-1 rounded-md border"
                      style={{ borderColor: 'var(--edge)', color: 'var(--ink-2)' }}
                    >
                      {sku}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setInput(samples.join(', '))}
                  className="text-[10px] font-bold underline"
                  style={{ color: 'var(--accent)' }}
                >
                  Put all {samples.length} in the box
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {notFound.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--tone-critical)' }}>
          Not in the feed: {notFound.join(', ')}
        </p>
      )}

      {results && results.length === 0 && notFound.length === 0 && (
        <p className="text-sm text-[var(--ink-3)]">Nothing found for those SKUs.</p>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          {results.map((r) => (
            <ProductCard key={r.sku} row={r} adding={adding} onAdd={() => add([r.sku])} />
          ))}

          {addable.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => add(addable.map((r) => r.sku))}
                disabled={adding}
                className="text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-40"
                style={{ background: 'var(--accent)', color: 'var(--ink-on-accent)' }}
              >
                {adding ? 'Adding…' : `Add all ${addable.length} separately`}
              </button>
              {/* PowerBody sell each flavour as its own SKU, so this is how four
                  codes become one product with a flavour picker. */}
              <button
                onClick={() => add(addable.map((r) => r.sku), true)}
                disabled={adding}
                className="text-xs font-bold px-3 py-2 rounded-xl border disabled:opacity-40"
                style={{ borderColor: `var(--accent-line)`, color: 'var(--accent)' }}
              >
                Add as ONE product ({addable.length} variants)
              </button>
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
        <span className="text-[10px] font-bold uppercase shrink-0" style={{ color: 'var(--accent)' }}>Added</span>
      ) : (
        <button
          onClick={onAdd}
          disabled={adding}
          className="text-xs font-bold px-3 py-1.5 rounded-xl border shrink-0 disabled:opacity-40"
          style={{ borderColor: `var(--accent-line)`, color: 'var(--accent)' }}
        >
          Add
        </button>
      )}
    </div>
  )
}
