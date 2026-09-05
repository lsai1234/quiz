'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BANNER_MIMES,
  MAX_ALT,
  SHOP_SCRIM,
  TILE_SCRIM,
  bannerImageSrc,
  validateImage,
  validateCopy,
  type ShopBannerMeta,
} from '@/lib/shop/banners'
import {
  placementsInOrder,
  ratioLabel,
  targetLabel,
  type Placement,
} from '@/lib/shop/placements'
import { Button, Card, Checkbox, Input, Note } from '@/components/system'
import { groupByCategory } from '@/lib/shop/categories'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * The shop's hero artwork, in the Founders Hub.
 *
 * ── One section per place in the shop ───────────────────────────────────────
 * This screen used to be a list you added banners to, with a position number to
 * order them by. That asked the wrong question. A founder does not want to
 * manage a collection of banners; they want to decide what the picture at the
 * top of the shop is, and what sits between the shelves halfway down.
 *
 * So the screen is the shop's layout, in order, with one card per position.
 * Each card says where it appears, what shape it has to be, and either shows
 * what is in it or says plainly that it is empty and what that means — the
 * masthead falls back to something built, everything else is simply absent.
 * There is no "add", because there is nothing to add: the places already exist.
 *
 * ── The file is measured in the browser before anything is sent ─────────────
 * Telling somebody their image is the wrong ratio after a four-megabyte upload
 * is a poor way to treat them, so the dimensions are read from an `Image` here
 * and the bad ones refused before a byte leaves. The route re-checks all of it
 * — this is a courtesy, not a control.
 */

interface Draft {
  headline: string
  subhead: string
  href: string
  alt: string
  active: boolean
  /** Base64 of newly chosen artwork; null when the existing art is being kept. */
  data: string | null
  mime: string
  width: number
  height: number
  /** Object URL for the local preview, before anything is uploaded. */
  preview: string | null
}

function emptyDraft(): Draft {
  return {
    headline: '', subhead: '', href: '/shop', alt: '',
    active: true, data: null, mime: '', width: 0, height: 0, preview: null,
  }
}

function draftFrom(b: ShopBannerMeta): Draft {
  return {
    headline: b.headline, subhead: b.subhead, href: b.href, alt: b.alt,
    active: b.active, data: null, mime: b.mime, width: b.width, height: b.height, preview: null,
  }
}

/** Read a chosen file into base64 and its real pixel dimensions. */
async function readFile(file: File): Promise<{ data: string; width: number; height: number }> {
  const buffer = await file.arrayBuffer()
  // `btoa` on a large string blows the call stack when spread in one go, so the
  // bytes go through in chunks.
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  const data = btoa(binary)

  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('That file could not be read as an image.'))
    img.src = `data:${file.type};base64,${data}`
  })

  return { data, width, height }
}

/**
 * The links a banner can actually point at, on THIS shop, right now.
 *
 * A founder types a path by hand, and a path that goes nowhere is the one kind
 * of mistake nothing catches: tapping a tile that links to a category anchor
 * which does not exist scrolls precisely nowhere, and looks to a customer like
 * the shop is broken. The categories come from the live catalogue rather than a
 * hardcoded list, because they are supplier data and change without a deploy.
 *
 * Empty when the catalogue cannot be read, which turns the check off rather
 * than warning about every link — a Hub that cries wolf gets ignored.
 */
function useShopAnchors(): string[] {
  const [anchors, setAnchors] = useState<string[]>([])

  useEffect(() => {
    let live = true
    fetch('/api/catalogue')
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => {
        if (!live) return
        const products: CatalogueProduct[] = Array.isArray(d.products) ? d.products : []
        if (products.length === 0) return
        setAnchors([
          '/shop#shop-cat-bundles',
          ...groupByCategory(products).map((c) => `/shop#shop-cat-${c.slug}`),
        ])
      })
      .catch(() => { /* check off */ })
    return () => { live = false }
  }, [])

  return anchors
}

/**
 * The reason this link probably will not work, or null. A WARNING, not a block.
 *
 * Only `#shop-cat-` anchors are checked, because they are the only paths whose
 * existence can be known from here — a category anchor is generated from the
 * catalogue, so a missing one is provably missing. Everything else is a route,
 * and a route this screen cannot see is not evidence of anything.
 *
 * It never blocks a save. A founder writing a banner for a category that is
 * about to be imported is doing something reasonable, and the catalogue can be
 * empty for reasons that have nothing to do with the link.
 */
