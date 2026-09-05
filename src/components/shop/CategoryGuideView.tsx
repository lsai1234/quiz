'use client'

import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { CategoryGuide } from '@/lib/shop/guides'
import { ShopProductCard } from './ShopProductCard'
import { ShopPageHeader } from './ShopPageHeader'

interface Props {
  guide: CategoryGuide
  /** The shelf this guide is about, if the catalogue currently has one. */
  products: CatalogueProduct[]
  /** The anchor back to the shelf, when it exists. */
  shelfHref: string | null
}

/**
 * A category, explained.
 *
 * ── Why this is a page and not a sheet ──────────────────────────────────────
 * It is the thing somebody sends to a friend who asked what creatine is. A
 * sheet cannot be linked to, shared, bookmarked, indexed or opened in a tab,
 * and this is the one part of the shop with a reason to be found by somebody
 * who has never heard of us. Same argument as `/product/[handle]`.
 *
 * ── Why the products are at the bottom and not the top ──────────────────────
 * Somebody who arrives here has already declined to just browse the shelf.
 * Leading with a grid would be answering a question they did not ask. The
 * reading comes first and the products sit underneath it, where they read as
 * "here is what that looks like" rather than as an advert wearing an article.
 */
export function CategoryGuideView({ guide, products, shelfHref }: Props) {
  return (
    <div
      className="storefront min-h-[100dvh]"
      style={{ background: 'var(--bg)', color: 'var(--text)', paddingBottom: 'var(--space-12)' }}
    >
      <ShopPageHeader />

      <main>
        <div style={{ padding: 'var(--space-2) var(--space-4) var(--space-4)', maxWidth: 720, margin: '0 auto' }}>
          <Link href="/shop" data-interactive className="sf-guide-link inline-flex items-center" style={{ gap: 'var(--space-1)' }}>
            <span aria-hidden>&#8249;</span> The shop
          </Link>

          <p className="sf-label" style={{ marginTop: 'var(--space-5)' }}>The guide</p>
          <h1 className="sf-display" style={{ color: 'var(--text)', marginTop: 'var(--space-2)' }}>
            {guide.title}
          </h1>

          {/*
            The intro is body size, not meta. It is the paragraph that decides
            whether somebody reads the rest, and setting it in the same dim
            grey as a product's serving count tells them it is furniture.
          */}
          <p className="sf-body" style={{ marginTop: 'var(--space-4)', color: 'var(--text)' }}>
            {guide.intro}
          </p>

          {guide.sections.map((s) => (
            <section key={s.heading} style={{ marginTop: 'var(--space-8)' }}>
              <h2 className="sf-title" style={{ color: 'var(--text)' }}>{s.heading}</h2>
              {s.body.map((para, i) => (
                <p key={i} className="sf-body" style={{ marginTop: 'var(--space-3)' }}>{para}</p>
              ))}
            </section>
          ))}

          {/*
            Not boilerplate, and not at the bottom of a footer where nobody
            reads it. A page that tells somebody what a supplement is for owes
            them the sentence that says it is general information — placed
            where they are still reading.
          */}
          <p
            className="sf-meta"
            style={{
              marginTop: 'var(--space-8)',
              padding: 'var(--space-4)',
              borderRadius: 'var(--r-card)',
              background: 'var(--surface)',
            }}
          >
            This is general information, not medical or dietary advice. If you are pregnant,
            breastfeeding, taking prescribed medication or managing a health condition, speak to a
            doctor or pharmacist before starting a supplement.{' '}
            <Link href="/legal/disclaimer" data-interactive className="sf-guide-link">
              Read the full disclaimer
            </Link>
          </p>
        </div>

        {products.length > 0 && (
          <section style={{ marginTop: 'var(--space-10)' }}>
            <div style={{ padding: '0 var(--space-4)', marginBottom: 'var(--space-4)', maxWidth: 720, margin: '0 auto' }}>
              <h2 className="sf-title" style={{ color: 'var(--text)' }}>What we stock</h2>
              {shelfHref && (
                <Link href={shelfHref} data-interactive className="sf-guide-link inline-block" style={{ marginTop: 'var(--space-1)' }}>
                  See the whole shelf &#8250;
                </Link>
              )}
            </div>

            <div
              className="grid"
              style={{
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 'var(--space-3)',
                padding: '0 var(--space-4)',
                maxWidth: 720,
                margin: '0 auto',
              }}
            >
              {products.slice(0, 6).map((product) => (
                <div key={product.id} data-card>
                  <ShopProductCard product={product} />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
