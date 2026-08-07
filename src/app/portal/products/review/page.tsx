'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { REVIEW_FIELDS, type ReviewField } from '@/lib/catalogue/review'
import type { CatalogueProduct, FieldSource } from '@/lib/catalogue/types'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'

interface Row {
  product: CatalogueProduct
  remaining: string[]
  complete: boolean
}

/** How each provenance reads on screen, and how much attention it deserves. */
const SOURCE_LABEL: Record<FieldSource, { text: string; colour: string; note: string }> = {
  supplier: { text: 'PowerBody', colour: GREEN, note: 'Exactly what the supplier sent.' },
  rule: { text: 'Our rule', colour: ACCENT, note: 'Computed by our own pricing/mapping rules.' },
  ai: { text: 'AI', colour: AMBER, note: 'Written by the model. Check it.' },
  heuristic: { text: 'Keyword match', colour: AMBER, note: 'Our deterministic classifier — blunt, never invented.' },
  founder: { text: 'You', colour: GREEN, note: 'You set this.' },
}

const money = (n: unknown) => (typeof n === 'number' ? `£${n.toFixed(2)}` : '—')

function asText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Import review — the gate between "added from PowerBody" and "on sale".
 *
 * An imported product is three things wearing the same clothes: supplier data,
 * our own rules, and a model's guesses. The last of those decides which stack
 * slots and goals a product is eligible for, which is to say *who gets
 * recommended it* — and none of that is covered by the claim gate on the copy.
 * So every field that wasn't simply copied from PowerBody gets looked at here,
 * labelled with where it came from, before the product can be sold.
 */
