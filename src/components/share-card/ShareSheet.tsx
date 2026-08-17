'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ShareCardPayload } from '@/lib/share-card/types'
import { FORMATS, type ShareFormat } from '@/lib/share-card/format'
import { cardImageUrl, cardShareUrl, cardFileName, cardShareText, mintShareUrl } from '@/lib/share-card/share-link'
import { shareCard, copyLink, isIosSafari, shareCapability, type ShareCapability } from '@/lib/share-card/share-action'
import { share as shareEvents } from '@/lib/analytics/share'
import { Sheet, SheetHeader, SheetBody, SheetFooter } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { CardBuilding } from './CardBuilding'
import { FormatTabs } from './FormatTabs'
import { ShareEntryPanel } from './CompetitionEntry'

/**
 * The share sheet.
 *
 * ── What was wrong with the last one ────────────────────────────────────────
 * It was a wall. Seven blocks stacked down one scroll: a title, a thumbnail,
 * three tabs, a Share button, a Copy button, a paragraph about the entry card,
 * an accordion for the giveaway, and a privacy note. Everything was available
 * and nothing was obvious, and the two things that matter most were the worst
 * served — the card was the smallest element on a sheet that exists to show it,
 * and *entering the giveaway* was an accordion below the fold labelled with a
 * question.
 *
 * This is the same capability as three steps, one decision each:
 *
 *   1. **Compose.** Which card, and share it. Nothing else on screen.
 *   2. **Entered.** Sharing succeeded — now the handle, which is the step that
 *      actually enters somebody into the draw. It follows the share instead of
 *      competing with it.
 *   3. **Manual.** The bottom rung, when the browser will not save for us.
 *
 * ── The button says what it is about to do ──────────────────────────────────
 * `shareCapability()` is read before anything is pressed, so the label is
 * "Share your card" where the OS sheet exists and "Save your card" where it does
 * not, and the line under it names the step people actually miss: the card
 * reaches a story by picking Instagram in the sheet that opens.
 *
 * ── Why it is built on `@/components/ui` ────────────────────────────────────
 * On the old palette, matching the results screen it opens over — `DESIGN.md` is
 * explicit that the two systems must not be mixed inside one screen. It now uses
 * the shared `Sheet` rather than a hand-rolled copy of it, which is where the
 * focus trap, the focus restore, the exit animation and the scroll lock come
 * from. The previous version had none of them: a keyboard user could tab
 * straight out of an open sheet into the page behind it.
 */

/**
 * The formats offered, in the order they are offered.
 *
 * `entry` is prepended, not appended, and it is offered only while a competition
 * is running: it is a different card, not a badge on this one, so picking it
 * loads a different picture. First and preselected because while a draw is on it
 * is the card we want shared — a promotion that depends on somebody noticing a
 * third tab is a promotion most people never enter. The moment the draw closes
 * the tab disappears and "My stack" is the default again, with no code change.
 *
 * OG is never offered — it is a link preview, not something anybody downloads.
 */
const BASE_FORMATS: ShareFormat[] = ['story', 'square']

export const FORMAT_LABEL: Record<ShareFormat, string> = {
  story: 'My stack',
  square: 'Post',
  og: 'Link',
  entry: 'Competition',
}

/** What each card is for, said once, under the tabs. */
const FORMAT_NOTE: Record<ShareFormat, string> = {
  entry: 'Your stack, how to enter, and where to find us. Post this one to enter.',
  story: 'Full height, for an Instagram or TikTok story.',
  square: 'Square, for a feed post or a carousel.',
  og: 'The preview a pasted link unfurls as.',
}

/** What the primary button says, and what it warns about, per rung. */
const ACTION: Record<ShareCapability, { label: string; icon: 'share' | 'download'; note: string }> = {
  files: {
    label: 'Share your card',
    icon: 'share',
    note: 'Pick Instagram, then Story, in the sheet that opens.',
  },
  link: {
    label: 'Share the link',
    icon: 'share',
    note: 'This browser can’t hand over the image, so it shares a link that unfurls as your card.',
  },
  download: {
    label: 'Save your card',
    icon: 'download',
    note: 'Saves the image — then add it to your story from your camera roll.',
  },
  manual: {
    label: 'Save your card',
    icon: 'download',
    note: 'Saves the image — then add it to your story from your camera roll.',
  },
}

type Step =
  | { kind: 'compose' }
  /** Every rung failed. The image is shown full-bleed to be saved by hand. */
  | { kind: 'manual' }
  /** It went. What happens next depends on whether a draw is running. */
  | { kind: 'shared'; message: string }

interface Live { state: string; prize: string; test: boolean }

