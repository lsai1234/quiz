'use client'

import { useRef, useState } from 'react'
import { Button, Input, Note } from '@/components/system'
import {
  validateUpload,
  derivativeSize,
  UPLOAD_MIMES,
  UPLOAD_MAX_BYTES,
} from '@/lib/images/founder-upload'

interface Props {
  /** Where the image is stored when one is uploaded — "bundle:leg-day-loading". */
  id: string
  label: string
  hint?: string
  /** The URL currently on the record. Either an upload's URL or one typed in. */
  value: string
  onChange: (url: string) => void
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

/** The stored derivative: the same picture, capped on its long edge, as JPEG. */
function derivative(img: HTMLImageElement): { dataUri: string; width: number; height: number } {
  const { width, height } = derivativeSize(img.naturalWidth, img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.drawImage(img, 0, 0, width, height)
  return { dataUri: canvas.toDataURL('image/jpeg', 0.85), width, height }
}

/**
 * A picture, from a file or from a link.
 *
 * ── Why both ───────────────────────────────────────────────────────────────
 * A URL field assumes the picture is already on the internet. That holds for a
 * supplier's product photo and does not hold for a photograph somebody took of
 * a session — "upload it to a host first, then paste the link" is the step at
 * which a bundle ships without a picture. So the file is the primary path and
 * the URL stays, because a picture already hosted should not have to be
 * downloaded and re-uploaded to be used.
 *
 * Both end up in the same place: a URL on the record. An upload is stored (see
 * `db/founder-images`) and its public URL is written into the same field, so
 * nothing downstream knows or cares which way the picture arrived.
 *
 * The preview is the point of the control. An image URL is the field a typo is
 * invisible in, and the picture is most of a shop card.
 */
export function ImageField({ id, label, hint, value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const img = await loadImage(file)
      const problem = validateUpload({
        width: img.naturalWidth, height: img.naturalHeight, type: file.type, size: file.size,
      })
      if (problem) { setError(problem); return }

      const shrunk = derivative(img)
      const res = await fetch('/api/portal/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, image: shrunk.dataUri, width: shrunk.width, height: shrunk.height }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) { setError(data.error ?? 'That upload failed.'); return }
      onChange(data.url)
    } catch {
      setError('That file could not be read.')
    } finally {
      setBusy(false)
      // Cleared so choosing the same file twice still fires a change event.
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <Input
          label={label}
          className="flex-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… or upload a file"
          hint={hint}
        />
        {value.trim() && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            style={{
              width: 72,
              height: 72,
              objectFit: 'cover',
              borderRadius: 'var(--radius-row)',
              border: '1px solid var(--edge)',
              marginTop: 'var(--space-5)',
            }}
          />
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={fileRef}
          type="file"
          accept={UPLOAD_MIMES.join(',')}
          hidden
          onChange={(e) => void choose(e.target.files?.[0])}
        />
        <Button size="sm" variant="secondary" loading={busy} disabled={busy} onClick={() => fileRef.current?.click()}>
          {value.trim() ? 'Replace with a file' : 'Upload a file'}
        </Button>
        {value.trim() && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onChange('')}>
            Remove
          </Button>
        )}
        <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
          JPG, PNG or WebP, up to {Math.round(UPLOAD_MAX_BYTES / (1024 * 1024))}MB. Resized before it is stored.
        </span>
      </div>

      {error && <Note tone="critical" live="assertive">{error}</Note>}
    </div>
  )
}
