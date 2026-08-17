'use client'

import { useEffect, useState } from 'react'
import { prizeChip, closesLabel } from '@/lib/competition/prize'

/**
 * The Share button on the reveal page, and the competition attached to it.
 *
 * ── What this is balancing ──────────────────────────────────────────────────
 * The reveal page's job is checkout. Sharing is the second job and the
 * competition is the third, and a giveaway shouted loudly enough on this screen
 * is a giveaway that reads as the reason to be here — somebody who came to buy a
 * stack leaves having entered a draw instead. That is the failure mode this is
 * designed around, so the competition is attached to the action it belongs to
 * rather than given a block of its own:
 *
 *   • The button keeps its secondary styling. The filled CTA on this page is the
 *     checkout bar and it stays the only filled thing.
 *   • The prize is a chip *inside* the existing button, so it costs no vertical
 *     space above the fold and cannot be read before "Share your stack".
 *   • One quiet line underneath carries the conditions, at the same size as the
 *     page's other small print rather than below it — they are the promotion's
 *     significant terms, not a footnote. No banner, no modal,
 *     no interstitial — nothing that has to be dismissed on the way to paying.
 *   • With the competition off, which is the default, this renders exactly the
 *     button that was here before. There is no state in which an inactive draw
 *     costs a sale.
 *
 * ── The state is read live ──────────────────────────────────────────────────
 * Same rule as the card itself (`docs/SHARE_CARD_BLUEPRINT.md` §3.7): a screen
 * that decided at build time keeps advertising a draw that has closed. So it is
 * fetched, and the button simply has no chip until the answer arrives — which is
 * the correct thing to show while we do not know.
 */

interface Live {
  state: string
  prize: string
  test: boolean
  closesAt: string | null
}

export function ShareStackButton({ onOpen }: { onOpen: () => void }) {
  const [comp, setComp] = useState<Live | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/competition/enter')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Live | null) => { if (live && d?.state === 'open') setComp(d) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  const closes = comp ? closesLabel(comp.closesAt) : ''

  return (
    <div className="px-5 max-w-lg mx-auto -mt-2 mb-5">
      <button
        type="button"
        onClick={onOpen}
        className="w-full py-3 rounded-2xl text-sm font-bold tracking-tight flex items-center justify-center gap-2"
        style={{
          fontFamily: 'var(--font-display)',
          background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
          color: 'var(--color-accent)',
        }}
      >
        Share your stack
        {comp ? (
          <span
            className="text-[10px] font-bold tracking-[.12em] uppercase px-2 py-0.5 rounded-full"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              background: 'color-mix(in srgb, var(--color-accent) 22%, transparent)',
              color: 'var(--color-accent)',
            }}
          >
            {comp.test ? 'Test draw' : prizeChip(comp.prize)}
          </span>
        ) : null}
      </button>

      {comp ? (
        <p className="text-xs leading-relaxed mt-2 text-center" style={{ color: 'var(--color-muted)' }}>
          {comp.test ? (
            'Test run — sharing won’t enter you into a real draw.'
          ) : (
            <>
              Share it to your story to enter{closes ? ` · ${closes}` : ''} ·{' '}
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
      ) : null}
    </div>
  )
}
