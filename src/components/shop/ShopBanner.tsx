'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { bannerImageSrc, SHOP_SCRIM, type ShopBannerMeta } from '@/lib/shop/banners'
import { track } from '@/lib/analytics/events'
import { ProductTile } from '@/components/stack-review/ProductTile'

interface Props {
  /** For the fallback, which is built from the shop's own photography. */
  products: CatalogueProduct[]
}

/**
 * The top of the shop.
 *
 * ── Uploaded artwork, with a fallback that is never empty ───────────────────
 * Banners come from the Founders Hub. When there are none — a fresh install, a
 * founder who has not got to it, a database that will not answer — this falls
 * back to a built banner made of the shop's own product photography, which is
 * the only imagery the app is guaranteed to have. The shop must never open on a
 * blank rectangle waiting for a founder.
 *
 * ── The copy is text, not pixels ────────────────────────────────────────────
 * The headline and subhead are drawn over the artwork rather than generated
 * into it. That is what lets a founder change an offer without regenerating a
 * picture, keeps the type crisp on a 3x display, and means a screen reader gets
 * words rather than "image".
 *
 * The scrim under the text is not decoration — see `SHOP_SCRIM`.
 */
export function ShopBanner({ products }: Props) {
  const [banners, setBanners] = useState<ShopBannerMeta[] | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/shop/banners')
      .then((r) => (r.ok ? r.json() : { banners: [] }))
      .then((d) => { if (live) setBanners(Array.isArray(d.banners) ? d.banners : []) })
      /* A banner is decoration on a page that works without it. */
      .catch(() => { if (live) setBanners([]) })
    return () => { live = false }
  }, [])

  // Still asking: render the fallback rather than a hole. It is the same height,
  // so nothing moves when the answer arrives.
  const banner = banners?.[0]

  if (!banner) return <FallbackBanner products={products} />

  return (
    <Link
      href={banner.href}
      data-interactive
      onClick={() => track('shop_banner_click', { id: banner.id })}
      className="relative block overflow-hidden"
      style={{ borderRadius: 'var(--r-card)', background: 'var(--surface)', aspectRatio: '16 / 9' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bannerImageSrc(banner.id, banner.version)}
        alt={banner.alt}
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
        decoding="async"
      />

      <span
        aria-hidden
        className="absolute inset-0"
        style={{ background: SHOP_SCRIM }}
      />

      <span className="absolute inset-y-0 left-0 flex flex-col justify-center" style={{ padding: 'var(--space-5)', maxWidth: '68%' }}>
        <span className="sf-title block" style={{ color: 'var(--text)' }}>{banner.headline}</span>
        {banner.subhead && (
          <span className="sf-meta block" style={{ marginTop: 'var(--space-1)' }}>{banner.subhead}</span>
        )}
      </span>
    </Link>
  )
}

/**
 * What the shop opens on before anybody has uploaded anything.
 *
 * Made of three product photographs, because cut-out product imagery is the one
 * kind this app always has. It is deliberately the same shape and height as a
 * real banner so the swap, when it happens, moves nothing.
 */
function FallbackBanner({ products }: { products: CatalogueProduct[] }) {
  const shots = products.filter((p) => p.imageUrl).slice(0, 3)

  return (
    <Link
      href="/"
      data-interactive
      className="relative flex flex-col justify-end overflow-hidden"
      style={{ borderRadius: 'var(--r-card)', background: 'var(--surface)', minHeight: 132, padding: 'var(--space-5)' }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 right-0 flex items-center justify-end pointer-events-none"
        style={{
          width: '42%',
          gap: 'var(--space-1)',
          paddingRight: 'var(--space-3)',
          maskImage: 'linear-gradient(to right, transparent, #000 34%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, #000 34%)',
        }}
      >
        {shots.map((p, i) => (
          <ProductTile
            key={p.id}
            imageUrl={p.imageUrl}
            slot={p.stackSlots[0]}
            title=""
            size={96}
            style={{ width: 56, height: 92 - i * 10, opacity: 0.95 }}
          />
        ))}
      </span>

      <span className="relative" style={{ maxWidth: '56%' }}>
        <span className="sf-title block" style={{ color: 'var(--text)' }}>Not sure where to start?</span>
        <span className="sf-meta block" style={{ marginTop: 'var(--space-1)' }}>
          A 2-minute quiz builds a stack around your goals
        </span>
      </span>
    </Link>
  )
}
