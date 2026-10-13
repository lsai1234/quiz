'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge, Button, Card, Checkbox, Input, Note } from '@/components/system'
import { ImageField } from '@/components/portal/ImageField'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { masterVariant } from '@/lib/catalogue/master'
import { applyTree } from '@/lib/catalogue/tree'
import { skuGroups, normaliseSize, sizeFromName } from '@/lib/catalogue/split'
import { servingsForVariant } from '@/lib/shop/per-serving'
import { commonProductName, nameSwap, withoutProductName } from '@/lib/supplier/variant-labels'
import type { PriceRow } from '@/lib/catalogue/price'
import { productHref } from '@/lib/portal/product-links'
import {
  Outcome,
  ReviewMark,
  Section,
  EYEBROW,
  META,
  errorText,
  money,
  postProduct,
  readStream,
  useDraft,
  type Payload,
} from './shared'

type Props = {
  payload: Payload
  onPayload: (p: Payload) => void
  onDirty: (section: string, dirty: boolean) => void
}

/**
 * Small print on a tinted card.
 *
 * `--ink-3` at `--text-micro` is only legible on the plain surfaces (tokens.css:
 * "--ink-3 on --surface-1 or --surface-2"). A tone card's fill is neither — it
 * lightens whatever it sits on — and these cards sit inside the section's own
 * card, so the warning a founder must read before a merge or split came out at
 * about 3.9:1. `--ink-2` stays above AA on every tint here.
 */
const META_ON_TINT: CSSProperties = { ...META, color: 'var(--ink-2)' }

type RefusalLink = { label: string; href: string }

/**
 * Flavours, sizes & prices — every SKU this product sells, and the one place
 * each SKU's facts are edited.
 *
 * A PowerBody product is several SKUs (one per flavour, sometimes per size), one
 * of which is the MASTER: the product's price, picture, cost and serving count
 * are that SKU's. Each row here is one SKU, summarised the way the shop shows
 * it; opening a row edits everything about that SKU in one place — its name in
 * the picker, size, servings, picture, price, "was" price, cost and PowerBody id.
 * The old screens spread those over three panels that each kept their own copy,
 * and a save in one put back another's stale numbers.
 */
