'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { bannerImageSrc, SHOP_SCRIM, TILE_SCRIM, type ShopBannerMeta } from '@/lib/shop/banners'
import { track } from '@/lib/analytics/events'
import { ProductTile } from '@/components/stack-review/ProductTile'

/**
 * The shop's hero artwork, in the places it belongs.
 *
 * ── Why these are three components and not one banner ───────────────────────
 * The first version put every uploaded picture in a stack at the top of the
 * page. That is a carousel: one spot, one shape, and a shop that has an
 * expensive-looking header sitting on top of an undifferentiated list.
 *
 * The references worth copying all do the same thing instead — a masthead that
 * opens the page, a pair of portrait tiles you can walk into, and a wide break
 * that interrupts the shelves halfway down. Three shapes, three jobs, three
 * positions in the scroll. So there are three components here, each reading one
 * named placement from `@/lib/shop/placements`, and the shell puts them where
 * they go.
 *
 * ── Why they are silent when empty ──────────────────────────────────────────
 * Only the masthead has a fallback, because the top of a shop cannot be a hole.
 * Everything else simply does not render until a founder has put a picture in
 * it, and the page closes up. A placeholder saying "your image here" is a
 * message to the founder printed on the customer's screen.
 *
 * ── One fetch, shared ───────────────────────────────────────────────────────
 * Five placements would otherwise be five requests for the same few hundred
 * bytes. The provider fetches once and hands each component its own slot.
 */

/**
 * How wide the words may run on a wide placement.
 *
 * Tied to the scrim, not chosen by eye. `SHOP_SCRIM` is at full strength to
 * 38% and has faded out entirely by 72%, so a line that runs past about 60%
 * ends its last few words on unprotected artwork — which is exactly where a
 * subhead landed on the tubs in the masthead. Stopping at 58% keeps every line
 * inside the part of the frame the wash actually covers.
 *
 * It is a maximum, not a width: a short headline still sits at its natural
 * length.
 */
const TEXT_COLUMN = '58%'

/**
 * Two lines of subhead, always, on a portrait tile.
 *
 * The tiles are bottom-anchored, so a two-line subhead pushes its label up and
 * a one-line subhead does not — and a pair of tiles side by side ends up with
 * its two labels at different heights, which reads as a bug rather than as
 * copy of different lengths. Reserving the taller of the two cases makes both
 * blocks the same height whatever the words are. `sf-meta` is 1.45 line-height,
 * so two lines is 2.9em.
 */
const SUBHEAD_LINES = { minHeight: '2.9em', WebkitLineClamp: 2 } as const

type BannerMap = Record<string, ShopBannerMeta>

const HeroContext = createContext<BannerMap | null>(null)

export function ShopHeroProvider({ children }: { children: ReactNode }) {
  const [banners, setBanners] = useState<BannerMap | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/shop/banners')
      .then((r) => (r.ok ? r.json() : { banners: {} }))
      .then((d) => {
        if (!live) return
        const map = d.banners
        setBanners(map && typeof map === 'object' && !Array.isArray(map) ? map : {})
      })
      /* Artwork is decoration on a page that works without it. */
      .catch(() => { if (live) setBanners({}) })
    return () => { live = false }
  }, [])

  return <HeroContext.Provider value={banners}>{children}</HeroContext.Provider>
}

/**
 * The banner in a placement, or null.
 *
 * Null while the fetch is still out, too — which is what keeps an empty
 * placement from flashing a picture in halfway down a scroll. The masthead is
 * the exception and handles its own loading state, because it is above the fold
 * and has a fallback to hold the space.
 */
function useBanner(slot: string): ShopBannerMeta | null {
  return useContext(HeroContext)?.[slot] ?? null
}

function useLoaded(): boolean {
  return useContext(HeroContext) !== null
}

/** Analytics + the link, shared by all three shapes. */
function HeroLink({
  banner, slot, className, style, children,
}: {
  banner: ShopBannerMeta
  slot: string
  className?: string
  style?: React.CSSProperties
  children: ReactNode
}) {
  return (
    <Link
      href={banner.href}
      data-interactive
      onClick={() => track('shop_banner_click', { id: banner.id, slot })}
      className={className}
      style={style}
    >
      {children}
    </Link>
  )
}

/* ── The masthead ─────────────────────────────────────────────────────────── */

/**
 * The top of the shop. 16:9, headline and subhead over the art.
 *
 * Falls back to a built banner made of the shop's own product photography when
 * nothing is uploaded — the only imagery the app is guaranteed to have. Same
 * height either way, so the swap moves nothing when the real one arrives.
 */
