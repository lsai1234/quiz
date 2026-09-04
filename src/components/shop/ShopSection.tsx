'use client'

import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ShopCategory } from '@/lib/shop/categories'
import { ShopProductCard } from './ShopProductCard'
import { slotVisual } from '@/lib/catalogue/slot-visuals'
import { QuizIcon } from '@/components/quiz/QuizIcon'

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
export function ShopSection({ section, onOpen, perServing, selectable, selectedIds, onToggleSelect }: Props) {
  return (
    /*
      `scroll-margin-top` is 88px, not the old 96px guess: the sticky bar is now
      only the category chip row (36px chips + 12px padding top and bottom + a
      1px hairline = 61px), plus a 27px gap so a heading lands clear of it
      rather than tucked under its edge. Search and filters scroll away, so they
      no longer count towards this — which is why the old value clipped.
    */
    <section className="sf-shelf" id={`shop-cat-${section.slug}`} style={{ scrollMarginTop: 88, paddingTop: 'var(--space-8)' }}>
      {/*
        The heading does some work now. It was a name and a count in grey; it is
        the only thing separating twenty shelves from each other, so it carries
        the category's own glyph — the same one the fallback product tile and
        the stack use — and a way to see the whole category rather than the
        first six of it.
      */}
      <div className="flex items-center justify-between" style={{ padding: '0 var(--space-4)', marginBottom: 'var(--space-4)', gap: 'var(--space-3)' }}>
        <div className="flex items-center min-w-0" style={{ gap: 'var(--space-3)' }}>
          <span
            aria-hidden
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 32, height: 32, borderRadius: 'var(--r-control)', background: 'var(--surface)', color: 'var(--text-dim)' }}
          >
            <QuizIcon name={slotVisual(section.products[0]?.stackSlots[0]).glyph} size={17} />
          </span>
          <h2 className="sf-title min-w-0 truncate" style={{ color: 'var(--text)' }}>{section.category}</h2>
        </div>
        <span className="sf-meta sf-tnum flex-shrink-0">
          {section.products.length} product{section.products.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 'var(--space-3)',
          padding: '0 var(--space-4)' }}
      >
        {section.products.map((product) => (
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
    </section>
  )
}