export default function ReviewPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/portal/products/review', { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'Could not load the review queue.')
        setRows([])
        return
      }
      setRows(d.products ?? [])
    } catch {
      setError('Could not load the review queue.')
      setRows([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  const open = useMemo(() => rows?.find((r) => r.product.id === openId) ?? null, [rows, openId])

  async function send(id: string, body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/products/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'That did not save.')
        return null
      }
      return d
    } catch {
      setError('That did not save.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function approve(id: string, title: string) {
    const d = await send(id, { action: 'approve' })
    if (!d) return
    invalidateCatalogue() // it is sellable from this moment
    setNotice(`${title} is approved and on sale.`)
    setOpenId(null)
    load()
  }

  async function discard(id: string, title: string) {
    const d = await send(id, { action: 'discard' })
    if (!d) return
    setNotice(`${title} discarded. Nothing was published.`)
    setOpenId(null)
    load()
  }

  if (rows === null) return <p className="text-sm text-[var(--color-muted)]">Loading the review queue…</p>

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Review
        </h2>
        <p className="text-sm text-[var(--color-muted)]">
          Products added from PowerBody wait here. They are not in the shop or the quiz until you approve them —
          PowerBody sends the product, but the stack slots, goals and copy are worked out by us, and those decide who
          gets recommended it.
        </p>
      </div>

      {notice && (
        <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: `color-mix(in srgb, ${GREEN} 12%, transparent)`, color: 'var(--color-text-2)', border: `1px solid color-mix(in srgb, ${GREEN} 30%, transparent)` }}>
          {notice}
        </p>
      )}
      {error && (
        <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: 'var(--color-surface-2)', color: 'var(--color-red)', border: '1px solid color-mix(in srgb, var(--color-red) 30%, transparent)' }}>
          {error}
        </p>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-[var(--color-muted)] py-8 text-center rounded-2xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          Nothing waiting. Products you add in <strong style={{ color: 'var(--color-text-2)' }}>PowerBody</strong> land
          here for checking before they go on sale.
        </p>
      )}

      {open ? (
        <ProductReview
          key={open.product.id}
          row={open}
          busy={busy}
          onBack={() => setOpenId(null)}
          onSave={async (patch, confirm) => {
            const d = await send(open.product.id, { patch, confirm })
            if (d) {
              setRows((prev) =>
                prev
                  ? prev.map((r) =>
                      r.product.id === open.product.id
                        ? { product: d.product, remaining: d.remaining, complete: d.complete }
                        : r,
                    )
                  : prev,
              )
            }
          }}
          onApprove={() => approve(open.product.id, open.product.title)}
          onDiscard={() => discard(open.product.id, open.product.title)}
        />
      ) : (
        <div className="space-y-2">
          {rows.map(({ product, remaining, complete }) => (
            <button
              key={product.id}
              onClick={() => setOpenId(product.id)}
              className="w-full text-left rounded-2xl border p-3.5 flex items-center gap-3"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {product.imageUrl ? (
                <img src={product.imageUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl shrink-0 grid place-items-center text-[9px] text-[var(--color-muted)]" style={{ background: 'var(--color-surface-2)' }}>
                  No image
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>
                  {product.title}
                </p>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                  {product.category || 'Uncategorised'} · {money(product.cost)} → {money(product.basePrice)}
                </p>
              </div>
              <span
                className="text-[10px] font-bold uppercase shrink-0 px-2 py-1 rounded-lg"
                style={{
                  color: complete ? GREEN : AMBER,
                  background: `color-mix(in srgb, ${complete ? GREEN : AMBER} 12%, transparent)`,
                }}
              >
                {complete ? 'Ready to approve' : `${remaining.length} to check`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** One product, field by field, with where each value came from. */
function ProductReview({
  row,
  busy,
  onBack,
  onSave,
  onApprove,
  onDiscard,
}: {
  row: Row
  busy: boolean
  onBack: () => void
  onSave: (patch: Partial<CatalogueProduct>, confirm: string[]) => Promise<void>
  onApprove: () => void
  onDiscard: () => void
}) {
  const { product, remaining, complete } = row
  const sources = product.review?.sources ?? {}
  const confirmed = new Set(product.review?.confirmed ?? [])
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const outstanding = new Set(remaining)

  function parse(field: ReviewField, raw: string): unknown {
    if (field.kind === 'list') return raw.split(',').map((s) => s.trim()).filter(Boolean)
    if (field.kind === 'money') return Number(raw)
    if (field.kind === 'boolean') return raw === 'Yes'
    if (field.key === 'servings' || field.key === 'weightGrams') {
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    }
    return raw
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onBack} className="text-xs font-bold px-3 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)]">
          ← Queue
        </button>
        <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
          {product.title}
        </p>
      </div>

      <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
        Fields marked <strong style={{ color: GREEN }}>PowerBody</strong> are a faithful copy of the feed and are shown
        for context only. The ones marked <strong style={{ color: AMBER }}>AI</strong> or{' '}
        <strong style={{ color: AMBER }}>Keyword match</strong> were worked out here — confirm or correct each before
        approving.
      </p>

      <div className="space-y-2">
        {REVIEW_FIELDS.map((field) => {
          const source = (sources[field.key] ?? 'rule') as FieldSource
          const meta = SOURCE_LABEL[source]
          const needsCheck = outstanding.has(field.key as string)
          const value = product[field.key]
          const draft = drafts[field.key as string]
          const shown = draft ?? asText(value)

          return (
            <div
              key={field.key as string}
              className="rounded-2xl border p-3.5"
              style={{
                background: 'var(--color-surface)',
                borderColor: needsCheck ? `color-mix(in srgb, ${AMBER} 35%, transparent)` : 'var(--color-border)',
              }}
            >
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-xs font-bold text-[var(--color-text)]">{field.label}</span>
                <span
                  className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                  style={{ color: meta.colour, background: `color-mix(in srgb, ${meta.colour} 12%, transparent)` }}
                  title={meta.note}
                >
                  {meta.text}
                </span>
                {confirmed.has(field.key as string) && (
                  <span className="text-[9px] font-bold uppercase" style={{ color: GREEN }}>✓ checked</span>
                )}
              </div>

              {field.kind === 'image' ? (
                value ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={String(value)} alt="" className="w-24 h-24 rounded-xl object-cover" />
                ) : (
                  <p className="text-xs text-[var(--color-muted)]">PowerBody sent no image for this product.</p>
                )
              ) : field.kind === 'longtext' ? (
                <textarea
                  value={shown}
                  rows={3}
                  onChange={(e) => setDrafts((d) => ({ ...d, [field.key as string]: e.target.value }))}
                  className="w-full text-sm rounded-xl px-3 py-2 border resize-y"
                  style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              ) : (
                <input
                  value={shown}
                  onChange={(e) => setDrafts((d) => ({ ...d, [field.key as string]: e.target.value }))}
                  className="w-full text-sm rounded-xl px-3 py-2 border"
                  style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              )}

              {field.note && <p className="text-[10px] text-[var(--color-muted)] mt-1.5">{field.note}</p>}

              {needsCheck && (
                <div className="flex items-center gap-2 mt-2">
                  <button
                    disabled={busy}
                    onClick={() => {
                      const raw = drafts[field.key as string]
                      const patch =
                        raw === undefined ? {} : ({ [field.key]: parse(field, raw) } as Partial<CatalogueProduct>)
                      onSave(patch, [field.key as string])
                    }}
                    className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border disabled:opacity-40"
                    style={{ borderColor: `color-mix(in srgb, ${GREEN} 40%, transparent)`, color: GREEN }}
                  >
                    {drafts[field.key as string] !== undefined ? 'Save & check off' : 'Looks right'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Sits at the end of the fields rather than floating over them — stuck to
          the viewport it covered whichever field happened to be under it. */}
      <div
        className="flex items-center gap-2 flex-wrap rounded-2xl border p-3.5"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <button
          onClick={onApprove}
          disabled={busy || !complete}
          className="text-xs font-bold px-4 py-2.5 rounded-xl disabled:opacity-40"
          style={{ background: complete ? GREEN : 'var(--color-surface-2)', color: complete ? '#00180c' : 'var(--color-muted)' }}
        >
          {complete ? 'Approve — put it on sale' : `${remaining.length} field${remaining.length === 1 ? '' : 's'} left to check`}
        </button>
        <button
          onClick={onDiscard}
          disabled={busy}
          className="text-xs font-bold px-3 py-2.5 rounded-xl border disabled:opacity-40"
          style={{ borderColor: 'color-mix(in srgb, var(--color-red) 40%, transparent)', color: 'var(--color-red)' }}
        >
          Discard
        </button>
      </div>
    </div>
  )
}