export function VariantsSection({ payload, onPayload, onDirty }: Props) {
  const router = useRouter()
  const { product } = payload
  const master = masterVariant(product)
  const [open, setOpen] = useState<string | null>(null)
  const [moving, setMoving] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Where to go about a refusal ("Open Critical Whey"), when the server names somewhere.
  const [errorLink, setErrorLink] = useState<RefusalLink | null>(null)
  // A removed product is not split: the half moved out would go on sale on its own.
  const canSplit = payload.state !== 'removed'

  // Ticks belong to the SKUs on screen; a split or merge changes them.
  useEffect(() => {
    setMoving((m) => new Set([...m].filter((id) => product.variants.some((v) => v.id === id))))
  }, [product.variants])

  async function send(url: string, body: Record<string, unknown>, label: string, success: string): Promise<boolean> {
    setBusy(label)
    setDone(null)
    setError(null)
    setErrorLink(null)
    const result = await postProduct(url, body)
    setBusy(null)
    if (!result.ok) {
      setError(errorText(result))
      setErrorLink(result.link ?? null)
      return false
    }
    onPayload(result.payload)
    setDone(success)
    return true
  }

  async function split() {
    setBusy('split')
    setError(null)
    setErrorLink(null)
    setDone(null)
    try {
      const res = await fetch('/api/portal/products/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, variantIds: [...moving] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? `Could not split that product (HTTP ${res.status}).`)
        setErrorLink(data.link ?? null)
        return
      }
      // Straight to the new product: naming it is the next thing to do.
      router.push(productHref(data.moved.id))
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(null)
    }
  }

  const rows = useMemo(() => new Map(payload.priceRows.map((r) => [r.variantId, r])), [payload.priceRows])
  const belowCost = payload.priceRows.filter((r) => r.belowCost)
  const groups = skuGroups(product)
  const sized = groups.filter((g) => g.key)
  const masterKey = normaliseSize(master?.size)
  const strangers = sized.length > 1 ? sized.filter((g) => g.key !== masterKey) : []
  const movingAll = moving.size >= product.variants.length

  const ordered = master ? [master, ...product.variants.filter((v) => v.id !== master.id)] : product.variants

  return (
    <Section
      id="variants"
      title="Flavours, sizes & prices"
      summary={`${product.variants.length} SKU${product.variants.length === 1 ? '' : 's'}${sized.length > 1 ? ` in ${sized.length} sizes` : ''} · master ${master ? master.title : '—'} · from ${money(Math.min(...product.variants.map((v) => v.price)))}`}
      tone={payload.remaining.includes('basePrice') || belowCost.length > 0 ? 'attention' : undefined}
    >
      <p style={META}>
        Prices follow our rule — what PowerBody charge us × {payload.markupOnCost}, ending .99 — unless you set one yourself, which
        no pull ever changes. The master SKU gives the product its price, picture, cost and serving count, and its page opens on it.
      </p>
      {payload.remaining.includes('basePrice') && (
        <div className="flex items-center flex-wrap gap-2">
          <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>What we charge needs checking.</span>
          <ReviewMark
            field="basePrice"
            payload={payload}
            busy={busy === 'confirm'}
            onConfirm={() => void send('/api/portal/products', { id: product.id, confirm: ['basePrice'] }, 'confirm', 'Checked.')}
          />
        </div>
      )}
      {belowCost.length > 0 && (
        <Note tone="attention">
          {belowCost.map((r) => `${r.label} sells at ${money(r.price)} but costs us ${money(r.cost)}`).join('; ')}. Open the SKU to set a price, or use the rule.
        </Note>
      )}

      <NamingTools payload={payload} busy={busy} send={send} />

      {strangers.length > 0 && (
        <Note tone="attention">
          <p>
            These SKUs are {sized.length} different sizes: {sized.map((g) => `${g.variants.length} × ${g.label}`).join(', ')}. A different size
            is a different unit of sale — its own price, picture and serving count — so it usually belongs on a page of its own.
            {!canSplit && ' Restore this product before splitting them — while it is off sale, a size moved out would go on sale on its own.'}
          </p>
          {canSplit && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {strangers.map((g) => (
                <Button key={g.key} variant="secondary" size="sm" onClick={() => setMoving(new Set(g.variants.map((v) => v.id)))}>
                  Tick the {g.variants.length} × {g.label}
                </Button>
              ))}
            </div>
          )}
        </Note>
      )}

      <div className="space-y-2">
        {ordered.map((v) => (
          <SkuRow
            key={v.id}
            product={product}
            variant={v}
            row={rows.get(v.id)}
            isMaster={v.id === master?.id}
            open={open === v.id}
            onToggle={() => setOpen((o) => (o === v.id ? null : v.id))}
            canMove={canSplit}
            moving={moving.has(v.id)}
            onMoving={(on) =>
              setMoving((all) => {
                const next = new Set(all)
                if (on) next.add(v.id)
                else next.delete(v.id)
                return next
              })
            }
            onPayload={onPayload}
            onDirty={onDirty}
          />
        ))}
      </div>

      {canSplit && moving.size > 0 && (
        <Card elevation={2} tone={movingAll ? 'critical' : 'attention'} className="space-y-2">
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
            {moving.size} SKU{moving.size === 1 ? '' : 's'} ticked to move out.
          </p>
          <p style={META_ON_TINT}>
            {movingAll
              ? 'Every SKU is ticked, which is not a split — leave at least one behind.'
              : 'They become a product of their own, with this one’s description, tags and status. You will land on it to name it.'}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="primary" loading={busy === 'split'} disabled={busy !== null || movingAll} onClick={() => void split()}>
              Move {moving.size} into their own product
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMoving(new Set())}>
              Clear
            </Button>
          </div>
        </Card>
      )}

      <ServingsBySize product={product} busy={busy} send={send} />
      <AddFlavour product={product} onPayload={onPayload} />
      <MergeIn payload={payload} busy={busy} send={send} />
      <Outcome done={done} error={error} />
      {error && errorLink && (
        <p style={META}>
          <Link href={errorLink.href} style={{ textDecoration: 'underline' }}>
            {errorLink.label}
          </Link>
        </p>
      )}
    </Section>
  )
}

// ── Naming ───────────────────────────────────────────────────────────────────

type Send = (url: string, body: Record<string, unknown>, label: string, success: string) => Promise<boolean>

/**
 * One-press fixes for names, each saved at once.
 *
 * Saved straight away rather than staged into a form, because the product's
 * name is owned by Shop listing; a staged copy here would be a second unsaved
 * title on the page, waiting to overwrite the first.
 */
