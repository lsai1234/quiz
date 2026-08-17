'use client'

import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { prizeInline } from '@/lib/competition/prize'

/**
 * What entering the giveaway looks like once the card has been shared.
 *
 * ── There is nothing to fill in, and that is the point ──────────────────────
 * This has been three things. First an accordion under the share buttons,
 * folded away behind "Entering the giveaway? Win £200" — the conversion-critical
 * step of the whole promotion, below the fold, phrased as a question. Then a
 * handle field on the step after a share, which was better but still asked
 * somebody who had *just posted to their story* to come back to a website and
 * type their own name into a box.
 *
 * Now it asks for nothing. The winner is drawn from the accounts that tagged us,
 * read off our own Instagram mentions — so the tag is the entry, and the only
 * useful thing this screen can do is confirm what the entry actually was.
 *
 * ── Which makes it information, not a form ──────────────────────────────────
 * The three conditions are listed because they are the promotion's significant
 * conditions and because somebody who missed one should be able to go back and
 * fix it while the post is still up. A ticked list is the shortest honest way to
 * say "here is what counts".
 */

const ACCENT = '#00D4FF'

export function EnteredPanel({ prize, test, steps }: {
  prize: string
  test: boolean
  /**
   * The campaign's own entry conditions. Read from config rather than written
   * here, so this screen and the card can never disagree about what enters
   * somebody — and so changing the wording is one edit in Founders Hub.
   */
  steps: string[]
}) {
  return (
    <div>
      {test && (
        <p className="text-[10px] font-bold mb-3 text-center tracking-wide" style={{ color: '#fbbf24' }}>
          TEST RUN — A REHEARSAL, NOT A LIVE PROMOTION
        </p>
      )}

      <p className="text-sm leading-relaxed text-center mb-4" style={{ color: 'var(--color-text-2)' }}>
        {test ? (
          'Nothing else to do — this is a rehearsal, so no real draw is running.'
        ) : (
          <>
            Nothing else to do. We draw a winner from everyone who tagged us, so
            {steps.length > 0 ? ' make sure these are all true and' : ''} you’re in
            for <strong style={{ color: 'var(--color-text)' }}>{prizeInline(prize)}</strong>.
          </>
        )}
      </p>

      <ul className="flex flex-col gap-2.5">
        {steps.map((step) => (
          <li key={step} className="flex items-start gap-2.5">
            <span
              className="flex items-center justify-center rounded-full shrink-0 mt-0.5"
              style={{
                width: 22,
                height: 22,
                background: 'rgba(0,212,255,0.12)',
                border: `1px solid ${ACCENT}52`,
                color: ACCENT,
              }}
            >
              <Icon name="check" size={13} />
            </span>
            <span className="text-sm font-semibold min-w-0" style={{ color: 'var(--color-text)' }}>
              {step}
            </span>
          </li>
        ))}
      </ul>

      {steps.length > 0 && (
        <p className="text-[11px] mt-3.5 leading-snug text-center" style={{ color: 'var(--color-muted)' }}>
          The tag is what enters you — without it we can’t find your post.
        </p>
      )}

      <p className="text-[10px] mt-3 leading-relaxed text-center" style={{ color: 'var(--color-muted)' }}>
        No purchase necessary. Entering by sharing and entering for free are treated the
        same.{' '}
        <Link
          href="/legal/competition"
          target="_blank"
          className="underline"
          style={{ color: 'var(--color-muted)' }}
        >
          Full terms and the free entry route
        </Link>
        .
      </p>
    </div>
  )
}
