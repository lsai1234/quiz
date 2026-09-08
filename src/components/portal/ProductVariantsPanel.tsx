'use client'

import { useState } from 'react'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { servingsForVariant } from '@/lib/shop/per-serving'
import { commonProductName } from '@/lib/supplier/variant-labels'
import { Button, Input, Note } from '@/components/system'

interface Props {
  product: CatalogueProduct
  /** Hand back the repaired product so the list around this updates in place. */
  onUpdated?: (product: CatalogueProduct) => void
}

interface RunReport {
  asked: number
  answered: number
  unindexed: string[]
  pricesFound: number
  servingsFound: number
  picturesFound: number
  slow: boolean
  elapsedMs: number
  error: string | null
}

/** What PowerBody knows about one variant, in the three columns that matter. */
function known(product: CatalogueProduct, variant: CatalogueVariant): string {
  const servings = servingsForVariant(product, variant)
  return [
    variant.servings != null ? `${variant.servings} servings` : servings != null ? `${Math.round(servings)} servings*` : 'no servings',
    variant.imageUrl ? 'own picture' : 'product picture',
    variant.cost != null ? `cost £${variant.cost.toFixed(2)}` : 'no cost',
  ].join(' · ')
}

/**
 * One product's variants, and the button that fills them in.
 *
 * ── Why this exists beside the sweep ────────────────────────────────────────
 * The PowerBody screen has a pass that walks the whole catalogue, which is the
 * right tool for "get everything right" and the wrong one for "I am looking at
 * this product and it is missing its pictures". That founder does not want to
 * read a hundred SKUs to fix seven, and a sweep that takes two minutes is not
 * something you run to answer a question about one product.
 *
 * So this is the same work, scoped to what is on screen — and it doubles as the
 * only place the per-variant facts are visible at all. A product page shows a
 * flavour list; this shows what we actually hold for each of them, which is the
 * thing that tells you whether the pull is worth pressing.
 *
 * `*` on a serving count means it was scaled from the size rather than told to
 * us per SKU — see `servingsForVariant`. It is a guess we stand behind, and it
 * is the one the pull replaces with a real number.
 *
 * ── And the names, by hand ──────────────────────────────────────────────────
 * The supplier-driven repair works from what PowerBody call each SKU, which is
 * the right default and is not always enough: their names disagree with each
 * other, a SKU is missing from the feed, the diff produces something nobody
 * would write. So the names are editable here — the product's, and each
 * flavour's — and one press on a row promotes that row's name to the product's,
 * which is the whole "this one is really the product, the rest are flavours"
 * correction in a single gesture.
 *
 * A typed name is a founder decision, so it is stored as an override and no
 * later pull will overwrite it. The HANDLE is never touched: it is the
 * product's URL, and every link anyone has to it.
 */