function NamingTools({ payload, busy, send }: { payload: Payload; busy: string | null; send: Send }) {
  const { product } = payload
  const labels = product.variants.map((v) => v.title)
  const suggestion = commonProductName(labels)
  const trimmable = product.variants.filter((v) => withoutProductName(v.title, product.title, v.size) !== v.title.trim())
  const master = masterVariant(product)
  const plan = master ? applyTree(product, master.id) : null
  const planChanges = plan?.variants
    ? product.variants.map((v, i) => ({ v, to: plan.variants![i]?.title })).filter((c) => c.to && c.to !== c.v.title)
    : []
  const planTitle = plan?.title && plan.title !== product.title ? plan.title : null
  if (product.variants.length < 2 && !planTitle) return null
  if ((!suggestion || suggestion === product.title.trim()) && trimmable.length === 0 && planChanges.length === 0 && !planTitle) return null

  return (
    <Card elevation={2} className="space-y-2">
      <p style={EYEBROW}>Names</p>
      {suggestion && suggestion !== product.title.trim() && (
        <div className="flex items-center flex-wrap gap-2">
          <span style={META}>Every flavour shares “{suggestion}”.</span>
          <Button
            size="sm"
            variant="ghost"
            loading={busy === 'name'}
            onClick={() => void send('/api/portal/products', { id: product.id, set: { title: suggestion } }, 'name', `The product is now called “${suggestion}”.`)}
          >
            Make it the product name
          </Button>
        </div>
      )}
      {trimmable.length > 0 && (
        <div className="flex items-center flex-wrap gap-2">
          <span style={META}>
            {trimmable.length} flavour name{trimmable.length === 1 ? ' repeats' : 's repeat'} the product’s name.
          </span>
          <Button
            size="sm"
            variant="ghost"
            loading={busy === 'trim'}
            onClick={() =>
              void send(
                '/api/portal/products',
                { id: product.id, variants: trimmable.map((v) => ({ id: v.id, title: withoutProductName(v.title, product.title, v.size) })) },
                'trim',
                'Flavour names tidied.',
              )
            }
          >
            Take “{product.title}” off them
          </Button>
        </div>
      )}
      {(planTitle || planChanges.length > 0) && (
        <div className="space-y-1">
          <p style={META}>
            Worked out from the master: {planTitle ? <>the product becomes <strong>{planTitle}</strong>; </> : null}
            {planChanges.map((c) => `${c.v.sku ?? c.v.id} → ${c.to}`).join(', ')}
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'tree'}
            onClick={() =>
              void send(
                '/api/portal/products',
                {
                  id: product.id,
                  ...(planTitle ? { set: { title: planTitle } } : {}),
                  variants: planChanges.map((c) => ({ id: c.v.id, title: c.to })),
                },
                'tree',
                'Names set from the master.',
              )
            }
          >
            Use these names
          </Button>
        </div>
      )}
    </Card>
  )
}

// ── One SKU ──────────────────────────────────────────────────────────────────

function SkuRow({
  product,
  variant,
  row,
  isMaster,
  open,
  onToggle,
  canMove,
  moving,
  onMoving,
  onPayload,
  onDirty,
}: {
  product: CatalogueProduct
  variant: CatalogueVariant
  row: PriceRow | undefined
  isMaster: boolean
  open: boolean
  onToggle: () => void
  canMove: boolean
  moving: boolean
  onMoving: (on: boolean) => void
  onPayload: (p: Payload) => void
  onDirty: (section: string, dirty: boolean) => void
}) {
  const servings = servingsForVariant(product, variant)
  const facts = [
    variant.sku ?? 'no SKU',
    (variant.size ?? '').trim() || 'no size',
    money(variant.price) + (variant.priceSource === 'founder' ? ' (yours)' : ''),
    variant.servings != null ? `${variant.servings} servings` : servings != null ? `${Math.round(servings)} servings*` : 'no servings',
    variant.available ? (variant.inventory != null ? `${variant.inventory} in stock` : 'in stock') : 'sold out',
    variant.supplierProductId ? `PowerBody ${variant.supplierProductId}` : 'no PowerBody id',
  ]
  return (
    // Solid, master or not: a tone here replaced the opaque row with a tint over
    // the section card, which puts the row's small print (and the whole editor
    // when it is open) under the contrast floor. The Master badge says which.
    <Card solid padding="tight" className="space-y-2">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="min-w-0 space-y-1" style={{ flex: '1 1 14rem' }}>
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)', overflowWrap: 'anywhere' }}>
            {variant.title} {isMaster && <Badge tone="accent">Master</Badge>}{' '}
            {row?.belowCost && <Badge tone="critical">Below cost</Badge>}
          </p>
          <p style={{ ...META, overflowWrap: 'anywhere' }}>{facts.join(' · ')}</p>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          {canMove && (
            <Checkbox label="Move out" aria-label={`Move ${variant.sku ?? variant.title} to its own product`} checked={moving} onChange={(e) => onMoving(e.target.checked)} />
          )}
          <Button size="sm" variant={open ? 'secondary' : 'ghost'} aria-expanded={open} onClick={onToggle}>
            {open ? 'Close' : 'Edit'}
          </Button>
        </div>
      </div>
      {open && <SkuEditor product={product} variant={variant} row={row} isMaster={isMaster} onPayload={onPayload} onDirty={onDirty} />}
    </Card>
  )
}

