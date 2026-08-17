'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ShareCardPayload } from '@/lib/share-card/types'
import { FORMATS, type ShareFormat } from '@/lib/share-card/format'
import { cardImageUrl, cardShareUrl, cardFileName, cardShareText, mintShareUrl } from '@/lib/share-card/share-link'
import { shareCard, copyLink, isIosSafari } from '@/lib/share-card/share-action'
import { share as shareEvents } from '@/lib/analytics/share'

/**
 * The share sheet.
 *
 * ── Why it is built like the rest of this screen ────────────────────────────
 * On the old palette (`--color-*`) and portalled, matching `ProductSwapModal`
 * next to it, rather than on `@/components/system`. `DESIGN.md` is explicit that
 * the two systems must not be mixed inside one screen, and the results page has
 * not been migrated. When it is, this moves with it.
 *
 * ── What it is actually doing ───────────────────────────────────────────────
 * Fetching a PNG and handing it to the OS share sheet. Everything visible is in
 * service of the two places that go wrong:
 *
 *   • **The wait.** Rasterising a 1080×1920 card is not instant, and a share
 *     button that does nothing for a second gets pressed twice. The preview and
 *     its skeleton are the feedback.
 *   • **The fall.** There is no way to post to Instagram Stories from mobile
 *     web, so the card reaches a story through the OS sheet — and on a device
 *     that cannot do that, `shareCard` falls to a download and then to
 *     press-and-hold. Each rung has to be *visible* when it is reached, or the
 *     customer is left pressing a button that appears dead.
 */

const ACCENT = '#00D4FF'

/** The formats offered. OG is a link preview and is never downloaded. */
const OFFERED: ShareFormat[] = ['story', 'square']

const FORMAT_LABEL: Record<ShareFormat, string> = {
  story: 'Story',
  square: 'Post',
  og: 'Link',
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'working' }
  /** Every rung failed. The image is shown full-bleed to be saved by hand. */
  | { kind: 'long-press' }
  | { kind: 'done'; message: string }