export function ProductVariantsPanel({ product, onUpdated }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [changed, setChanged] = useState<Record<string, string> | null>(null)

  // The names being edited. Seeded from the product and kept locally until Save
  // — a name is a sentence somebody is part-way through typing, and saving on
  // every keystroke would write a dozen half-names to the shop.
  const [title, setTitle] = useState(product.title)
  const [labels, setLabels] = useState<string[]>(() => product.variants.map((v) => v.title))
  const [saving, setSaving] = useState(false)

  const withSkus = product.variants.filter((v) => v.sku).length
  /*
    What the flavours share — the product's name, if the labels are right.

    Offered rather than applied: it is a suggestion computed from the labels on
    screen, and the founder is the one who knows whether it reads like a product.
  */
  const suggestion = commonProductName(labels)
  const edited = title !== product.title || labels.some((l, i) => l !== product.variants[i].title)

  async function saveNames() {
    setSaving(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch('/api/portal/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: product.id,
          patch: {
            title: title.trim() || product.title,
            // The label and the flavour move together: the shop's picker reads
            // `flavour` and falls back to `title`, so setting one and not the
            // other is how a product ends up named two different things.
            variants: product.variants.map((v, i) => {
              const label = (labels[i] ?? '').trim() || v.title
              return { ...v, title: label, flavour: label }
            }),
          },
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? `Could not save those names (HTTP ${res.status}).`)
        return
      }
      setDone('Names saved. A pull from PowerBody will not overwrite them.')
      invalidateCatalogue()
      onUpdated?.(product)
    } catch {
      setError('Unable to reach the server.')
    } finally {
      setSaving(false)
    }
  }

  async function pull() {
    setBusy(true)
    setError(null)
    setDone(null)
    setChanged(null)
    try {
      const res = await fetch('/api/portal/products/repair-variant-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      })
      const body = await res.json().catch(() => null)
      // A reply that is not JSON is our own timeout, not the supplier's
      // silence — saying "PowerBody could not be reached" about it would send
      // somebody to check the wrong thing.
      if (!body) {
        setError(`The pull ran out of time (HTTP ${res.status}). Press it again — it saves what it reads.`)
        return
      }
      if (!res.ok || body.ok === false) {
        setError(body.error ?? `The pull failed (HTTP ${res.status}).`)
        return
      }

      const report = body.report as RunReport | undefined
      const repair = (body.repaired ?? [])[0] as { changed: Record<string, string> } | undefined
      setChanged(repair?.changed ?? {})
      setDone(
        repair && Object.keys(repair.changed).length > 0
          ? `${Object.keys(repair.changed).length} variant${Object.keys(repair.changed).length === 1 ? '' : 's'} updated.`
          : 'Nothing changed — PowerBody agree with what we already hold.',
      )
      if (report?.error) setError(`PowerBody said: ${report.error}`)
      else if (report && report.answered < report.asked) {
        setError(
          `PowerBody answered for ${report.answered} of ${report.asked} SKUs.` +
            (report.unindexed.length > 0
              ? ` ${report.unindexed.join(', ')} ${report.unindexed.length === 1 ? 'is' : 'are'} not in the crawled product list — run the feed index on the PowerBody screen first.`
              : ''),
        )
      }
      invalidateCatalogue()
      onUpdated?.(product)
    } catch {
      setError('Unable to reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    /*
      `minmax(0, 1fr)`, not `1fr`, and it is the whole fix.

      A grid track's default minimum is `auto` — the item's max-content width —
      so a row holding a sixty-character supplier name refuses to shrink and
      pushes itself out through the side of the product card. On a phone that is
      a variant list overhanging the card it belongs to. The same clamp the shop
      shelves use, for the same reason.
    */
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--space-1)' }}>
        {product.variants.map((v, i) => (
          <div
            key={v.id}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--edge)',
              borderRadius: 'var(--radius-row)',
              padding: 'var(--space-2) var(--space-3)',
              minWidth: 0,
            }}
          >
            {/* `min-w-0` on the shrinking cell for the same reason as the
                grid track: a flex child's minimum width is its content. */}
            <div className="flex items-baseline gap-2">
              <Input
                label={`Name for ${v.sku ?? v.title}`}
                hideLabel
                compact
                className="flex-1 min-w-0"
                value={labels[i] ?? ''}
                onChange={(e) => setLabels((all) => all.map((l, j) => (j === i ? e.target.value : l)))}
              />
              <span className="flex-shrink-0" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
                £{v.price.toFixed(2)}
              </span>
            </div>
            {/*
              "This row is really the product." One press for the correction
              that used to need the supplier to agree with us.

              Hidden rather than disabled when it would do nothing: eight rows
              each carrying a dead button is most of a phone screen spent on an
              action that is not available.
            */}
            {(labels[i] ?? '').trim() && (labels[i] ?? '').trim() !== title.trim() && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Use “${labels[i]}” as the product name`}
                onClick={() => setTitle(labels[i])}
              >
                Use as the product name
              </Button>
            )}
            {/* Wraps rather than truncates: this line is four short facts, and
                losing the last one to an ellipsis loses the one that says
                whether the picture is the flavour's own. */}
            <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', overflowWrap: 'anywhere' }}>
              {v.sku ?? 'no SKU'} · {known(product, v)}
              {changed?.[v.sku ?? ''] ? ` · just now: ${changed[v.sku ?? '']}` : ''}
            </p>
          </div>
        ))}
      </div>

      {/*
        The product's own name, editable.

        First, because it is the thing the shelf shows and the thing that was
        wrong: a product wearing one of its flavours' names. Everything under it
        is a flavour of this.
      */}
      <div className="flex items-end gap-2 flex-wrap">
        <Input
          label="Product name"
          compact
          className="flex-1 min-w-0"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {suggestion && suggestion !== title.trim() && (
          <Button variant="ghost" size="sm" onClick={() => setTitle(suggestion)}>
            Use “{suggestion}”
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="primary" loading={saving} disabled={saving || !edited} onClick={() => void saveNames()}>
          Save names
        </Button>
        <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
          {edited
            ? 'Saved as your own wording — no pull from PowerBody will overwrite it. The web address does not change.'
            : 'Edit the product name or any flavour above, or promote a flavour to the product name.'}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="secondary" loading={busy} disabled={busy || withSkus === 0} onClick={() => void pull()}>
          Pull {withSkus} SKU{withSkus === 1 ? '' : 's'} from PowerBody
        </Button>
        <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
          {withSkus === 0
            ? 'No supplier codes on this product, so there is nothing to ask about.'
            : 'Reads each SKU’s own price, serving count and picture. A price you set by hand is left alone.'}
        </span>
      </div>

      {done && <Note tone="positive" live="polite">{done}</Note>}
      {error && <Note tone="attention" live="polite">{error}</Note>}
    </div>
  )
}