export function ShareSheet({ payload, onClose }: { payload: ShareCardPayload; onClose: () => void }) {
  const [format, setFormat] = useState<ShareFormat>('story')
  const [step, setStep] = useState<Step>({ kind: 'compose' })
  const [busy, setBusy] = useState(false)
  /** Something went wrong but the step did not change — shown in place. */
  const [notice, setNotice] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [comp, setComp] = useState<Live | null>(null)

  const shared = useRef(false)
  const startedAt = useRef(Date.now())
  /**
   * Whether the person has picked a tab themselves.
   *
   * The competition answer arrives a moment after the sheet opens, and switching
   * the card under somebody who has already chosen one is the sheet overruling
   * them. So the preselect happens once, and only if they have not touched it.
   */
  const chosen = useRef(false)

  const offered: ShareFormat[] = comp ? ['entry', ...BASE_FORMATS] : BASE_FORMATS

  /**
   * Read once, on mount. The answer cannot change while the sheet is open, and
   * probing on every render would build a `File` per keystroke.
   */
  const capability = useMemo<ShareCapability>(() => shareCapability(), [])
  const action = ACTION[capability]

  const imageUrl = useMemo(() => cardImageUrl(payload, format), [payload, format])

  /**
   * The competition, if one is running.
   *
   * Fetched rather than passed in, and fetched *live*, because §3.7 is explicit
   * that a promotion's state is never frozen: a sheet that decided at build time
   * would keep offering an entry into a draw that has closed.
   */
  useEffect(() => {
    let live = true
    fetch('/api/competition/enter')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || d?.state !== 'open') return
        setComp(d)
        if (!chosen.current) setFormat('entry')
      })
      .catch(() => {})
    return () => { live = false }
  }, [])

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

  useEffect(() => {
    shareEvents.open({ format, hasCode: !!payload.code })
    // Once, on open — the format switch reports itself separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = useCallback(() => {
    shareEvents.dismiss({ format, shared: shared.current })
    onClose()
  }, [format, onClose])

  const pickFormat = useCallback((next: ShareFormat) => {
    chosen.current = true
    setFormat((current) => {
      if (next === current) return current
      shareEvents.format({ from: current, to: next })
      setReady(false)
      return next
    })
  }, [])

  const onShare = async () => {
    if (busy) return
    setNotice(null)
    setBusy(true)
    startedAt.current = Date.now()

    let blob: Blob
    try {
      const res = await fetch(imageUrl)
      if (!res.ok) throw new Error(`image route ${res.status}`)
      blob = await res.blob()
      shareEvents.render({ format, ms: Date.now() - startedAt.current, bytes: blob.size })
    } catch (err) {
      shareEvents.error({ at: 'render', format, message: (err as Error)?.message })
      // The card could not be made. Offer the link, which still unfurls as one.
      const copied = await copyLink(link)
      shareEvents.method({ method: 'copy-link', format })
      shared.current = copied
      setBusy(false)
      if (copied) {
        setStep({ kind: 'shared', message: 'Link copied' })
      } else {
        setNotice('Could not build the image — try again in a moment.')
      }
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
    setBusy(false)

    // Dismissing the OS sheet is a change of mind, not a failure. Staying put is
    // the only correct response: advancing would claim something that did not
    // happen, and an error would blame somebody for pressing cancel.
    if (outcome.cancelled) return

    if (outcome.ok && outcome.method) {
      shareEvents.method({ method: outcome.method, format })
      shared.current = true
      setStep({
        kind: 'shared',
        message: outcome.method === 'download' ? 'Saved to your device' : 'Sent to your share sheet',
      })
      return
    }

    setStep({ kind: 'manual' })
  }

  const onCopy = async () => {
    setNotice(null)
    const ok = await copyLink(link)
    if (ok) {
      shareEvents.method({ method: 'copy-link', format })
      shared.current = true
      setStep({ kind: 'shared', message: 'Link copied' })
      return
    }
    // Stay put and say so. Advancing to the press-and-hold rung would answer a
    // clipboard refusal with an instruction about saving an image, which is a
    // different problem the person did not have.
    shareEvents.error({ at: 'clipboard', format })
    setNotice('Could not copy — long-press the link to select it.')
  }

  const spec = FORMATS[format]

  // ── The bottom rung ───────────────────────────────────────────────────────
  if (step.kind === 'manual') {
    return (
      <Sheet onClose={close} label="Save your card">
        <SheetHeader eyebrow="Last step" title="Press and hold to save" />
        <SheetBody className="flex flex-col items-center">
          <CardFrame
            spec={spec}
            imageUrl={imageUrl}
            format={format}
            ready={ready}
            onReady={() => setReady(true)}
            full
          />
          <p className="text-sm mt-4 leading-relaxed text-center" style={{ color: 'var(--color-text-2)' }}>
            Your browser won’t save the image for us. Press and hold the card above,
            then choose <strong style={{ color: 'var(--color-text)' }}>Save to Photos</strong>.
            {isIosSafari() ? ' Then open Instagram and add it to your story.' : ''}
          </p>
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" onClick={onCopy} icon="link">Copy link instead</Button>
        </SheetFooter>
      </Sheet>
    )
  }

  // ── It went ───────────────────────────────────────────────────────────────
  if (step.kind === 'shared') {
    return (
      <Sheet onClose={close} label="Shared">
        <SheetHeader
          eyebrow={comp ? 'One step left' : 'Done'}
          title={comp ? 'Nearly entered' : 'That’s away'}
        />
        <SheetBody>
          <Confirmation message={step.message} />

          {comp ? (
            <ShareEntryPanel
              prize={comp.prize}
              test={comp.test}
              link={link}
              format={format}
              onDone={close}
            />
          ) : (
            <p className="text-sm leading-relaxed text-center" style={{ color: 'var(--color-text-2)' }}>
              Thanks for sharing it. Anyone who opens your link lands on your stack
              with one thing to do next — take the quiz.
            </p>
          )}
        </SheetBody>
        <SheetFooter>
          <Button
            variant="ghost"
            onClick={() => { setStep({ kind: 'compose' }); setReady(false) }}
          >
            Share another
          </Button>
          <Button variant="secondary" onClick={close}>Done</Button>
        </SheetFooter>
      </Sheet>
    )
  }

  // ── Compose ───────────────────────────────────────────────────────────────
  return (
    <Sheet onClose={close} label="Share your stack">
      <SheetHeader
        eyebrow={comp && format === 'entry' ? 'Giveaway card' : 'Your card'}
        title="Share your stack"
      />

      <SheetBody className="flex flex-col items-center">
        <CardFrame
          spec={spec}
          imageUrl={imageUrl}
          format={format}
          ready={ready}
          onReady={() => setReady(true)}
        />

        {offered.length > 1 && (
          <FormatTabs
            offered={offered}
            format={format}
            onPick={pickFormat}
            label={FORMAT_LABEL}
            className="mt-4"
          />
        )}

        <p
          className="text-xs mt-3 leading-snug text-center max-w-[17rem]"
          style={{ color: 'var(--color-text-2)' }}
        >
          {FORMAT_NOTE[format]}
        </p>

        {/* The one line on this sheet that is not about sharing. A card is a
            public URL with no expiry, and this is where somebody finds out what
            is on it before they post it — so it is short enough to actually be
            read rather than thorough enough to be skipped. */}
        <p
          className="text-[11px] mt-1.5 leading-relaxed text-center"
          style={{ color: 'var(--color-muted)' }}
        >
          Never shows your price or your health answers.
        </p>

        {notice && (
          <p className="text-xs mt-3 text-center" style={{ color: '#f87171' }} role="alert">
            {notice}
          </p>
        )}
      </SheetBody>

      <SheetFooter className="flex-col">
        <Button
          variant="primary"
          size="lg"
          icon={action.icon}
          onClick={onShare}
          loading={busy}
          fullWidth
        >
          {busy ? 'Getting it ready…' : action.label}
        </Button>

        <p
          className="text-[11px] leading-relaxed text-center w-full"
          style={{ color: 'var(--color-muted)' }}
        >
          {action.note}
        </p>

        <button
          type="button"
          onClick={onCopy}
          className="text-xs underline underline-offset-2 py-1"
          style={{ color: 'var(--color-muted)' }}
        >
          Copy the link instead
        </button>
      </SheetFooter>
    </Sheet>
  )
}