function anchorWarning(href: string, anchors: string[]): string | null {
  if (anchors.length === 0) return null
  if (!href.includes('#shop-cat-')) return null
  if (anchors.includes(href)) return null
  return `Nothing on the shop has that anchor, so tapping this will not go anywhere. The shelves right now are: ${anchors
    .map((a) => a.split('#')[1].replace('shop-cat-', ''))
    .join(', ')}.`
}

export function ShopBannerSettings() {
  const [banners, setBanners] = useState<Record<string, ShopBannerMeta>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const anchors = useShopAnchors()

  const load = useCallback(async () => {
    const res = await fetch('/api/portal/shop-banners')
    if (!res.ok) return
    const body = await res.json()
    const list: ShopBannerMeta[] = Array.isArray(body.banners) ? body.banners : []
    setBanners(Object.fromEntries(list.map((b) => [b.slot, b])))
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <Note tone="info">
        Each of these is a fixed place in the shop. Fill the ones you have artwork for — the
        rest are simply not there, and the page closes up around them.
      </Note>

      {placementsInOrder().map((place) => (
        <PlacementCard
          key={place.id}
          place={place}
          banner={banners[place.id] ?? null}
          anchors={anchors}
          open={editing === place.id}
          onOpen={() => setEditing(place.id)}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load() }}
        />
      ))}
    </div>
  )
}

function PlacementCard({
  place, banner, anchors, open, onOpen, onClose, onSaved,
}: {
  place: Placement
  banner: ShopBannerMeta | null
  anchors: string[]
  open: boolean
  onOpen: () => void
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft>(() => (banner ? draftFrom(banner) : emptyDraft()))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Re-seed when the saved banner changes underneath, but never while the form
  // is open — that would wipe what somebody is halfway through typing.
  useEffect(() => {
    if (!open) setDraft(banner ? draftFrom(banner) : emptyDraft())
  }, [banner, open])

  const choose = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const { data, width, height } = await readFile(file)
      const problem = validateImage({ width, height, bytes: file.size, mime: file.type }, place)
      if (problem) { setError(problem); return }
      setDraft((d) => ({ ...d, data, mime: file.type, width, height, preview: URL.createObjectURL(file) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.')
    }
  }

  const save = async () => {
    const problem = validateCopy({ ...draft, slot: place.id }, place)
    if (problem) { setError(problem); return }
    if (!banner && !draft.data) { setError(`Choose the artwork for ${place.label} first.`); return }

    setBusy(true)
    setError(null)
    const res = await fetch('/api/portal/shop-banners', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slot: place.id,
        headline: draft.headline, subhead: draft.subhead, href: draft.href, alt: draft.alt,
        active: draft.active,
        data: draft.data, mime: draft.mime, width: draft.width, height: draft.height,
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Could not save that.')
      return
    }
    await onSaved()
  }

  const remove = async () => {
    setBusy(true)
    await fetch(`/api/portal/shop-banners?slot=${encodeURIComponent(place.id)}`, { method: 'DELETE' })
    setBusy(false)
    await onSaved()
  }

  return (
    <Card padding="roomy">
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
        <SlotThumb place={place} banner={banner} />

        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 'var(--text-lead)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
            {place.label}
          </p>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>{place.where}</p>
          <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', marginTop: 'var(--space-2)' }}>
            {ratioLabel(place)} · generate at {targetLabel(place)}
          </p>

          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)', marginTop: 'var(--space-3)' }}>
            {banner
              ? `${banner.active ? 'Live' : 'Switched off'} — “${banner.headline}”, links to ${banner.href}`
              : place.fallback
                ? 'Empty. The shop is showing the built-in version made from product photos.'
                : 'Empty. This space is not in the shop at all until you fill it.'}
          </p>
          <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
            {place.purpose}
          </p>

          {!open && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              <Button size="sm" variant={banner ? 'secondary' : 'primary'} onClick={onOpen}>
                {banner ? 'Change' : 'Add artwork'}
              </Button>
              {banner && (
                <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>Remove</Button>
              )}
            </div>
          )}
        </div>
      </div>

      {open && (
        <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept={BANNER_MIMES.join(',')}
              hidden
              onChange={(e) => void choose(e.target.files?.[0])}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              {draft.data ? 'Choose different artwork' : banner ? 'Replace the artwork' : 'Choose artwork'}
            </Button>
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-2)' }}>
              {ratioLabel(place)}, at least {place.min.width}×{place.min.height}.{' '}
              {place.copy === 'label'
                ? 'Keep the bottom third quiet — the label sits there.'
                : 'Keep the left of the frame quiet — the headline sits there.'}
            </p>
          </div>

          {(draft.preview || banner) && (
            <SlotPreview place={place} draft={draft} banner={banner} />
          )}

          <Input
            label={place.copy === 'label' ? 'Label' : 'Headline'}
            hint={`${draft.headline.length}/${place.maxHeadline}`}
            value={draft.headline}
            onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.value }))}
            maxLength={place.maxHeadline}
          />

          <Input
            label="Subhead"
            hint={`${draft.subhead.length}/${place.maxSubhead}`}
            value={draft.subhead}
            onChange={(e) => setDraft((d) => ({ ...d, subhead: e.target.value }))}
            maxLength={place.maxSubhead}
          />

          <Input
            label="Links to"
            hint="A path on this site, like /shop or /quizv2"
            value={draft.href}
            onChange={(e) => setDraft((d) => ({ ...d, href: e.target.value }))}
          />

          {/* A warning rather than a validation error — see `anchorWarning`. */}
          {anchorWarning(draft.href, anchors) && (
            <Note tone="attention">{anchorWarning(draft.href, anchors)}</Note>
          )}

          <Input
            label="What the picture shows"
            hint={`Read aloud by a screen reader, and shown if the image fails. ${draft.alt.length}/${MAX_ALT}`}
            value={draft.alt}
            onChange={(e) => setDraft((d) => ({ ...d, alt: e.target.value }))}
            maxLength={MAX_ALT}
          />

          <Checkbox
            checked={draft.active}
            onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
            label="Live on the shop"
          />

          {error && <Note tone="critical">{error}</Note>}

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="primary" onClick={save} loading={busy}>Save</Button>
            <Button variant="ghost" onClick={() => { onClose(); setError(null) }}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  )
}

