'use client'

import { useState } from 'react'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { servingsForVariant } from '@/lib/shop/per-serving'
import { Button, Note } from '@/components/system'

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
 */
export function ProductVariantsPanel({ product, onUpdated }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [changed, setChanged] = useState<Record<string, string> | null>(null)

  const withSkus = product.variants.filter((v) => v.sku).length

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
    <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
      <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
        {product.variants.map((v) => (
          <div
            key={v.id}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--edge)',
              borderRadius: 'var(--radius-row)',
              padding: 'var(--space-2) var(--space-3)',
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="truncate"
                style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}
              >
                {v.title}
              </span>
              <span className="flex-shrink-0" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
                £{v.price.toFixed(2)}
              </span>
            </div>
            <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
              {v.sku ?? 'no SKU'} · {known(product, v)}
              {changed?.[v.sku ?? ''] ? ` · just now: ${changed[v.sku ?? '']}` : ''}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" loading={busy} disabled={busy || withSkus === 0} onClick={() => void pull()}>
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
