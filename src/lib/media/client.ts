'use client'

/**
 * Uploading a video from the browser, a chunk at a time (`./store`): checks
 * the file, takes a still from it for the poster frame, then sends it in
 * one-megabyte pieces small enough for any request limit. Used by the
 * Founders Hub (demos, the trainer's videos, video notes) and by members'
 * form checks, each through its own endpoint.
 */
const CHUNK = 1024 * 1024
const TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

export interface Uploaded {
  id: string
  url: string
}

export class UploadProblem extends Error {}

/** A still from a second into the clip, as a small JPEG; null when the browser can't. */
async function stillOf(file: File): Promise<string | null> {
  try {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.src = url
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('unreadable'))
    })
    video.currentTime = Math.min(1, (video.duration || 1) / 2)
    await new Promise<void>((resolve) => (video.onseeked = () => resolve()))
    const w = 480
    const h = Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * w) || 270
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')?.drawImage(video, 0, 0, w, h)
    URL.revokeObjectURL(url)
    return canvas.toDataURL('image/jpeg', 0.7)
  } catch {
    return null
  }
}

/**
 * A few small stills spread through the clip, for an AI draft of a form check
 * (only while AI drafts are on). 512 wide, so the form shows without sending
 * more of the picture than it needs. Empty when the browser can't.
 */
export async function framesOf(file: File, count = 8): Promise<string[]> {
  const out: string[] = []
  try {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.src = url
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('unreadable'))
    })
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1
    const w = 512
    const h = Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * w) || 288
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    for (let i = 0; i < count; i++) {
      video.currentTime = (duration * (i + 0.5)) / count
      await new Promise<void>((resolve) => (video.onseeked = () => resolve()))
      canvas.getContext('2d')?.drawImage(video, 0, 0, w, h)
      out.push(canvas.toDataURL('image/jpeg', 0.6))
    }
    URL.revokeObjectURL(url)
  } catch {
    // Whatever was taken stands; none is fine too.
  }
  return out
}

/** How long the clip is, in seconds; null when it can't be read. */
export async function durationOf(file: File): Promise<number | null> {
  try {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.src = url
    const d = await new Promise<number>((resolve, reject) => {
      video.onloadedmetadata = () => resolve(video.duration)
      video.onerror = () => reject(new Error('unreadable'))
    })
    URL.revokeObjectURL(url)
    return Number.isFinite(d) ? d : null
  } catch {
    return null
  }
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function uploadVideo(
  file: File,
  opts: {
    endpoint: string
    kind: string
    title?: string | null
    extra?: Record<string, unknown>
    maxBytes: number
    onProgress?: (fraction: number) => void
    /** Send a few stills with it, for an AI draft (form checks, AI drafts on). */
    frames?: boolean
  },
): Promise<Uploaded> {
  const mime = file.type || (file.name.toLowerCase().endsWith('.mov') ? 'video/quicktime' : '')
  if (!TYPES.includes(mime)) throw new UploadProblem('That isn’t a video we can play. Use an MP4 or a MOV from your phone.')
  if (file.size > opts.maxBytes) throw new UploadProblem(`That video is too big. Keep it under ${Math.round(opts.maxBytes / (1024 * 1024))} MB.`)
  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(opts.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) throw new UploadProblem(typeof data?.error === 'string' ? data.error : 'The upload didn’t go through. Try again.')
    return data ?? {}
  }
  const begun = await post({
    action: 'begin',
    kind: opts.kind,
    mime,
    size: file.size,
    title: opts.title ?? null,
    still: await stillOf(file),
    ...(opts.frames ? { frames: await framesOf(file) } : {}),
    ...opts.extra,
  })
  const id = String(begun.id)
  const chunks = Math.ceil(file.size / CHUNK)
  for (let n = 0; n < chunks; n++) {
    await post({ action: 'chunk', id, n, data: await base64(file.slice(n * CHUNK, Math.min(file.size, (n + 1) * CHUNK))) })
    opts.onProgress?.((n + 1) / chunks)
  }
  const done = await post({ action: 'finish', id, ...opts.extra })
  return { id, url: String(done.url ?? `/api/media/${id}`) }
}