/**
 * The thumbnail, at the placement's real shape.
 *
 * An empty one is drawn as an outline of the right proportions rather than
 * hidden, so the column of cards reads as the shape of the page: a wide
 * masthead, two uprights, two letterboxes.
 */
function SlotThumb({ place, banner }: { place: Placement; banner: ShopBannerMeta | null }) {
  const width = place.ratio >= 2 ? 132 : place.ratio > 1 ? 120 : 76
  const common = {
    width,
    aspectRatio: `${place.target.width} / ${place.target.height}`,
    borderRadius: 'var(--radius-row)',
    flexShrink: 0,
  } as const

  if (!banner) {
    return (
      <div
        aria-hidden
        style={{
          ...common,
          border: '1px dashed var(--edge)',
          background: 'var(--surface-2)',
        }}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={bannerImageSrc(banner.id, banner.version)}
      alt=""
      style={{ ...common, objectFit: 'cover', opacity: banner.active ? 1 : 0.45 }}
    />
  )
}

/**
 * The preview, carrying the same scrim and the same live text the shop draws.
 *
 * "Is the headline readable over this picture" is the only question a preview
 * exists to answer, and one that flatters the artwork by leaving the wash off
 * is worse than none. Portrait placements get the bottom-up scrim and their
 * text at the foot, because that is where the shop puts it.
 */
function SlotPreview({ place, draft, banner }: { place: Placement; draft: Draft; banner: ShopBannerMeta | null }) {
  const src = draft.preview ?? (banner ? bannerImageSrc(banner.id, banner.version) : '')
  const foot = place.copy === 'label'

  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: `${place.target.width} / ${place.target.height}`,
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        background: 'var(--surface-2)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <span
        aria-hidden
        style={{ position: 'absolute', inset: 0, background: foot ? TILE_SCRIM : SHOP_SCRIM }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: foot ? 'flex-end' : 'center',
          padding: 'var(--space-5)',
          maxWidth: foot ? undefined : '68%',
        }}
      >
        <span style={{ fontSize: foot ? 17 : 20, fontWeight: 500, color: 'var(--text)', lineHeight: 1.25 }}>
          {draft.headline || (foot ? 'Your label' : 'Your headline')}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
          {draft.subhead || 'Your subhead'}
        </span>
      </span>
    </div>
  )
}