export function ShopMasthead({ products }: { products: CatalogueProduct[] }) {
  const banner = useBanner('masthead')

  if (!banner) return <FallbackMasthead products={products} />

  return (
    <HeroLink
      banner={banner}
      slot="masthead"
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
      <span aria-hidden className="absolute inset-0" style={{ background: SHOP_SCRIM }} />
      <span
        className="absolute inset-y-0 left-0 flex flex-col justify-center"
        style={{ padding: 'var(--space-5)', maxWidth: TEXT_COLUMN }}
      >
        <span className="sf-title block" style={{ color: 'var(--text)' }}>{banner.headline}</span>
        {banner.subhead && (
          <span className="sf-meta block" style={{ marginTop: 'var(--space-1)' }}>{banner.subhead}</span>
        )}
      </span>
    </HeroLink>
  )
}

/**
 * What the shop opens on before anybody has uploaded anything.
 *
 * Made of three product photographs, because cut-out product imagery is the one
 * kind this app always has.
 */
function FallbackMasthead({ products }: { products: CatalogueProduct[] }) {
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

/* ── The twin tiles ───────────────────────────────────────────────────────── */

/**
 * Two 4:5 portraits, side by side, under the goal row.
 *
 * Portrait because it is the only shape that survives being next to another
 * one: two landscape tiles at half width are two letterboxes, and neither has
 * room for a subject. The label sits at the foot, over its own scrim.
 *
 * With one tile filled it spans the row rather than leaving a gap, so a founder
 * part-way through uploading sees a deliberate-looking shop rather than a
 * missing tooth.
 */
export function ShopTwinTiles() {
  const left = useBanner('duo-a')
  const right = useBanner('duo-b')
  const filled = [left, right].filter(Boolean) as ShopBannerMeta[]
  const slots = ['duo-a', 'duo-b'] as const

  if (filled.length === 0) return null

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 'var(--space-3)',
        padding: '0 var(--space-4)',
        marginTop: 'var(--space-5)',
      }}
    >
      {[left, right].map((banner, i) =>
        banner ? (
          <HeroLink
            key={slots[i]}
            banner={banner}
            slot={slots[i]}
            className="relative block overflow-hidden"
            style={{
              borderRadius: 'var(--r-card)',
              background: 'var(--surface)',
              aspectRatio: '4 / 5',
              gridColumn: filled.length === 1 ? 'span 2' : undefined,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bannerImageSrc(banner.id, banner.version)}
              alt={banner.alt}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <span aria-hidden className="absolute inset-0" style={{ background: TILE_SCRIM }} />
            <span
              className="absolute inset-x-0 bottom-0 flex flex-col"
              style={{ padding: 'var(--space-4)' }}
            >
              <span className="sf-title block" style={{ color: 'var(--text)' }}>{banner.headline}</span>
              {/*
                Always rendered, even with nothing in it, and always two lines
                tall — see `SUBHEAD_LINES`. An absent subhead would collapse
                this tile's label to the bottom of the frame while the tile
                beside it kept two lines, and the pair would sit crooked.
              */}
              <span
                className="sf-meta block"
                style={{ ...SUBHEAD_LINES, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {banner.subhead}
              </span>
            </span>
          </HeroLink>
        ) : null,
      )}
    </div>
  )
}

/* ── The breaks ───────────────────────────────────────────────────────────── */

/**
 * A wide picture between two shelves.
 *
 * 12:5 — too short to read as a new page, which is the point. It interrupts the
 * rhythm of product rows without pretending to be the top of something. Full
 * bleed to the screen edges, unlike everything around it, so the interruption
 * is unmistakable rather than looking like a card that lost its products.
 */
export function ShopBreak({ slot }: { slot: string }) {
  const banner = useBanner(slot)
  const loaded = useLoaded()

  // Nothing at all until the answer is in: a break appearing late shoves the
  // shelf under it down the page while somebody is reading it.
  if (!loaded || !banner) return null

  return (
    <HeroLink
      banner={banner}
      slot={slot}
      className="relative block overflow-hidden"
      style={{
        background: 'var(--surface)',
        aspectRatio: '12 / 5',
        margin: 'var(--space-6) 0',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bannerImageSrc(banner.id, banner.version)}
        alt={banner.alt}
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
        decoding="async"
      />
      <span aria-hidden className="absolute inset-0" style={{ background: SHOP_SCRIM }} />
      <span
        className="absolute inset-y-0 left-0 flex flex-col justify-center"
        style={{ padding: 'var(--space-5)', maxWidth: TEXT_COLUMN }}
      >
        <span className="sf-title block" style={{ color: 'var(--text)' }}>{banner.headline}</span>
        {banner.subhead && (
          <span className="sf-meta block" style={{ marginTop: 'var(--space-1)' }}>{banner.subhead}</span>
        )}
      </span>
    </HeroLink>
  )
}
