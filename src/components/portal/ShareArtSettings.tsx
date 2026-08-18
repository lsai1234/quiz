'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ArtKey } from '@/lib/share-card/art'
import type { ArtUploadMeta } from '@/lib/db/share-card-art'
import {
  ART_MIMES, ART_MAX_BYTES, DERIVATIVE, CARD_WINDOW, LEFT_THIRD,
  validateSource, leftThirdWarning,
} from '@/lib/share-card/art-upload'
import { Button, Checkbox } from '@/components/system'

/**
 * The card's six category photographs, in the Founders Hub.
 *
 * ── The preview shows the crop, not the picture ─────────────────────────────
 * The art window on the card is 1080 × 1210 and the source is 3:4, so `cover`
 * throws away the bottom fifth. A subject composed for the full frame and lost
 * below the fold is the most likely way this goes wrong, and it is invisible
 * until a card is rendered — so the preview is the crop, at the real ratio, with
 * the scrim and the score's guide over it.
 *
 * ── Everything happens in the browser ───────────────────────────────────────
 * Dimensions, ratio, the left-third luminance sample and the 1080 × 1440
 * derivative are all produced here on a canvas, and the route stores the result.
 * The brief asks for `sharp` server-side; `sharp` is a native binary that
 * doubles the function bundle, and this build carries no new running costs. The
 * route re-checks the limits rather than trusting them.
 */

interface Slot {
  key: ArtKey
  brief: string
  upload: ArtUploadMeta | null
}

interface Data {
  keys: Slot[]
  limits: { maxBytes: number; mimes: string[]; derivative: { width: number; height: number } }
}

const surface = { background: 'var(--surface-1)', border: '1px solid var(--edge)' } as const

const TITLE: Record<ArtKey, string> = {
  strength: 'Strength',
  performance: 'Performance',
  energy: 'Energy',
  recovery: 'Recovery',
  wellbeing: 'Wellbeing',
  hydration: 'Hydration',
}

/** Load a file into an off-screen bitmap without touching the DOM tree. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not read that file')) }
    img.src = url
  })
}

/** Mean luminance of the left third of an image, 0–255. */
function leftThirdLuminance(img: HTMLImageElement): number {
  // Sampled small: a 60 × 80 thumbnail of the left third is the same average as
  // the full-resolution one and costs nothing.
  const w = 60
  const h = 80
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0

  const sliceW = Math.max(1, Math.round(img.naturalWidth * LEFT_THIRD))
  ctx.drawImage(img, 0, 0, sliceW, img.naturalHeight, 0, 0, w, h)

  const { data } = ctx.getImageData(0, 0, w, h)
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
  }
  return total / (data.length / 4)
}

/** The stored derivative: 1080 × 1440, JPEG, cover-cropped from the source. */
function derivative(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas')
  canvas.width = DERIVATIVE.width
  canvas.height = DERIVATIVE.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')

  const target = DERIVATIVE.width / DERIVATIVE.height
  const source = img.naturalWidth / img.naturalHeight
  // Cover: the source is within 2% of 3:4 already, so this is a hairline
  // correction rather than a real crop — but a hairline correction that is not
  // made is a one-pixel band of nothing down one edge of the card.
  const sw = source > target ? img.naturalHeight * target : img.naturalWidth
  const sh = source > target ? img.naturalHeight : img.naturalWidth / target
  const sx = (img.naturalWidth - sw) / 2
  const sy = 0 // top-anchored, the same as the card's object-position

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, DERIVATIVE.width, DERIVATIVE.height)
  return canvas.toDataURL('image/jpeg', 0.88)
}

