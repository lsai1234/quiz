'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ShareCardPayload } from '@/lib/share-card/types'
import { cardImageUrl } from '@/lib/share-card/share-link'
import { prizeChip, closesLabel } from '@/lib/competition/prize'
import { Icon } from '@/components/ui/Icon'

/**
 * The way into the share flow, on the reveal page.
 *
 * ── Why it shows the card ───────────────────────────────────────────────────
 * This was a flat outline rectangle reading "Share your stack" — an ask, with no
 * visible reward, for work the person had no reason to think was worth doing.
 * Nothing on the screen said there was a designed poster behind it, so the only
 * people who found out were the ones who pressed a plain button on spec.
 *
 * It now shows the actual card. That is the whole argument for pressing it, and
 * it costs nothing extra: the thumbnail is the same image the sheet is about to
 * request, so loading it here warms the browser cache and the sheet opens with
 * the card already there instead of on a skeleton.
 *
 * ── And why the competition is a chip, not a banner ─────────────────────────
 * The reveal page's job is checkout. A giveaway shouted loudly enough here turns
 * somebody who came to buy a stack into somebody who entered a draw, so the
 * promotion is attached to the action it belongs to and never given a block of
 * its own:
 *
 *   • This stays a secondary surface. The filled CTA on the page is the checkout
 *     bar and it remains the only filled thing.
 *   • The prize is a chip inside the tile, so it cannot be read before the tile
 *     says what it is.
 *   • One quiet line carries the conditions — the promotion's significant terms,
 *     at the same size as the page's other small print rather than below it.
 *   • With the competition off, which is the default and what almost every
 *     visitor sees, none of it renders. There is no state in which an inactive
 *     draw costs a sale.
 *
 * ── The state is read live ──────────────────────────────────────────────────
 * Same rule as the card itself (`docs/SHARE_CARD_BLUEPRINT.md` §3.7): a screen
 * that decided at build time keeps advertising a draw that has closed.
 */

interface Live {
  state: string
  prize: string
  test: boolean
  closesAt: string | null
}

export function ShareStackButton({ payload, onOpen }: {
  /** Absent only where the caller has no stack yet — the tile then has no card
   *  to show and falls back to the plain button it used to be. */
  payload?: ShareCardPayload
  onOpen: () => void
}) {
  const [comp, setComp] = useState<Live | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let live = true
    fetch('/api/competition/enter')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Live | null) => { if (live && d?.state === 'open') setComp(d) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  // The card the sheet will open on, so the thumbnail is the one they get.
  const thumb = useMemo(
    () => (payload ? cardImageUrl(payload, comp ? 'entry' : 'story') : null),
    [payload, comp],
  )

  const closes = comp ? closesLabel(comp.closesAt) : ''

  return (
    <div className="px-5 max-w-lg mx-auto -mt-2 mb-5">
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center gap-3.5 p-3 rounded-2xl text-left transition-colors active:scale-[0.99]"
        style={{
          background: 'color-mix(in srgb, var(--color-accent) 9%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-accent) 28%, transparent)',
        }}
      >
        {/* The card itself, at postage-stamp size. Fixed dimensions rather than
            an aspect ratio: the tile must not resize when the image lands. */}
        <div
          className="relative shrink-0 rounded-lg overflow-hidden"
          style={{
            width: 46,
            height: 82,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 6px 18px -8px rgba(0,0,0,0.9)',
          }}
        >
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              onLoad={() => setReady(true)}
              className="w-full h-full object-cover"
              style={{ opacity: ready ? 1 : 0, transition: 'opacity 300ms' }}
            />
          )}
          {!ready && (
            <div
              className="card-build-sheen absolute inset-y-0"
              aria-hidden
              style={{
                width: '60%',
                backgroundImage:
                  'linear-gradient(100deg, transparent 0%, rgba(0,212,255,0.14) 50%, transparent 100%)',
              }}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold tracking-[0.18em] uppercase"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)' }}
            >
              Your card is ready
            </span>
            {comp && (
              <span
                className="text-[9px] font-bold tracking-[.12em] uppercase px-1.5 py-0.5 rounded-full"
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  background: 'color-mix(in srgb, var(--color-accent) 20%, transparent)',
                  color: 'var(--color-accent)',
                }}
              >
                {comp.test ? 'Test draw' : prizeChip(comp.prize)}
              </span>
            )}
          </div>

          <p
            className="text-sm font-bold tracking-tight mt-0.5"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
          >
            Share your stack
          </p>
          <p className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--color-muted)' }}>
            {comp ? 'Post it to your story to enter the giveaway' : 'A poster of your stack, built to post'}
          </p>
        </div>

        {/* Colour comes from the parent — the icon set paints with
            `currentColor` so a glyph can sit in muted text without a prop. */}
        <span className="shrink-0" style={{ color: 'var(--color-muted)' }}>
          <Icon name="chevron-right" size={18} />
        </span>
      </button>

      {comp && (
        <p className="text-xs leading-relaxed mt-2 text-center" style={{ color: 'var(--color-muted)' }}>
          {comp.test ? (
            'Test run — sharing won’t enter you into a real draw.'
          ) : (
            <>
              Follow, post the card, tag us{closes ? ` · ${closes}` : ''} ·{' '}
              {/* Opens in a new tab on purpose. The significant conditions have to
                  be reachable from the claim, and navigating away from a page
                  with a stack on it is how a basket gets abandoned. */}
              <a
                href="/legal/competition"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: 'var(--color-muted)' }}
              >
                T&amp;Cs apply
              </a>
            </>
          )}
        </p>
      )}
    </div>
  )
}
