'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { buildDuel, type DuelRow } from '@/lib/shop/duel'
import { defaultVariant } from '@/lib/shop/merchandising'
import { useBasket } from '@/lib/basket/store'
import { track } from '@/lib/analytics/events'
import { ProductTile } from '@/components/stack-review/ProductTile'

interface Props {
  products: [CatalogueProduct, CatalogueProduct]
  onClose: () => void
}

/**
 * The Shelf Duel — two products, head to head.
 *
 * A table, not a pair of cards side by side: the whole value is reading ACROSS a
 * row, and two cards make you read down twice and hold the numbers in your head.
 *
 * What is and is not lit up is the substance of this component — see
 * `lib/shop/duel.ts`. A row is only scored where "better" is a fact; format and
 * dietary carry both values and no crown, because crowning a preference invents
 * a verdict. And a scored row names what the other one is better for, so the
 * losing column is never simply wrong — the note sits under the LOSER, naming
 * what it is still better for.
 */
export function ShopDuelSheet({ products, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const add = useBasket((s) => s.add)
  const [added, setAdded] = useState<string | null>(null)

  const duel = useMemo(() => buildDuel(products[0], products[1]), [products])

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const addProduct = (product: CatalogueProduct) => {
    const variant = defaultVariant(product)
    if (!variant?.available) return
    add(product.id, variant.id, 1)
    track('add_to_basket', { id: product.id, source: 'duel', price: variant.price })
    setAdded(product.id)
  }

  const sheet = (
    /*
      `storefront` on the portal root, not just on the shell.

      The token layer's global transition, its focus ring and its type roles are
      all scoped to `.storefront` so they cannot reach the quiz or the hubs. A
      sheet renders through `createPortal` into `document.body`, which is
      OUTSIDE that scope — so without this class every control in every sheet
      lost its focus ring and its 150ms transition, silently, while looking
      almost right.
    */
    <div className="storefront fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Compare products">
      {/*
        The scrim. A plain div rather than a labelled button: the header button
        and Escape are the real ways out, and a second control with the SAME
        accessible name is an ambiguity for anyone navigating by name — it also
        sits under the panel, so "click the first Close" lands on something that
        cannot receive the click.
      */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 w-full h-full"
        style={{ background: 'color-mix(in srgb, var(--bg) 72%, transparent)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      />

      <div
        className="relative w-full max-w-lg mx-auto rounded-t-3xl flex flex-col max-h-[92dvh]"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--line)' }}
      >
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 className="text-base font-medium" style={{ color: 'var(--text)' }}>
            Head to head
          </h2>
          <button
            onClick={onClose}
            aria-label="Close comparison"
            className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-transform"
            style={{ color: 'var(--text-dim)', background: 'var(--surface-hi)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Column headers, sticky so a long table never loses which is which. */}
          <div
            className="grid sticky top-0 z-10 px-5 py-3"
            style={{ gridTemplateColumns: '5.5rem 1fr 1fr', gap: '0.5rem', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}
          >
            <span />
            {duel.products.map((product, i) => (
              <div key={product.id} className="min-w-0 text-center">
                <div className="flex justify-center mb-1.5">
                  <ProductTile imageUrl={product.imageUrl} slot={product.stackSlots[0]} title={product.title} size={40} />
                </div>
                <p className="text-[11px] font-medium leading-tight" style={{ color: 'var(--text)' }}>
                  {product.title}
                </p>
                {duel.variantLabels[i] && (
                  <p className="text-[9px] mt-0.5 leading-tight" style={{ color: 'var(--text-dim)' }}>
                    {duel.variantLabels[i]}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="px-5">
          <table className="w-full">
            <caption className="sr-only">
              {duel.products[0].title} compared with {duel.products[1].title}
            </caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Attribute</th>
                {duel.products.map((p) => <th key={p.id} scope="col">{p.title}</th>)}
              </tr>
            </thead>
            <tbody>
              {duel.rows.map((row) => <Row key={row.key} row={row} />)}
            </tbody>
          </table>
          </div>
        </div>

        <footer
          className="grid px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex-shrink-0"
          style={{ gridTemplateColumns: '5.5rem 1fr 1fr', gap: '0.5rem', borderTop: '1px solid var(--line)', background: 'var(--surface)' }}
        >
          <span />
          {duel.products.map((product) => {
            const variant = defaultVariant(product)
            const soldOut = !variant?.available
            return (
              <button
                key={product.id}
                onClick={() => addProduct(product)}
                disabled={soldOut}
                /* Named per product: two buttons both called "Add" is the same
                   ambiguity the scrim had, one row lower. */
                aria-label={soldOut ? `${product.title} is sold out` : `Add ${product.title}`}
                className="py-2.5 rounded-xl text-xs font-medium active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: added === product.id ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--accent)',
                  color: added === product.id ? 'var(--accent)' : 'var(--bg)',
                  border: added === product.id ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' : '1px solid transparent' }}
              >
                {soldOut ? 'Sold out' : added === product.id ? 'Added' : 'Add'}
              </button>
            )
          })}
        </footer>
      </div>
    </div>
  )

  return mounted ? createPortal(sheet, document.body) : null
}

function Row({ row }: { row: DuelRow }) {
  return (
    <tr style={{ borderTop: '1px solid var(--line)' }}>
      <th
        scope="row"
        className="text-left align-top py-2.5 pr-2 label w-[5.5rem]"
        style={{ color: 'var(--text-dim)' }}
      >
        {row.label}
      </th>
      {row.cells.map((cell, i) => {
        const won = row.winner === i
        return (
          <td key={i} className="align-top py-2.5 px-1 text-center">
            <span
              className="inline-block px-2 py-1 rounded-lg text-xs font-medium leading-snug"
              style={{ color: won ? 'var(--accent)' : 'var(--text-dim)',
                background: won ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                border: won ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : '1px solid transparent' }}
            >
              {cell.text ?? '—'}
              {/* Named, not just coloured: a crown that exists only as a colour
                  is invisible to a screen reader and to anyone who cannot
                  separate the accent from the body tone. */}
              {won && <span className="sr-only"> — better on {row.label}</span>}
            </span>
            {/* Under the LOSING column, naming what it is still better for —
                so a duel never reads as one product simply being wrong. */}
            {row.winner !== null && !won && row.note && (
              <span className="block text-[10px] mt-1 leading-snug" style={{ color: 'var(--text-dim)' }}>
                {row.note}
              </span>
            )}
          </td>
        )
      })}
    </tr>
  )
}