export function ShareArtSettings() {
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState<ArtKey | null>(null)
  const [errors, setErrors] = useState<Partial<Record<ArtKey, string>>>({})
  const [warnings, setWarnings] = useState<Partial<Record<ArtKey, string>>>({})
  const [guide, setGuide] = useState(true)

  useEffect(() => {
    fetch('/api/portal/share-art')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Data | null) => { if (d) setData(d) })
      .catch(() => {})
  }, [])

  const post = useCallback(async (body: Record<string, unknown>, key: ArtKey) => {
    setBusy(key)
    try {
      const res = await fetch('/api/portal/share-art', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setErrors((e) => ({ ...e, [key]: json.error ?? 'That did not save.' }))
        return
      }
      setErrors((e) => ({ ...e, [key]: undefined }))
      setData(json)
    } catch {
      setErrors((e) => ({ ...e, [key]: 'Couldn’t reach the server.' }))
    } finally {
      setBusy(null)
    }
  }, [])

  const accept = useCallback(async (key: ArtKey, file: File) => {
    setErrors((e) => ({ ...e, [key]: undefined }))
    setWarnings((w) => ({ ...w, [key]: undefined }))

    let img: HTMLImageElement
    try {
      img = await loadImage(file)
    } catch {
      setErrors((e) => ({ ...e, [key]: 'That file could not be read as an image.' }))
      return
    }

    const problem = validateSource({
      width: img.naturalWidth,
      height: img.naturalHeight,
      type: file.type,
      size: file.size,
    })
    if (problem) {
      setErrors((e) => ({ ...e, [key]: problem }))
      return
    }

    const warn = leftThirdWarning(leftThirdLuminance(img))
    if (warn) setWarnings((w) => ({ ...w, [key]: warn }))

    await post(
      { key, image: derivative(img), width: DERIVATIVE.width, height: DERIVATIVE.height },
      key,
    )
  }, [post])

  if (!data) {
    return <div className="text-xs text-[var(--ink-3)]">Loading…</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--ink-3)]">
          3:4 portrait, at least 1200 × 1600, under {Math.round(ART_MAX_BYTES / 1024 / 1024)}MB.
          Stored at {DERIVATIVE.width} × {DERIVATIVE.height}. Any slot left empty draws the
          gradient stand-in, so the card never shows a broken image.
        </p>
        <Checkbox
          className="shrink-0"
          label="Left-third guide"
          checked={guide}
          onChange={(e) => setGuide(e.target.checked)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.keys.map((slot) => (
          <ArtSlot
            key={slot.key}
            slot={slot}
            guide={guide}
            busy={busy === slot.key}
            error={errors[slot.key]}
            warning={warnings[slot.key]}
            onFile={(file) => accept(slot.key, file)}
            onReset={() => post({ key: slot.key, action: 'reset' }, slot.key)}
          />
        ))}
      </div>
    </div>
  )
}

function ArtSlot({ slot, guide, busy, error, warning, onFile, onReset }: {
  slot: Slot
  guide: boolean
  busy: boolean
  error?: string
  warning?: string
  onFile: (file: File) => void
  onReset: () => void
}) {
  const picker = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const upload = slot.upload

  // The version is in the URL so a replacement invalidates the browser's copy —
  // the same token the card's own cache key is built from.
  const src = upload ? `/api/share/art/${slot.key}?v=${upload.version}` : null

  return (
    <div className="rounded-2xl p-3 space-y-2" style={surface}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold text-[var(--ink-1)]">{TITLE[slot.key]}</h3>
        <span className="text-[10px] text-[var(--ink-3)]">
          {upload ? `${upload.width}×${upload.height}` : 'stand-in'}
        </span>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const file = e.dataTransfer.files?.[0]
          if (file) onFile(file)
        }}
        onClick={() => picker.current?.click()}
        className="relative w-full overflow-hidden rounded-xl cursor-pointer"
        style={{
          // The card's window, not the source's 3:4 — this is the crop.
          aspectRatio: `${CARD_WINDOW.width} / ${CARD_WINDOW.height}`,
          background: 'var(--surface-2)',
          border: over ? '1px solid var(--accent)' : '1px solid var(--edge)',
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: 'cover', objectPosition: 'center top' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[10px] leading-relaxed text-[var(--ink-3)]">
            {slot.brief}
          </div>
        )}

        {/* The card's own scrim, so the preview is what the card will look like
            rather than what the photograph looks like. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, rgba(5,6,8,.55) 0%, transparent 22%, transparent 62%, rgba(5,6,8,.88) 100%)',
          }}
        />

        {guide ? (
          <div
            className="absolute inset-y-0 left-0 flex items-center justify-center"
            style={{
              width: `${LEFT_THIRD * 100}%`,
              borderRight: '1px dashed rgba(34,211,238,.55)',
              background: 'rgba(34,211,238,.06)',
            }}
          >
            <span className="text-[9px] tracking-[.2em] text-[rgba(34,211,238,.8)]">SCORE</span>
          </div>
        ) : null}

        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[rgba(5,6,8,.6)] text-[10px] text-[var(--ink-1)]">
            Saving…
          </div>
        ) : null}
      </div>

      <input
        ref={picker}
        type="file"
        accept={ART_MIMES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Cleared so picking the same file twice still fires a change.
          e.target.value = ''
          if (file) onFile(file)
        }}
      />

      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          loading={busy}
          aria-label={`${upload ? "Replace" : "Upload"} the image for ${slot.key}`}
          onClick={() => picker.current?.click()}
        >
          {upload ? 'Replace' : 'Upload'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          loading={busy}
          disabled={!upload}
          aria-label={`Reset ${slot.key} to the stand-in`}
          onClick={onReset}
        >
          Reset
        </Button>
      </div>

      {error ? (
        <p role="status" style={{ fontSize: 'var(--text-meta)', color: 'var(--tone-critical)' }}>
          {error}
        </p>
      ) : null}
      {warning ? (
        <p role="status" style={{ fontSize: 'var(--text-meta)', color: 'var(--tone-attention)' }}>
          {warning}
        </p>
      ) : null}
    </div>
  )
}