export function ShareSheet({ payload, onClose }: { payload: ShareCardPayload; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [format, setFormat] = useState<ShareFormat>('story')
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [ready, setReady] = useState(false)
  const shared = useRef(false)
  const openedAt = useRef(Date.now())

  const imageUrl = useMemo(() => cardImageUrl(payload, format), [payload, format])

  /**
   * The link, minted once and reused.
   *
   * Starts as the long stateless URL so the sheet is usable the instant it
   * opens, then upgrades to `/s/<token>` when the mint comes back. Sharing
   * before it lands gets the long link, which works — the short one is a nicety,
   * and blocking the primary button on a network call to get it would be
   * trading the feature for the polish.
   */
  const [link, setLink] = useState(() => cardShareUrl(payload))
  const minted = useRef(false)

  useEffect(() => {
    if (minted.current) return
    minted.current = true
    let live = true
    mintShareUrl(payload).then(({ url }) => { if (live) setLink(url) })
    return () => { live = false }
  }, [payload])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    shareEvents.open({ format, hasCode: !!payload.code })
    // Once, on open — the format switch reports itself separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scroll lock, matching ProductSwapModal.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const close = useCallback(() => {
    shareEvents.dismiss({ format, shared: shared.current })
    onClose()
  }, [format, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const pickFormat = (next: ShareFormat) => {
    if (next === format) return
    shareEvents.format({ from: format, to: next })
    setReady(false)
    setStage({ kind: 'idle' })
    setFormat(next)
  }

  const onShare = async () => {
    if (stage.kind === 'working') return
    setStage({ kind: 'working' })
    openedAt.current = Date.now()

    let blob: Blob
    try {
      const res = await fetch(imageUrl)
      if (!res.ok) throw new Error(`image route ${res.status}`)
      blob = await res.blob()
      shareEvents.render({ format, ms: Date.now() - openedAt.current, bytes: blob.size })
    } catch (err) {
      shareEvents.error({ at: 'render', format, message: (err as Error)?.message })
      // The card could not be made. Offer the link, which still unfurls as one.
      const copied = await copyLink(link)
      shareEvents.method({ method: 'copy-link', format })
      shared.current = copied
      setStage({ kind: 'done', message: copied ? 'Link copied' : 'Could not build the image — try again' })
      return
    }

    const outcome = await shareCard({
      blob,
      fileName: cardFileName(payload, format),
      text: cardShareText(payload),
      url: link,
      format,
    })

    for (const f of outcome.failures) shareEvents.error({ at: f.at, format, message: f.message })

    if (outcome.cancelled) {
      setStage({ kind: 'idle' })
      return
    }

    if (outcome.ok && outcome.method) {
      shareEvents.method({ method: outcome.method, format })
      shared.current = true
      setStage({
        kind: 'done',
        message: outcome.method === 'download' ? 'Saved' : 'Opening your share sheet…',
      })
      return
    }

    // Nothing worked. Show the card and tell them how to save it by hand.
    setStage({ kind: 'long-press' })
  }

  const onCopy = async () => {
    const ok = await copyLink(link)
    if (ok) {
      shareEvents.method({ method: 'copy-link', format })
      shared.current = true
      setStage({ kind: 'done', message: 'Link copied' })
    } else {
      shareEvents.error({ at: 'clipboard', format })
      setStage({ kind: 'done', message: 'Could not copy — long-press the link to select it' })
    }
  }

  if (!mounted) return null

  const spec = FORMATS[format]
  const busy = stage.kind === 'working'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Share your stack"
    >
      {/* The scrim. Named distinctly from the Close button rather than
          duplicating it: two controls with the same accessible name is a screen
          reader announcing the same thing twice with no way to tell them apart. */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={close}
        className="absolute inset-0 w-full h-full cursor-default"
        style={{ background: 'rgba(4,6,12,0.72)', backdropFilter: 'blur(8px)' }}
      />

      <div
        className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[92vh] overflow-y-auto"
        style={{ background: 'var(--color-surface, #121216)', border: '1px solid rgba(255,255,255,0.09)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg font-black tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
          >
            {stage.kind === 'long-press' ? 'Press and hold to save' : 'Share your stack'}
          </h2>
          <button
            type="button"
            onClick={close}
            className="text-sm px-3 py-1.5 rounded-full"
            style={{ color: 'var(--color-muted)' }}
          >
            Close
          </button>
        </div>

        {/* The preview. Also the thing being saved on the long-press rung, which
            is why it is the same element rather than a second image. */}
        <div
          className="relative mx-auto rounded-2xl overflow-hidden"
          style={{
            width: '100%',
            maxWidth: stage.kind === 'long-press' ? '100%' : '15rem',
            aspectRatio: `${spec.width} / ${spec.height}`,
            background: 'rgba(255,255,255,0.05)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={imageUrl}
            src={imageUrl}
            alt={`Your CHRGD stack, ${FORMAT_LABEL[format]} size`}
            onLoad={() => setReady(true)}
            className="w-full h-full object-cover"
            style={{ opacity: ready ? 1 : 0, transition: 'opacity 240ms' }}
          />
          {!ready && (
            <div
              className="absolute inset-0 flex items-center justify-center text-xs"
              style={{ color: 'var(--color-muted)' }}
            >
              Building your card…
            </div>
          )}
        </div>

        {stage.kind === 'long-press' ? (
          <p className="text-sm mt-4 leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
            Your browser won’t save the image for us. Press and hold the card above,
            then choose <strong style={{ color: 'var(--color-text)' }}>Save to Photos</strong>.
            {isIosSafari() ? ' Then open Instagram and add it to your story.' : ''}
          </p>
        ) : (
          <>
            <div className="flex gap-2 mt-4" role="tablist" aria-label="Card size">
              {OFFERED.map((f) => {
                const active = f === format
                return (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => pickFormat(f)}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold"
                    style={{
                      background: active ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${active ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.09)'}`,
                      color: active ? ACCENT : 'var(--color-text-2)',
                    }}
                  >
                    {FORMAT_LABEL[f]}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={onShare}
              disabled={busy}
              className="w-full mt-3 py-3.5 rounded-2xl text-base font-black tracking-tight"
              style={{
                fontFamily: 'var(--font-display)',
                background: busy ? 'rgba(0,212,255,0.4)' : ACCENT,
                color: '#07070A',
              }}
            >
              {busy ? 'Preparing…' : 'Share'}
            </button>

            <button
              type="button"
              onClick={onCopy}
              className="w-full mt-2 py-3 rounded-2xl text-sm font-semibold"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.09)',
                color: 'var(--color-text-2)',
              }}
            >
              Copy link
            </button>
          </>
        )}

        {stage.kind === 'done' && (
          <p className="text-sm mt-3 text-center" style={{ color: ACCENT }} role="status">
            {stage.message}
          </p>
        )}

        <p className="text-[11px] mt-4 text-center leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          Your card shows your stack and what it’s for. It never shows your price
          or anything from the health questions.
        </p>
      </div>
    </div>,
    document.body,
  )
}
