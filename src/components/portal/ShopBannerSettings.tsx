'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BANNER_MIMES,
  BANNER_TARGET,
  MAX_ACTIVE_BANNERS,
  MAX_ALT,
  MAX_HEADLINE,
  MAX_SUBHEAD,
  bannerImageSrc,
  validateImage,
  validateCopy,
  type ShopBannerMeta,
} from '@/lib/shop/banners'
import { Button, Card, Checkbox, Input, Note } from '@/components/system'
import { SHOP_SCRIM } from '@/lib/shop/banners'

/**
 * The shop's hero banners, in the Founders Hub.
 *
 * ── The file is measured in the browser before anything is sent ─────────────
 * Telling somebody their image is the wrong ratio after a four-megabyte upload
 * is a poor way to treat them, so the dimensions and the shape are read from an
 * `Image` here and the bad ones are refused before a byte leaves. The route
 * re-checks all of it — this is a courtesy, not a control.
 *
 * ── Why the copy is separate from the artwork ───────────────────────────────
 * Because a founder will want to change an offer without regenerating a
 * picture, and re-generate a picture without retyping the offer. The two are
 * different fields on the same row and either can be saved without the other.
 */

interface Draft {
  headline: string
  subhead: string
  href: string
  alt: string
  active: boolean
  position: number
  /** Base64 of newly chosen artwork; null when the existing art is being kept. */
  data: string | null
  mime: string
  width: number
  height: number
  /** Object URL for the local preview, before anything is uploaded. */
  preview: string | null
}

const EMPTY: Draft = {
  headline: '', subhead: '', href: '/shop', alt: '',
  active: true, position: 0, data: null, mime: '', width: 0, height: 0, preview: null,
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

export function ShopBannerSettings() {
  const [banners, setBanners] = useState<ShopBannerMeta[]>([])
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/portal/shop-banners')
    if (!res.ok) return
    const body = await res.json()
    setBanners(Array.isArray(body.banners) ? body.banners : [])
  }, [])

  useEffect(() => { void load() }, [load])

  const startNew = () => {
    setEditing('new')
    setDraft({ ...EMPTY, position: banners.length })
    setError(null)
  }

  const startEdit = (b: ShopBannerMeta) => {
    setEditing(b.id)
    setDraft({
      headline: b.headline, subhead: b.subhead, href: b.href, alt: b.alt,
      active: b.active, position: b.position,
      data: null, mime: b.mime, width: b.width, height: b.height, preview: null,
    })
    setError(null)
  }

  const choose = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const { data, width, height } = await readFile(file)
      const problem = validateImage({ width, height, bytes: file.size, mime: file.type })
      if (problem) { setError(problem); return }
      setDraft((d) => ({ ...d, data, mime: file.type, width, height, preview: URL.createObjectURL(file) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.')
    }
  }

  const save = async () => {
    const problem = validateCopy(draft)
    if (problem) { setError(problem); return }
    if (editing === 'new' && !draft.data) { setError('Choose the artwork first.'); return }

    setBusy(true)
    setError(null)
    const res = await fetch('/api/portal/shop-banners', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: editing === 'new' ? null : editing,
        headline: draft.headline, subhead: draft.subhead, href: draft.href, alt: draft.alt,
        active: draft.active, position: draft.position,
        data: draft.data, mime: draft.mime, width: draft.width, height: draft.height,
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Could not save that banner.')
      return
    }
    setEditing(null)
    await load()
  }

  const remove = async (id: string) => {
    setBusy(true)
    await fetch(`/api/portal/shop-banners?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    setBusy(false)
    await load()
  }

  const liveCount = banners.filter((b) => b.active).length

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {liveCount > MAX_ACTIVE_BANNERS && (
        <Note tone="attention">
          {liveCount} banners are switched on and the shop shows {MAX_ACTIVE_BANNERS}. The rest are
          ordered out of view rather than hidden — switch some off so it is obvious which are live.
        </Note>
      )}

      {banners.map((b) => (
        <Card key={b.id} padding="normal">
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bannerImageSrc(b.id, b.version)}
              alt=""
              width={160}
              style={{ width: 160, aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 'var(--radius-row)', flexShrink: 0 }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 'var(--text-lead)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
                {b.headline}
              </p>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>{b.subhead}</p>
              <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', marginTop: 'var(--space-2)' }}>
                {b.active ? 'Live' : 'Off'} · position {b.position} · links to {b.href} · {b.width}×{b.height}
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                <Button size="sm" variant="secondary" onClick={() => startEdit(b)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(b.id)} disabled={busy}>Delete</Button>
              </div>
            </div>
          </div>
        </Card>
      ))}

      {editing === null && (
        <div>
          <Button variant="primary" onClick={startNew}>Add a banner</Button>
        </div>
      )}

      {editing !== null && (
        <Card padding="roomy">
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept={BANNER_MIMES.join(',')}
                hidden
                onChange={(e) => void choose(e.target.files?.[0])}
              />
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                {draft.data ? 'Choose different artwork' : 'Choose artwork'}
              </Button>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-2)' }}>
                16:9, at least {BANNER_TARGET.width}×{BANNER_TARGET.height}. Leave room on the LEFT —
                the headline is drawn over that side.
              </p>
            </div>

            {(draft.preview || editing !== 'new') && (
              /* The preview carries the same scrim and the same live text the
                 shop draws, because "is this readable" is the only question the
                 preview exists to answer. */
              <div style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 'var(--radius-card)', overflow: 'hidden', background: 'var(--surface-2)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.preview ?? (editing !== 'new' ? bannerImageSrc(editing, banners.find((b) => b.id === editing)?.version ?? '') : '')}
                  alt=""
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <span
                  aria-hidden
                  style={{ position: 'absolute', inset: 0, background: SHOP_SCRIM }}
                />
                <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'var(--space-5)', maxWidth: '68%' }}>
                  <span style={{ fontSize: 20, fontWeight: 500, color: 'var(--text)', lineHeight: 1.25 }}>
                    {draft.headline || 'Your headline'}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
                    {draft.subhead || 'Your subhead'}
                  </span>
                </span>
              </div>
            )}

            <Input
              label="Headline"
              hint={`${draft.headline.length}/${MAX_HEADLINE}`}
              value={draft.headline}
              onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.value }))}
              maxLength={MAX_HEADLINE}
            />

            <Input
              label="Subhead"
              hint={`${draft.subhead.length}/${MAX_SUBHEAD}`}
              value={draft.subhead}
              onChange={(e) => setDraft((d) => ({ ...d, subhead: e.target.value }))}
              maxLength={MAX_SUBHEAD}
            />

            <Input
              label="Links to"
              hint="A path on this site, like /shop or /quizv2"
              value={draft.href}
              onChange={(e) => setDraft((d) => ({ ...d, href: e.target.value }))}
            />

            <Input
              label="What the picture shows"
              hint={`Read aloud by a screen reader, and shown if the image fails. ${draft.alt.length}/${MAX_ALT}`}
              value={draft.alt}
              onChange={(e) => setDraft((d) => ({ ...d, alt: e.target.value }))}
              maxLength={MAX_ALT}
            />

            <Input
              label="Position"
              hint="Lower numbers show first"
              type="number"
              value={String(draft.position)}
              onChange={(e) => setDraft((d) => ({ ...d, position: Number(e.target.value) || 0 }))}
            />

            <Checkbox
              checked={draft.active}
              onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
              label="Live on the shop"
            />

            {error && <Note tone="critical">{error}</Note>}

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button variant="primary" onClick={save} loading={busy}>Save</Button>
              <Button variant="ghost" onClick={() => { setEditing(null); setError(null) }}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
