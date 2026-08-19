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
import { EnteredPanel } from './CompetitionEntry'

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
 *   2. **Entered.** Sharing succeeded. While a draw is on, this confirms what
 *      the entry actually was and nothing more — see below.
 *   3. **Manual.** The bottom rung, when the browser will not save for us.
 *
 * ── Nobody types anything ───────────────────────────────────────────────────
 * There was a handle field here, and before that an accordion. Both existed to
 * build an entrant list this site owned. It does not need one: the winner is
 * drawn from the accounts that tagged us, which the founder reads off their own
 * mentions and pastes into Founders Hub. The tag *is* the entry.
 *
 * That deletes the worst step in the flow — the one where somebody who has just
 * posted to their story has to come back to a website and type their own handle
 * into a box. What replaces it is a confirmation of the three things that count,
 * which is information rather than work.
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

interface Live { state: string; prize: string; test: boolean; entrySteps?: string[] }

export function ShareSheet({ payload, onClose }: { payload: ShareCardPayload; onClose: () => void }) {
  const [format, setFormat] = useState<ShareFormat>('story')
  const [step, setStep] = useState<Step>({ kind: 'compose' })
  const [busy, setBusy] = useState(false)
  /** Something went wrong but the step did not change — shown in place. */
  const [notice, setNotice] = useState<string | null>(null)
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
    /* No `live` flag here, deliberately.
       Pairing a one-shot ref guard with a cleanup that cancels the result is a
       contradiction: Strict Mode runs the effect, cleans it up, and runs it
       again, so the first call's cleanup cancelled the only mint the guard
       would ever allow. The short link came back and was thrown away, and every
       share in development handed over the ~2,600-character fallback URL with
       the whole stack in its query string. React 18+ does not warn about a
       setState on an unmounted component, so landing it unconditionally is
       both simpler and correct. */
    mintShareUrl(payload).then(({ url }) => setLink(url))
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
          <CardFrame key={imageUrl} spec={spec} imageUrl={imageUrl} format={format} full />
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
          eyebrow={comp ? 'Entered' : 'Done'}
          title={comp ? 'You’re in' : 'That’s away'}
        />
        <SheetBody>
          <Confirmation message={step.message} />

          {comp ? (
            <EnteredPanel prize={comp.prize} test={comp.test} steps={comp.entrySteps ?? []} />
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
            onClick={() => setStep({ kind: 'compose' })}
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
        <CardFrame key={imageUrl} spec={spec} imageUrl={imageUrl} format={format} />

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
 * The beat the skeleton is held for before the card is allowed to replace it.
 *
 * The reveal page preloads this exact image into the browser cache — that is
 * most of why the sheet feels fast — so on the common path the card is *there*
 * when the sheet opens and the skeleton would otherwise flash for two frames and
 * vanish. A build that flickers reads as a glitch; the same wait, held long
 * enough to be a wait and then resolved deliberately, reads as a poster being
 * printed. This is the smallest hold that reads as the latter.
 *
 * Not applied on the manual rung: there the image is the thing being saved and
 * somebody is already one failed share deep, so it appears as soon as it can.
 */
const MIN_BUILD_MS = 420

/** How long the reveal runs. Matches `card-settle` / `card-scan` in globals.css. */
const REVEAL_MS = 620

/** How long the skeleton takes to fade under the card. Matches its transition. */
const SKELETON_OUT_MS = 220

type Phase = 'building' | 'revealing' | 'shown'

/**
 * The card, framed.
 *
 * Sized against the viewport rather than a fixed width so it takes whatever the
 * sheet's header and footer leave it — on a tall phone that is a noticeably
 * bigger card, and on a short one it shrinks instead of pushing the button off
 * the bottom. `full` is the manual rung, where the image is the thing being
 * saved rather than a preview of it.
 *
 * ── Why the arrival is staged ───────────────────────────────────────────────
 * The card used to cross-fade in over 240ms, which on a cached image is
 * indistinguishable from it popping into place — the skeleton, the sheen and the
 * whole "a poster is being made" idea went past too fast to register, and what
 * was left was a wait with nothing at the end of it. This is the one moment in
 * the flow where somebody finds out that what they are being asked to share is a
 * designed thing, so the arrival is an event: the skeleton fades, the card
 * settles in from a hair over size, and a light passes down it once. It is
 * roughly a second in total and it is the reason to stay.
 *
 * The phases are held here rather than in the parent because only this component
 * knows when the image landed, and the parent has no use for the answer.
 * Remounted per format by its `key`, so switching tabs prints the new card
 * rather than swapping the picture inside the old one.
 */
function CardFrame({ spec, imageUrl, format, full = false }: {
  spec: { width: number; height: number }
  imageUrl: string
  format: ShareFormat
  full?: boolean
}) {
  const portrait = spec.height > spec.width
  const [phase, setPhase] = useState<Phase>('building')
  /** Kept a beat past the start of the reveal, then dropped: a transparent
   *  overlay left sitting on the card is a thing to forget to remove. */
  const [skeleton, setSkeleton] = useState(true)
  const img = useRef<HTMLImageElement>(null)
  const mountedAt = useRef(Date.now())
  const landed = useRef(false)
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])

  useEffect(() => {
    const running = timers.current
    return () => {
      running.forEach(clearTimeout)
      running.length = 0
      /* And the guard goes with them.
         Strict Mode mounts, cleans up and mounts again on the same instance, so
         a `landed` ref that survived this cleanup would describe a load whose
         timers had just been cancelled: the card sat at zero opacity under a
         skeleton that never stopped building, on exactly the cached path this
         is here to serve. Same trap as the mint effect above — a one-shot ref
         guard paired with a cleanup that cancels its result is a contradiction,
         and here the fix is for the cleanup to undo both halves. */
      landed.current = false
    }
  }, [])

  const onLoad = useCallback(() => {
    // Guarded by a ref rather than by `phase`: the two ways in below can both
    // arrive, and a second run would restart the reveal on a card already
    // showing.
    if (landed.current) return
    landed.current = true

    const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)) }
    const held = Date.now() - mountedAt.current
    later(() => {
      setPhase('revealing')
      later(() => setSkeleton(false), SKELETON_OUT_MS)
      later(() => setPhase('shown'), REVEAL_MS)
    }, full ? 0 : Math.max(0, MIN_BUILD_MS - held))
  }, [full])

  /**
   * The other way in, and the one that matters.
   *
   * `load` does not fire for an image the browser already has: it is dispatched
   * as the element's source resolves, which for a cached hit is before React has
   * finished attaching the handler. And this image is cached on the common path
   * *by design* — the tile on the reveal page pulls exactly this URL so the sheet
   * opens with the card already there. So the sheet's own fast path was the one
   * that could leave it building forever, with a skeleton over a card that had
   * arrived: the picture never faded in because nothing ever said it had landed.
   *
   * Asking the element on mount is the fix. `naturalWidth` as well as `complete`
   * because `complete` is also true for an image that failed.
   */
  useEffect(() => {
    const el = img.current
    if (el?.complete && el.naturalWidth > 0) onLoad()
  }, [onLoad])

  return (
    <div
      className="relative rounded-2xl overflow-hidden shrink-0"
      style={{
        aspectRatio: `${spec.width} / ${spec.height}`,
        // A *definite* height, not a ceiling. `max-height` with an auto height
        // left the box to be sized by its contents, and its only in-flow content
        // is an image that is `h-full` of it — so until that image loaded the
        // frame was two pixels tall, the skeleton was drawn inside two pixels,
        // and the card's arrival shoved the whole sheet down the screen. The
        // comment above about the preview not jumping was describing an
        // intention. With the height stated, the aspect ratio gives the width
        // and the frame is the card's shape from the first frame.
        height: full ? undefined : portrait ? '40dvh' : '28dvh',
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
        ref={img}
        src={imageUrl}
        alt={`Your CHRGD stack, ${FORMAT_LABEL[format]} card`}
        onLoad={onLoad}
        className={`w-full h-full object-cover${phase === 'revealing' ? ' card-reveal' : ''}`}
        style={{ opacity: phase === 'building' ? 0 : 1, transition: 'opacity 260ms' }}
      />

      {/* The skeleton stays mounted for the first breath of the reveal and fades
          under the card, so the two are one movement rather than a swap. */}
      {skeleton && (
        <div
          className="absolute inset-0"
          style={{
            opacity: phase === 'revealing' ? 0 : 1,
            transition: 'opacity 200ms',
            pointerEvents: 'none',
          }}
        >
          <CardBuilding complete={phase === 'revealing'} />
        </div>
      )}

      {/* The pass of light that says the card is finished, rather than that it
          is still coming. Drawn over the card, once, and then gone. */}
      {phase === 'revealing' && (
        <div
          aria-hidden="true"
          className="card-scan absolute inset-x-0"
          style={{
            height: '18%',
            backgroundImage:
              'linear-gradient(to bottom, transparent 0%, rgba(0,212,255,0.22) 42%, rgba(255,255,255,0.34) 52%, rgba(0,212,255,0.18) 62%, transparent 100%)',
          }}
        />
      )}
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
