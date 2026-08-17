import type { ShareFormat } from './format'
import type { ShareMethod, ShareFailure } from '@/lib/analytics/share'

/**
 * The share ladder.
 *
 * ── Why this is a ladder and not a button ───────────────────────────────────
 * There is no way to post to Instagram Stories from mobile web. No API, no URL
 * scheme that works outside a native app. What does work is the OS share sheet,
 * where Instagram → Stories is one tap — so the primary path is
 * `navigator.share({ files })`, and everything below it is what happens on a
 * device that cannot do that.
 *
 *   1. **Native file share.** One tap to Stories. Most mobile users land here.
 *   2. **Native link share.** Some browsers do `share()` but not files. Better
 *      than nothing: the link unfurls as the card.
 *   3. **Download.** Desktop, and Android browsers without file share.
 *   4. **Long-press.** iOS Safari silently ignores `download` on a cross-origin
 *      blob, so without this rung the button appears to do nothing at all. The
 *      caller shows the image full-bleed and says "press and hold to save".
 *
 * Every rung that fails is recorded rather than swallowed, because a failure
 * half-way down looks exactly like someone changing their mind.
 *
 * ── Two things that are easy to get wrong ───────────────────────────────────
 * `navigator.share()` **resolves when the sheet is dismissed**, not when the
 * customer posts. It never says where anything went. So a resolved promise means
 * "reached the sheet", and the analytics say exactly that.
 *
 * `AbortError` is the customer closing the sheet. It is not a failure and must
 * not fall through to a download — doing that hands a file to someone who just
 * said no.
 */

export interface ShareOutcome {
  ok: boolean
  method: ShareMethod | null
  /** Rungs that were tried and did not work, in order. */
  failures: Array<{ at: ShareFailure; message?: string }>
  /** True when the customer dismissed the OS sheet — not an error. */
  cancelled: boolean
}

export interface ShareRequest {
  blob: Blob
  fileName: string
  text: string
  url: string
  format: ShareFormat
}

/** Whether this browser can hand a file to the OS share sheet. */
export function canShareFiles(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function' &&
    navigator.canShare({ files: [file] })
  )
}

/**
 * Which rung this device will actually land on, worked out before anything is
 * pressed.
 *
 * The ladder is honest but it used to be silent: the button said "Share", and
 * what happened next was a share sheet, a download, or apparently nothing,
 * depending on the browser. Somebody on a desktop pressed Share and got a file
 * in their Downloads folder with no explanation.
 *
 * Knowing the rung up front lets the button say what it is about to do and lets
 * the caller teach the step people actually miss — that the card reaches a story
 * by picking Instagram in the OS sheet. The probe file is a real one because
 * `canShare({ files })` inspects the type; a zero-byte PNG answers the same
 * question as a 400KB one.
 */
export type ShareCapability = 'files' | 'link' | 'download' | 'manual'

export function shareCapability(): ShareCapability {
  if (typeof navigator === 'undefined') return 'manual'

  const probe = new File([new Uint8Array(1)], 'card.png', { type: 'image/png' })
  if (canShareFiles(probe)) return 'files'
  if (canShareLink()) return 'link'

  // Same test `defaultDownload` makes, so the label cannot promise a save the
  // ladder is about to refuse.
  if (typeof document !== 'undefined' && 'download' in document.createElement('a') && !isIosSafari()) {
    return 'download'
  }
  return 'manual'
}

/** Whether this browser can share at all. */
function canShareLink(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /abort|cancel/i.test(err.message))
}

/**
 * Climb down until something works.
 *
 * `triggerDownload` is injected so the DOM poke is testable and so a caller can
 * substitute its own (the sheet uses an anchor it already has in the tree).
 */
export async function shareCard(
  req: ShareRequest,
  triggerDownload: (blob: Blob, fileName: string) => boolean = defaultDownload,
): Promise<ShareOutcome> {
  const failures: ShareOutcome['failures'] = []
  const file = new File([req.blob], req.fileName, { type: 'image/png' })

  // 1 — the file, to the OS sheet.
  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file], text: req.text, url: req.url })
      return { ok: true, method: 'native-file', failures, cancelled: false }
    } catch (err) {
      if (isAbort(err)) return { ok: false, method: null, failures, cancelled: true }
      failures.push({ at: 'share-failed', message: (err as Error)?.message })
    }
  } else {
    failures.push({ at: 'share-unavailable' })
  }

  // 2 — the link, to the OS sheet. The card still unfurls from it.
  if (canShareLink()) {
    try {
      await navigator.share({ text: req.text, url: req.url })
      return { ok: true, method: 'native-link', failures, cancelled: false }
    } catch (err) {
      if (isAbort(err)) return { ok: false, method: null, failures, cancelled: true }
      failures.push({ at: 'share-failed', message: (err as Error)?.message })
    }
  }

  // 3 — download it.
  if (triggerDownload(req.blob, req.fileName)) {
    return { ok: true, method: 'download', failures, cancelled: false }
  }
  failures.push({ at: 'download-blocked' })

  // 4 — the caller shows the image and says "press and hold". Not a success
  // here: nothing has been saved yet, and the sheet reports it separately when
  // the customer has had the chance to.
  return { ok: false, method: null, failures, cancelled: false }
}

/**
 * An object-URL anchor click.
 *
 * Returns false where the browser will not honour it, which is the case this
 * whole rung exists to detect: iOS Safari ignores `download` on a blob URL and
 * navigates instead, leaving the customer on a bare image with no way back.
 */
function defaultDownload(blob: Blob, fileName: string): boolean {
  if (typeof document === 'undefined') return false
  const a = document.createElement('a')
  if (!('download' in a)) return false
  if (isIosSafari()) return false

  const href = URL.createObjectURL(blob)
  a.href = href
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoked on a turn of the event loop: revoking synchronously races the
  // click on some browsers and downloads a zero-byte file.
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
  return true
}

/**
 * iOS Safari, including every third-party browser on iOS — they are all WebKit
 * with the same download behaviour, so sniffing for "Safari" alone would send
 * Chrome-on-iOS down a rung that does not work there either.
 */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as a Mac; the touch points give it away.
    (/Macintosh/.test(ua) && typeof document !== 'undefined' && navigator.maxTouchPoints > 1)
  return iOS
}

/** Copy to clipboard, with the outcome the sheet needs to report. */
export async function copyLink(url: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    return false
  }
}