/** Everything about one SKU, in one form. */
function SkuEditor({
  product,
  variant,
  row,
  isMaster,
  onPayload,
  onDirty,
}: {
  product: CatalogueProduct
  variant: CatalogueVariant
  row: PriceRow | undefined
  isMaster: boolean
  onPayload: (p: Payload) => void
  onDirty: (section: string, dirty: boolean) => void
}) {
  const { draft, set, changed, reset, saved } = useDraft({
    title: variant.title,
    size: variant.size ?? '',
    servings: variant.servings != null ? String(variant.servings) : '',
    imageUrl: variant.imageUrl ?? '',
    compareAtPrice: variant.compareAtPrice != null ? String(variant.compareAtPrice) : '',
    cost: variant.cost != null ? String(variant.cost) : '',
    supplierProductId: variant.supplierProductId ?? '',
  })
  const [price, setPrice] = useState(variant.price.toFixed(2))
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const label = `SKU ${variant.sku ?? variant.title}`

  useEffect(() => setPrice(variant.price.toFixed(2)), [variant.price])
  useEffect(() => onDirty(label, changed.length > 0), [changed.length, label, onDirty])
  useEffect(() => () => onDirty(label, false), [label, onDirty])

  async function send(url: string, body: Record<string, unknown>, what: string, success: string, sent?: typeof draft) {
    setBusy(what)
    setDone(null)
    setError(null)
    const result = await postProduct(url, body)
    setBusy(null)
    if (!result.ok) {
      setError(errorText(result))
      return
    }
    // What was sent is saved, even where the server tidied it ("12.5" for "12.50").
    if (sent) saved(sent)
    onPayload(result.payload)
    setDone(success)
  }

  function save() {
    const edit: Record<string, unknown> = { id: variant.id }
    for (const key of changed) {
      const value = (draft[key] as string).trim()
      if (key === 'title') edit.title = value
      else if (key === 'size' || key === 'imageUrl' || key === 'supplierProductId') edit[key] = value || null
      else edit[key] = value === '' ? null : Number(value)
    }
    void send('/api/portal/products', { id: product.id, variants: [edit] }, 'save', 'Saved.', draft)
  }

  const swap = nameSwap(product.title, variant.title, variant.size)
  const priceNumber = Number(price)
  const priceChanged = Number.isFinite(priceNumber) && Math.abs(priceNumber - variant.price) >= 0.005

  return (
    <div className="space-y-3" style={{ borderTop: '1px solid var(--edge)', paddingTop: 'var(--space-3)' }}>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}>
        <Input label="Name in the picker" value={draft.title} onChange={(e) => set('title', e.target.value)} hint="What a customer chooses from: “Chocolate”, “1kg”." />
        <Input label="Size" value={draft.size} onChange={(e) => set('size', e.target.value)} hint="500g, 60 caps… Sizes keep products apart." />
        <Input
          label="Servings"
          inputMode="decimal"
          value={draft.servings}
          onChange={(e) => set('servings', e.target.value)}
          hint={variant.servings != null ? 'This SKU’s own count.' : 'Blank: scaled from the master by size.'}
        />
      </div>

      <div className="space-y-2">
        <p style={EYEBROW}>Price</p>
        <div className="flex items-end flex-wrap gap-2">
          <Input label={`Our price for ${variant.title}`} compact align="right" prefix="£" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          <Button
            size="sm"
            variant={priceChanged ? 'primary' : 'secondary'}
            loading={busy === 'price'}
            disabled={!priceChanged || busy !== null}
            onClick={() =>
              void send('/api/portal/products/price', { productId: product.id, variantId: variant.id, price: Math.round(priceNumber * 100) / 100 }, 'price', 'Price set — no pull will change it.')
            }
          >
            Set our price
          </Button>
          {variant.priceSource === 'founder' && (
            <Button
              size="sm"
              variant="ghost"
              loading={busy === 'rule'}
              onClick={() => void send('/api/portal/products/price', { productId: product.id, variantId: variant.id, price: null }, 'rule', 'Back on the rule price.')}
            >
              Use the rule price{row?.rulePrice != null ? ` (${money(row.rulePrice)})` : ''}
            </Button>
          )}
        </div>
        <p style={META}>
          PowerBody charge us {money(row?.cost ?? null)} · the rule says {money(row?.rulePrice ?? null)}
          {row?.rrp != null ? ` · their RRP ${money(row.rrp)}` : ''}
          {variant.priceSource === 'founder' ? ' · this is a price you set' : ''}
        </p>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}>
          <Input
            label="“Was” price on the card (£)"
            inputMode="decimal"
            value={draft.compareAtPrice}
            onChange={(e) => set('compareAtPrice', e.target.value)}
            hint="Struck through beside our price. Blank shows none — a “was” price is a claim."
          />
          <Input label="What PowerBody charge us (£)" inputMode="decimal" value={draft.cost} onChange={(e) => set('cost', e.target.value)} hint="Margins read this. A pull keeps it current." />
          <Input
            label="PowerBody product id"
            inputMode="numeric"
            value={draft.supplierProductId}
            onChange={(e) => set('supplierProductId', e.target.value)}
            hint="Lets stock checks and pulls skip searching."
          />
        </div>
      </div>

      <ImageField
        id={`variant:${(variant.sku ?? variant.id).toLowerCase().replace(/[^a-z0-9._-]/g, '-')}`}
        label="This SKU’s picture"
        hint="Blank shows the product’s picture."
        value={draft.imageUrl}
        onChange={(url) => set('imageUrl', url)}
      />

      <div className="flex items-center flex-wrap gap-2">
        <Button variant="primary" size="sm" loading={busy === 'save'} disabled={changed.length === 0 || busy !== null} onClick={save}>
          {changed.length === 0 ? 'Saved' : `Save ${changed.length} change${changed.length === 1 ? '' : 's'}`}
        </Button>
        {changed.length > 0 && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Undo changes
          </Button>
        )}
        {!isMaster && (
          <Button
            size="sm"
            variant="ghost"
            loading={busy === 'master'}
            onClick={() => void send('/api/portal/products', { id: product.id, master: variant.id }, 'master', 'This is now the master: the product shows its price, picture and servings.')}
          >
            Make this the master
          </Button>
        )}
        {swap && (
          <Button
            size="sm"
            variant="ghost"
            loading={busy === 'swap'}
            onClick={() =>
              void send(
                '/api/portal/products',
                { id: product.id, set: { title: swap.title }, variants: [{ id: variant.id, title: swap.label }] },
                'swap',
                `The product is now “${swap.title}” and this flavour is “${swap.label}”.`,
              )
            }
          >
            This row is the product name
          </Button>
        )}
      </div>
      <Outcome done={done} error={error} />
    </div>
  )
}