/**
 * The card, framed.
 *
 * Sized against the viewport rather than a fixed width so it takes whatever the
 * sheet's header and footer leave it — on a tall phone that is a noticeably
 * bigger card, and on a short one it shrinks instead of pushing the button off
 * the bottom. `full` is the manual rung, where the image is the thing being
 * saved rather than a preview of it.
 */
function CardFrame({ spec, imageUrl, format, ready, onReady, full = false }: {
  spec: { width: number; height: number }
  imageUrl: string
  format: ShareFormat
  ready: boolean
  onReady: () => void
  full?: boolean
}) {
  const portrait = spec.height > spec.width
  return (
    <div
      className="relative rounded-2xl overflow-hidden shrink-0"
      style={{
        aspectRatio: `${spec.width} / ${spec.height}`,
        maxHeight: full ? undefined : portrait ? '40dvh' : '28dvh',
        width: full ? '100%' : 'auto',
        maxWidth: '100%',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.09)',
        // Lifts the card off the sheet so it reads as an object on a surface
        // rather than a panel in a form.
        boxShadow: '0 18px 48px -22px rgba(0,0,0,0.9)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={imageUrl}
        src={imageUrl}
        alt={`Your CHRGD stack, ${FORMAT_LABEL[format]} card`}
        onLoad={onReady}
        className="w-full h-full object-cover"
        style={{ opacity: ready ? 1 : 0, transition: 'opacity 240ms' }}
      />
      {!ready && <CardBuilding />}
    </div>
  )
}

/** The tick and the line that says what just happened. */
function Confirmation({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center text-center mb-5">
      <div
        className="flex items-center justify-center rounded-full mb-3"
        style={{
          width: 52,
          height: 52,
          background: 'rgba(0,212,255,0.12)',
          border: '1px solid rgba(0,212,255,0.35)',
          color: '#00D4FF',
        }}
      >
        <Icon name="check" size={24} />
      </div>
      <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }} role="status">
        {message}
      </p>
    </div>
  )
}
