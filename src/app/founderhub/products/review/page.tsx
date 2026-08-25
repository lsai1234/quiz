'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { REVIEW_FIELDS, type ReviewField } from '@/lib/catalogue/review'
import type { CatalogueProduct, FieldSource } from '@/lib/catalogue/types'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Badge, Button, Card, Checkbox, Input, Textarea } from '@/components/system'


interface Row {
  product: CatalogueProduct
  remaining: string[]
  complete: boolean
}

/** How each provenance reads on screen, and how much attention it deserves. */
/**
 * Where each value came from, and how much to trust it.
 *
 * The tone carries the meaning: positive is somebody's word for it — the
 * supplier's or yours — attention is something this system worked out and has to
 * be checked before it goes on sale.
 */
const SOURCE_LABEL: Record<FieldSource, { text: string; tone: 'positive' | 'accent' | 'attention'; note: string }> = {
  supplier: { text: 'PowerBody', tone: 'positive', note: 'Exactly what the supplier sent.' },
  rule: { text: 'Our rule', tone: 'accent', note: 'Computed by our own pricing/mapping rules.' },
  ai: { text: 'AI', tone: 'attention', note: 'Written by the model. Check it.' },
  heuristic: { text: 'Keyword match', tone: 'attention', note: 'Our deterministic classifier — blunt, never invented.' },
  founder: { text: 'You', tone: 'positive', note: 'You set this.' },
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
  /** Products ticked in the queue, for combining flavours into one product. */
  const [picked, setPicked] = useState<Set<string>>(new Set())
  /** How many a pending "discard" press would remove — the confirm step. */
  const [confirmBulk, setConfirmBulk] = useState<number | null>(null)
  /**
   * Walk the queue one product at a time instead of picking off a list.
   *
   * A hundred imported products is not a list anybody works through by choosing
   * what to click next — the choosing IS the work, and it is what makes a queue
   * of a hundred feel unfinishable. In journey mode the next product is simply
   * there, and every action moves to the one after it.
   */
  const [journey, setJourney] = useState(false)
  const [enriching, setEnriching] = useState(false)

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
    if (journey) advance(id)
    else setOpenId(null)
    load()
  }

  /**
   * Fold the ticked products into one with a variant each.
   *
   * PowerBody have no variant concept — every flavour is its own SKU with its
   * own name — so without this a four-flavour product is four products in the
   * shop and a customer is offered the same tub four times.
   */
  async function combine() {
    const ids = [...picked]
    if (ids.length < 2) return
    const d = await send('', { action: 'combine', ids })
    if (!d) return
    setPicked(new Set())
    setNotice(`Combined into one product with ${d.variants} variants. Check it over, then approve.`)
    setOpenId(d.id)
    load()
  }

  /**
   * Discard everything ticked.
   *
   * Two-step on purpose: a hundred products are a morning's curation, and a
   * single mis-tap on a "Discard all" is not something anyone can undo — a
   * discarded import leaves no trace by design, so there is nothing to restore
   * from. The second press is the confirmation.
   */
  async function discardPicked() {
    const ids = [...picked]
    if (ids.length === 0) return
    if (confirmBulk !== ids.length) {
      setConfirmBulk(ids.length)
      return
    }
    const d = await send('', { action: 'discard', ids })
    setConfirmBulk(null)
    if (!d) return
    setPicked(new Set())
    setNotice(`${d.discarded} discarded. Nothing was published.`)
    setOpenId(null)
    load()
  }

  /**
   * Fetch this product's picture, description and live cost from PowerBody.
   *
   * One call, for the product on screen. The bulk import deliberately does not
   * do this for a hundred products in a row: that is what trips their rate
   * limiter, and a refused batch leaves every product pictureless at once.
   */
  async function enrich(id: string) {
    setEnriching(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/products/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'enrich' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        // PowerBody's own words when they gave any — the reason is the useful part.
        setError(d.error ?? 'Could not reach PowerBody.')
        return
      }
      setNotice(d.gotImage ? 'Picture and details pulled from PowerBody.' : 'Details pulled — they have no picture for this one.')
      await load()
    } catch {
      setError('Could not reach PowerBody.')
    } finally {
      setEnriching(false)
    }
  }

  /** Move to the next product in the queue, or end the journey when done. */
  function advance(fromId: string) {
    const list = rows ?? []
    const index = list.findIndex((r) => r.product.id === fromId)
    const next = list.slice(index + 1).find((r) => r.product.id !== fromId)
    setOpenId(next ? next.product.id : null)
    if (!next) setJourney(false)
  }

  async function discard(id: string, title: string) {
    const d = await send(id, { action: 'discard' })
    if (!d) return
    setNotice(`${title} discarded. Nothing was published.`)
    if (journey) advance(id)
    else setOpenId(null)
    load()
  }

  if (rows === null) return <p className="text-sm text-[var(--ink-3)]">Loading the review queue…</p>

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black mb-1" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          Review
        </h2>
        <p className="text-sm text-[var(--ink-3)]">
          Products added from PowerBody wait here. They are not in the shop or the quiz until you approve them —
          PowerBody sends the product, but the stack slots, goals and copy are worked out by us, and those decide who
          gets recommended it.
        </p>
      </div>

      {notice && (
        <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: `var(--positive-fill)`, color: 'var(--ink-2)', border: `1px solid var(--positive-line)` }}>
          {notice}
        </p>
      )}
      {error && (
        <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: 'var(--surface-2)', color: 'var(--tone-critical)', border: '1px solid var(--critical-line)' }}>
          {error}
        </p>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-[var(--ink-3)] py-8 text-center rounded-2xl border" style={{ borderColor: 'var(--edge)', background: 'var(--surface-1)' }}>
          Nothing waiting. Products you add in <strong style={{ color: 'var(--ink-2)' }}>PowerBody</strong> land
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
          onEnrich={() => enrich(open.product.id)}
          enriching={enriching}
          journey={
            journey
              ? {
                  position: (rows ?? []).findIndex((r) => r.product.id === open.product.id) + 1,
                  total: (rows ?? []).length,
                  onSkip: () => advance(open.product.id),
                  onLeave: () => { setJourney(false); setOpenId(null) },
                }
              : null
          }
        />
      ) : (
        <div className="space-y-2">
          {/* Always shown, so clearing a queue of a hundred does not require
              ticking a hundred boxes first. */}
          <Card padding="tight" className="flex flex-wrap items-center gap-2">
            <Checkbox
              label={picked.size === rows.length ? 'Deselect all' : `Select all ${rows.length}`}
              checked={rows.length > 0 && picked.size === rows.length}
              onChange={() => {
                setConfirmBulk(null)
                setPicked((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.product.id))))
              }}
            />
            <span className="flex-1" />
            {/* The way in. Working a hundred products means never choosing
                which one is next — see the `journey` note above. */}
            {picked.size === 0 && rows.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => { setJourney(true); setOpenId(rows[0].product.id) }}
              >
                Review all {rows.length}, one at a time
              </Button>
            )}
            {picked.size > 0 && (
              <>
                <Button variant="primary" size="sm" loading={busy} disabled={picked.size < 2} onClick={combine}>
                  Combine into one
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  loading={busy}
                  onClick={discardPicked}
                  // The count is in the label so the confirm press says what it
                  // is about to do, rather than asking twice for "are you sure".
                >
                  {confirmBulk === picked.size
                    ? `Tap again to discard ${picked.size}`
                    : `Discard ${picked.size}`}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setPicked(new Set()); setConfirmBulk(null) }}>
                  Clear
                </Button>
              </>
            )}
          </Card>

          {picked.size > 1 && (
            <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
              Combine only when these are flavours of the same product — each keeps its own supplier SKU and becomes
              a variant. Different sizes must stay separate.
            </p>
          )}

          {rows.map(({ product, remaining, complete }) => (
            // `solid`: the review queue is a long scrolling list.
            <Card key={product.id} solid padding="tight" className="flex items-center gap-3">
              <Checkbox
                label={`Select ${product.title}`}
                hideLabel
                className="shrink-0"
                checked={picked.has(product.id)}
                onChange={() =>
                  setPicked((prev) => {
                    const next = new Set(prev)
                    if (next.has(product.id)) next.delete(product.id)
                    else next.add(product.id)
                    return next
                  })
                }
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {product.imageUrl ? (
                <img src={product.imageUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl shrink-0 grid place-items-center" style={{ background: 'var(--surface-2)', fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
                  No image
                </div>
              )}
              <Button
                variant="ghost"
                className="min-w-0 flex-1 justify-start text-left"
                aria-label={`Review ${product.title}`}
                onClick={() => setOpenId(product.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate" style={{ fontSize: 'var(--text-body-sm)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
                    {product.title}
                  </span>
                  <span className="block" style={{ fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-body)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
                    {product.category || 'Uncategorised'} · {money(product.cost)} → {money(product.basePrice)}
                    {product.variants.length > 1 && ` · ${product.variants.length} variants`}
                  </span>
                </span>
              </Button>
              <Badge tone={complete ? 'positive' : 'attention'} className="shrink-0">
                {complete ? 'Ready to approve' : `${remaining.length} to check`}
              </Badge>
            </Card>
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
  onEnrich,
  enriching,
  journey,
}: {
  row: Row
  busy: boolean
  onBack: () => void
  onSave: (patch: Partial<CatalogueProduct>, confirm: string[]) => Promise<void>
  onApprove: () => void
  onDiscard: () => void
  /** Fetch this one product's picture and details from PowerBody. */
  onEnrich: () => void
  enriching: boolean
  /** Set when walking the queue rather than picking off the list. */
  journey: { position: number; total: number; onSkip: () => void; onLeave: () => void } | null
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

  // What the supplier could fill in that the roster never could.
  const missingFromSupplier = !product.imageUrl || !product.description

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={onBack}>
          Queue
        </Button>
        <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
          {product.title}
        </p>
      </div>

      {/* Offered here rather than done during the import: a hundred throttled
          calls in a row is what makes PowerBody start refusing, and a refused
          batch leaves every product pictureless at once. One call, for the
          product actually on screen. */}
      {missingFromSupplier && (
        <Card padding="tight" className="flex items-center gap-2 flex-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {product.imageUrl ? (
            <img src={product.imageUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-xl shrink-0 grid place-items-center" style={{ background: 'var(--surface-2)', fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
              No image
            </div>
          )}
          <p className="flex-1" style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', minWidth: '12rem' }}>
            {product.imageUrl ? 'No description yet.' : 'No picture or description yet.'} PowerBody hold both —
            fetching also refreshes what they charge us, and the shelf price with it.
          </p>
          <Button variant="secondary" size="sm" loading={enriching} onClick={onEnrich}>
            Pull from PowerBody
          </Button>
        </Card>
      )}

      <Card elevation={2} padding="tight">
        <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-2)' }}>
          Fields marked <strong style={{ color: 'var(--tone-positive)' }}>PowerBody</strong> are a faithful copy of the feed and are shown
          for context only. The ones marked <strong style={{ color: 'var(--tone-attention)' }}>AI</strong> or{' '}
          <strong style={{ color: 'var(--tone-attention)' }}>Keyword match</strong> were worked out here — confirm or correct each before
          approving.
        </p>
      </Card>

      {/* What the customer will actually be able to pick, and which supplier SKU
          each choice orders. The only place a combine can be checked. */}
      <Card padding="tight">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
            {product.variants.length === 1 ? 'One variant' : `${product.variants.length} variants`}
          </span>
          <Badge tone="positive">PowerBody</Badge>
        </div>
        <div className="space-y-1">
          {product.variants.map((v) => (
            <div key={v.id} className="flex items-center gap-2 flex-wrap" style={{ fontSize: 'var(--text-meta)' }}>
              <span style={{ fontWeight: 'var(--weight-strong)', color: 'var(--ink-2)' }}>{v.flavour || v.size || v.title}</span>
              <span style={{ color: 'var(--ink-3)' }}>{v.sku ?? 'no SKU'}</span>
              <span style={{ color: 'var(--ink-3)' }}>{money(v.price)}</span>
              <span style={{ color: v.available ? 'var(--ink-3)' : 'var(--tone-critical)' }}>
                {v.available ? `${v.inventory ?? '—'} in stock` : 'Out of stock'}
              </span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', marginTop: 'var(--space-2)' }}>
          Each variant orders its own SKU, and stock is tracked per variant.
        </p>
      </Card>

      <div className="space-y-2">
        {REVIEW_FIELDS.map((field) => {
          const source = (sources[field.key] ?? 'rule') as FieldSource
          const meta = SOURCE_LABEL[source]
          const needsCheck = outstanding.has(field.key as string)
          const value = product[field.key]
          const draft = drafts[field.key as string]
          const shown = draft ?? asText(value)

          return (
            // Tinted only while it still needs a look. A field already checked
            // off is not the thing on this page asking for attention.
            <Card key={field.key as string} padding="tight" tone={needsCheck ? 'attention' : undefined}>
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
                  {field.label}
                </span>
                {/* `title` on the wrapper, not the Badge: the hover note is the
                    element's, and Badge takes no arbitrary DOM props. */}
                <span title={meta.note}>
                  <Badge tone={meta.tone}>{meta.text}</Badge>
                </span>
                {confirmed.has(field.key as string) && (
                  <Badge tone="positive" icon="check">
                    checked
                  </Badge>
                )}
              </div>

              {field.kind === 'image' ? (
                value ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={String(value)} alt="" className="w-24 h-24 rounded-xl object-cover" />
                ) : (
                  <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>
                    PowerBody sent no image for this product.
                  </p>
                )
              ) : field.kind === 'longtext' ? (
                // `compact`: the card heading above is already the field's name,
                // and a stacked label would draw it a second time.
                <Textarea
                  label={field.label}
                  value={shown}
                  rows={3}
                  onChange={(e) => setDrafts((d) => ({ ...d, [field.key as string]: e.target.value }))}
                  hideLabel
                />
              ) : (
                <Input
                  label={field.label}
                  compact
                  className="w-full"
                  value={shown}
                  onChange={(e) => setDrafts((d) => ({ ...d, [field.key as string]: e.target.value }))}
                />
              )}

              {field.note && (
                <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', marginTop: 'var(--space-2)' }}>
                  {field.note}
                </p>
              )}

              {needsCheck && (
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    size="sm"
                    loading={busy}
                    aria-label={`${drafts[field.key as string] !== undefined ? 'Save and check off' : 'Confirm'} ${field.label}`}
                    onClick={() => {
                      const raw = drafts[field.key as string]
                      const patch =
                        raw === undefined ? {} : ({ [field.key]: parse(field, raw) } as Partial<CatalogueProduct>)
                      onSave(patch, [field.key as string])
                    }}
                  >
                    {drafts[field.key as string] !== undefined ? 'Save & check off' : 'Looks right'}
                  </Button>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Sits at the end of the fields rather than floating over them — stuck to
          the viewport it covered whichever field happened to be under it. */}
      <Card padding="tight" className="flex items-center gap-2 flex-wrap">
        <Button
          variant={complete ? 'primary' : 'secondary'}
          loading={busy}
          disabled={!complete}
          onClick={onApprove}
        >
          {complete ? 'Approve — put it on sale' : `${remaining.length} field${remaining.length === 1 ? '' : 's'} left to check`}
        </Button>
        <Button variant="destructive" loading={busy} onClick={onDiscard}>
          Discard
        </Button>
      </Card>
    </div>
  )
}