// ── Servings, per size ───────────────────────────────────────────────────────

/**
 * One serving count per size, set for every SKU of that size at once — and
 * saying whose numbers it replaces, because PowerBody's own per-SKU counts are
 * usually right and a blanket number is usually a guess.
 */
function ServingsBySize({ product, busy, send }: { product: CatalogueProduct; busy: string | null; send: Send }) {
  const groups = skuGroups(product)
  const [values, setValues] = useState<Record<string, string>>({})
  if (product.variants.length < 2) return null
  return (
    <Card elevation={1} className="space-y-2">
      <p style={EYEBROW}>Servings by size</p>
      {groups.map((g) => {
        const own = g.variants.filter((v) => v.servings != null)
        const counts = [...new Set(own.map((v) => v.servings))]
        const key = g.key || 'none'
        const value = values[key] ?? ''
        return (
          <div key={key} className="flex items-end flex-wrap gap-2">
            <div className="min-w-0" style={{ flex: '1 1 14rem' }}>
              <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
                {g.label} — {g.variants.length} SKU{g.variants.length === 1 ? '' : 's'}
              </p>
              <p style={META}>
                {own.length === 0
                  ? 'None knows its own count; the shop scales one from the master.'
                  : `${own.length} know their own count (${counts.join(', ')})${own.length < g.variants.length ? `, ${g.variants.length - own.length} scaled` : ''}.`}
              </p>
            </div>
            <Input
              label={`Servings for every ${g.label} SKU`}
              compact
              align="right"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValues((all) => ({ ...all, [key]: e.target.value }))}
            />
            <Button
              size="sm"
              variant="secondary"
              loading={busy === `servings:${key}`}
              disabled={!(Number(value) > 0) || busy !== null}
              onClick={() =>
                void send(
                  '/api/portal/products',
                  { id: product.id, variants: g.variants.map((v) => ({ id: v.id, servings: Number(value) })) },
                  `servings:${key}`,
                  `${value} servings set on all ${g.variants.length} ${g.label} SKU${g.variants.length === 1 ? '' : 's'}${own.length ? `, replacing ${own.length} count${own.length === 1 ? '' : 's'} PowerBody gave` : ''}.`,
                )
              }
            >
              Set for all {g.variants.length}
            </Button>
          </div>
        )
      })}
    </Card>
  )
}

