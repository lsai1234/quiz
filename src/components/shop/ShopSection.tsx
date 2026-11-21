'use client'

import { useEffect, useState } from 'react'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { SHELF_PREVIEW_COUNT, type ShopCategory } from '@/lib/shop/categories'
import { Button } from '@/components/storefront'
import { ShopProductCard } from './ShopProductCard'
import { Icon } from '@/components/ui/Icon'
import Link from 'next/link'
import { guideFor, guideHref } from '@/lib/shop/guides'

interface Props {
  section: ShopCategory
  onOpen?: (product: CatalogueProduct) => void
  /** Show every price as a price per serving. */
  perServing?: boolean
  /** The shelf is in compare mode — cards select instead of navigating. */
  selectable?: boolean
  selectedIds?: ReadonlySet<string>
  onToggleSelect?: (product: CatalogueProduct) => void
}

/**
 * One shop category as a two-column grid.
 *
 * It was a horizontally scrolling deck: one card and a sliver visible at a
 * time, everything past position three behind a gesture nobody makes, and
 * desktop scroll arrows absolutely positioned over the cards at the viewport
 * edges. Six products now occupy the vertical space that used to show one and
 * a half, and nothing floats on top of anything.
 *
 * `minmax(0, 1fr)` rather than `1fr`: a grid track's default minimum is `auto`,
 * which is the content's intrinsic width, so a long unbroken product title
 * pushes its column wider than half and the two columns stop matching. The
 * `minmax(0, ...)` is what lets the clamp actually clamp.
 *
 * The GSAP deal-in animation went with the deck. It was a transform driven by
 * scroll position, and the storefront's motion is 150ms on interaction only.
 */
/** How many columns the shelf grid is showing, so a preview is whole rows. */
function useShelfColumns(): number {
  const [columns, setColumns] = useState(2)
  useEffect(() => {
    const queries = [
      [window.matchMedia('(min-width: 1240px)'), 5],
      [window.matchMedia('(min-width: 1040px)'), 4],
      [window.matchMedia('(min-width: 700px)'), 3],
    ] as const
    const read = () => setColumns(queries.find(([q]) => q.matches)?.[1] ?? 2)
    read()
    queries.forEach(([q]) => q.addEventListener('change', read))
    return () => queries.forEach(([q]) => q.removeEventListener('change', read))
  }, [])
  return columns
}

export function ShopSection({ section, onOpen, perServing, selectable, selectedIds, onToggleSelect }: Props) {
  const guide = guideFor(section.slug)
  /*
    Two rows, then a press.

    A shelf used to run its full length, so a category with fourteen products
    was seven rows of scrolling before the next heading. Two rows is enough to
    see what a category IS; the rest is one tap away. Whole rows at every
    width: two columns on a phone, up to five on a wide screen.
  */
  const columns = useShelfColumns()
  const preview = Math.max(SHELF_PREVIEW_COUNT, columns * 2)
  const [expanded, setExpanded] = useState(false)
  const hidden = section.products.length - preview
  const shown = expanded ? section.products : section.products.slice(0, preview)

  return (
    <section className="sf-shelf" id={`shop-cat-${section.slug}`} style={{ scrollMarginTop: 'calc(var(--sf-hdr) + 64px)', paddingTop: 'var(--section)' }}>
      {/*
        The shelf's name, large, with its count beside it and — where the shop
        has one — the way through to its guide on the right. The guide's
        summary used to sit under the name; the shelf reads cleaner as a
        heading and its products, and the guide is one tap away.
      */}
      <div className="sf-shelf-head" style={{ padding: '0 var(--space-4)' }}>
        <h2 className="sf-title" style={{ color: 'var(--text)' }}>{section.category}</h2>
        <span className="sf-shelf-count sf-tnum">
          {section.products.length} product{section.products.length !== 1 ? 's' : ''}
        </span>
        {guide && (
          <Link href={guideHref(guide)} data-interactive className="sf-guide-link inline-flex items-center" style={{ gap: 2 }}>
            How {guide.title.toLowerCase()} fits
            <Icon name="chevron-right" size={14} />
          </Link>
        )}
      </div>

      <div className="sf-grid" style={{ padding: '0 var(--space-4)' }}>
        {shown.map((product) => (
          <div key={product.id} data-card>
            <ShopProductCard
              product={product}
              onOpen={onOpen}
              perServing={perServing}
              selectable={selectable}
              selected={selectedIds?.has(product.id)}
              onToggleSelect={onToggleSelect}
            />
          </div>
        ))}
      </div>

      {/*
        Secondary, not primary: opening a shelf is a browsing move. It names what
        it will show rather than saying "More", because "9 more" is the
        information.
      */}
      {hidden > 0 && (
        <div style={{ padding: 'var(--space-6) var(--space-4) 0' }}>
          <Button
            variant="secondary"
            size="md"
            aria-expanded={expanded}
            aria-controls={`shop-cat-${section.slug}`}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? `Show less ${section.category.toLowerCase()}` : `Show all ${section.products.length} ${section.category.toLowerCase()}`}
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={15} />
          </Button>
        </div>
      )}
    </section>
  )
}