// ── Adding a flavour ─────────────────────────────────────────────────────────

interface Found {
  productId: string
  name: string
  sku: string
  stock: number
  wholesalePrice: number
  sellPrice: number
}

/**
 * Add a flavour or size PowerBody sell as their own product: find it by SKU or
 * id (the same lookup as Add products, so the same next step when it cannot be
 * found), see what it is, then add it. It joins this product at once — it is a
 * flavour of something already checked — with its own price, picture and id.
 */
function AddFlavour({ product, onPayload }: { product: CatalogueProduct; onPayload: (p: Payload) => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [steps, setSteps] = useState<string[]>([])
  const [found, setFound] = useState<Found | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [stored, setStored] = useState<{ id: string; title: string } | null>(null)

  async function lookUp() {
    const asked = code.trim()
    if (!asked) return
    setBusy('look')
    setFound(null)
    setStored(null)
    setMessage(null)
    setSteps([])
    try {
      const quick = await fetch('/api/portal/supplier/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: [asked] }),
      }).then((r) => r.json())
      let result = quick.results?.[0]
      if (quick.refusal) {
        setMessage(quick.refusal.message)
        return
      }
      if (result?.status === 'unresolved') {
        const res = await fetch('/api/portal/supplier/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: asked, stream: true }),
        })
        result = await readStream(res, (line) => {
          if (typeof line.message === 'string') setSteps((s) => [...s.slice(-4), line.message as string])
        })
        if (!result) {
          setMessage('Our request ran out of time before PowerBody answered. Look it up again — it carries on from what it found.')
          return
        }
      }
      if (result?.stored) setStored({ id: result.stored.id, title: result.stored.title })
      if (result?.status === 'found' && result.card) {
        setFound({
          productId: String(result.card.productId ?? result.productId),
          name: result.card.name,
          sku: result.card.sku,
          stock: result.card.stock,
          wholesalePrice: result.card.wholesalePrice,
          sellPrice: result.card.sellPrice,
        })
      } else {
        setMessage(result?.message ?? 'Not found.')
      }
    } catch {
      setMessage('Could not reach the server.')
    } finally {
      setBusy(null)
    }
  }

  async function add() {
    if (!found) return
    setBusy('add')
    setMessage(null)
    try {
      const res = await fetch('/api/portal/supplier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [found.productId], into: product.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(data.error ?? `Could not add it (HTTP ${res.status}).`)
        return
      }
      const fresh = await fetch(`/api/portal/products?id=${encodeURIComponent(product.id)}`).then((r) => r.json())
      if (fresh?.product) onPayload(fresh)
      setMessage(`Added ${found.name}. Open it in the list above to check its name and price.`)
      setFound(null)
      setCode('')
    } catch {
      setMessage('Could not reach the server.')
    } finally {
      setBusy(null)
    }
  }

  const master = masterVariant(product)
  const sizeHere = normaliseSize(master?.size ?? sizeFromName(product.title))
  const sizeThere = found ? normaliseSize(sizeFromName(found.name)) : ''
  const otherSize = found && sizeHere && sizeThere && sizeHere !== sizeThere

  return (
    <Card elevation={1} className="space-y-2">
      <p style={EYEBROW}>Add a flavour or size</p>
      <div className="flex items-end flex-wrap gap-2">
        <Input label="PowerBody SKU or product id" compact value={code} onChange={(e) => setCode(e.target.value)} />
        <Button size="sm" variant="secondary" loading={busy === 'look'} disabled={!code.trim() || busy !== null} onClick={() => void lookUp()}>
          Look it up
        </Button>
      </div>
      {busy === 'look' && steps.length > 0 && (
        <ul aria-live="polite" style={{ ...META, listStyle: 'none', margin: 0, padding: 0 }}>
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
      {stored && (
        <p style={META}>
          That SKU is already on{' '}
          <a href={productHref(stored.id)} style={{ textDecoration: 'underline' }}>
            {stored.title}
          </a>
          .
        </p>
      )}
      {found && !stored && (
        <div className="space-y-2">
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
            {found.name} · {found.sku} · {found.stock > 0 ? `${found.stock} in stock` : 'out of stock'} · PowerBody charge us {money(found.wholesalePrice)} → we
            would sell at {money(found.sellPrice)}
          </p>
          {otherSize && (
            <Note tone="attention">
              This is a different size from this product’s ({sizeThere} vs {sizeHere}). Sizes are kept as separate products, so it will be
              refused — add it as its own product from Add products instead.
            </Note>
          )}
          <Button size="sm" variant="primary" loading={busy === 'add'} disabled={busy !== null} onClick={() => void add()}>
            Add it to this product
          </Button>
        </div>
      )}
      {message && <p style={META}>{message}</p>}
    </Card>
  )
}

// ── Merging another product in ───────────────────────────────────────────────

/**
 * Bring another product's SKUs here as more flavours — the fix for a flavour
 * that was imported as a product of its own. The other product is removed (or,
 * if it never went on sale, discarded), and its place on the Top 25 moves here.
 *
 * ── The other way round ─────────────────────────────────────────────────────
 * The usual way in is a new flavour opened from Review: it is waiting for
 * review, and the product to combine it with is the one already on sale. Merged
 * in HERE, that product would leave the shop — and every member's renewals —
 * until this one was approved, so the server refuses it. The card offers what
 * the founder meant instead: this product's flavours go to the one on sale, this
 * one (never on sale) is discarded, and the page moves to the product that now
 * holds them, since this one no longer exists.
 */
function MergeIn({ payload, busy, send }: { payload: Payload; busy: string | null; send: Send }) {
  const router = useRouter()
  const { product } = payload
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [all, setAll] = useState<Array<{ id: string; title: string; state: string; skus: number }> | null>(null)
  const [picked, setPicked] = useState<{ id: string; title: string; state: string; warning: string | null } | null>(null)
  // The last product merged in from here, while Undo can still bring it back.
  const [merged, setMerged] = useState<{ id: string; title: string } | null>(null)
  const [handing, setHanding] = useState(false)
  const [handError, setHandError] = useState<{ text: string; link: RefusalLink | null } | null>(null)
  // This product waits for review and the one picked is on sale: offer the reverse.
  const reverse = picked !== null && payload.state === 'pending' && picked.state === 'live'

  /** Merge THIS product into `into`, then go there — this one is discarded by it. */
  async function handOver(into: { id: string; title: string }) {
    setHanding(true)
    setHandError(null)
    // Not `send`: its answer is the OTHER product, which must not replace this page's copy.
    const result = await postProduct('/api/portal/products', { id: into.id, action: 'merge', from: [product.id] })
    if (!result.ok) {
      setHanding(false)
      setHandError({ text: errorText(result), link: result.link ?? null })
      return
    }
    router.push(productHref(into.id, 'variants'))
  }

  useEffect(() => {
    if (!open || all) return
    fetch('/api/portal/products?all=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setAll(
          (d?.products ?? [])
            .filter((e: { state: string; product: CatalogueProduct }) => e.state !== 'removed' && e.product.id !== product.id)
            .map((e: { state: string; product: CatalogueProduct }) => ({
              id: e.product.id,
              title: e.product.title,
              state: e.state,
              skus: e.product.variants.length,
            })),
        ),
      )
      .catch(() => setAll([]))
  }, [open, all, product.id])

  const matches = (all ?? []).filter((p) => {
    const q = query.trim().toLowerCase()
    return q.length >= 2 && (p.title.toLowerCase().includes(q) || p.id.includes(q))
  })

  async function pick(p: { id: string; title: string; state: string }) {
    const d = await fetch(`/api/portal/products?id=${encodeURIComponent(p.id)}`).then((r) => r.json()).catch(() => null)
    setMerged(null)
    setHandError(null)
    setPicked({ id: p.id, title: p.title, state: p.state, warning: d?.usageWarning ?? null })
  }

  return (
    <Card elevation={1} className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p style={EYEBROW}>Merge another product into this one</p>
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Open'}
        </Button>
      </div>
      {open && (
        <div className="space-y-2">
          <p style={META}>For a flavour that came in as a product of its own. Its SKUs come here, and it is taken off sale — Undo brings it back — or discarded if it never went on sale.</p>
          <Input label="Find the product to bring in" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          {matches.slice(0, 8).map((p) => (
            <div key={p.id} className="flex items-center justify-between flex-wrap gap-2">
              <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }}>
                {p.title} <span style={META}>· {p.skus} SKU{p.skus === 1 ? '' : 's'} · {p.state === 'pending' ? 'waiting for review' : 'on sale'}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => void pick(p)}>
                Choose
              </Button>
            </div>
          ))}
          {picked && reverse && (
            <Card elevation={2} tone="attention" className="space-y-2">
              <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
                “{picked.title}” is on sale, and this product is still waiting for review.
              </p>
              <p style={META_ON_TINT}>
                Merged in here, “{picked.title}” would come off the shop — and its subscribers’ renewals would be held — until this one is
                approved. Add this one’s flavours to “{picked.title}” instead: they go on sale there straight away, this product is discarded
                (it never went on sale), and you land on “{picked.title}” to check their names and prices.
                {payload.usageWarning ? ` ${payload.usageWarning} Those keep pointing at “${product.title}” — update them after.` : ''}
              </p>
              <div className="flex items-center flex-wrap gap-2">
                <Button size="sm" variant="primary" loading={handing} disabled={busy !== null || handing} onClick={() => void handOver(picked)}>
                  Add this one’s flavours to “{picked.title}”
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPicked(null)
                    setHandError(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </Card>
          )}
          {handError && (
            <p role="alert" style={{ ...META, color: 'var(--tone-critical)' }}>
              {handError.text}{' '}
              {handError.link && (
                <Link href={handError.link.href} style={{ textDecoration: 'underline' }}>
                  {handError.link.label}
                </Link>
              )}
            </p>
          )}
          {picked && !reverse && (
            <Card elevation={2} tone="attention" className="space-y-2">
              <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
                Bring “{picked.title}” into “{product.title}”?
              </p>
              {picked.warning && <p style={META_ON_TINT}>{picked.warning} Those keep pointing at “{picked.title}” — update them after.</p>}
              <div className="flex items-center flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy === 'merge'}
                  onClick={() =>
                    void send('/api/portal/products', { id: product.id, action: 'merge', from: [picked.id] }, 'merge', `“${picked.title}” is now part of this product.`).then((ok) => {
                      if (ok) {
                        // Only a product that was on sale is kept (removed) and can come back.
                        setMerged(picked.state === 'pending' ? null : { id: picked.id, title: picked.title })
                        setPicked(null)
                        setAll(null)
                        setQuery('')
                      }
                    })
                  }
                >
                  Merge it in
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
                  Cancel
                </Button>
              </div>
            </Card>
          )}
          {merged && (
            <div className="flex items-center flex-wrap gap-2">
              <span style={META}>Merged the wrong one?</span>
              <Button
                size="sm"
                variant="ghost"
                loading={busy === 'undo-merge'}
                onClick={() =>
                  void send(
                    '/api/portal/products',
                    { id: merged.id, action: 'undo-merge', view: product.id },
                    'undo-merge',
                    `“${merged.title}” is back on sale on its own, and its SKUs have left this product.`,
                  ).then((ok) => ok && setMerged(null))
                }
              >
                Undo — put “{merged.title}” back on its own
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
