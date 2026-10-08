'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { prizeInline } from '@/lib/competition/prize'
import { COMPETITION_EVENT, hasPendingShare, rememberedEntry, type RememberedEntry } from '@/lib/competition/client'

/**
 * What the share sheet says once the card has gone, while a giveaway is open.
 *
 * ── The share is the bonus, not the entry ───────────────────────────────────
 * Entering is an email at the foot of the results page; sharing the card adds
 * ten more tickets to it. So this confirms one of two things: the bonus landed
 * on an entry that exists, or it is being held until they enter — in which case
 * the one useful instruction is where the email box is.
 *
 * It reads the entry from `lib/competition/client`, which the sheet has just
 * written to, and listens so the count updates the moment the bonus is
 * credited rather than on the next render.
 */

const ACCENT = '#00D4FF'

export function EnteredPanel({ campaign, prize, test, bonus }: {
  campaign: string
  prize: string
  test: boolean
  /** Tickets a share is worth, from the server. */
  bonus: number
}) {
  const [entry, setEntry] = useState<RememberedEntry | null>(null)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    const sync = () => {
      setEntry(rememberedEntry(campaign))
      setHeld(hasPendingShare(campaign))
    }
    sync()
    window.addEventListener(COMPETITION_EVENT, sync)
    return () => window.removeEventListener(COMPETITION_EVENT, sync)
  }, [campaign])

  const lines = entry
    ? [`Entered as ${entry.email}`, `${bonus} bonus entries for sharing`, // Optimistic while the bonus request is in flight — it lands a beat later.
      `${entry.shared ? entry.tickets : entry.tickets + bonus} entries in the draw`]
    : ['Card shared', `${bonus} bonus entries saved for you`]

  return (
    <div>
      {test && (
        <p className="text-[10px] font-bold mb-3 text-center tracking-wide" style={{ color: '#fbbf24' }}>
          TEST RUN — A REHEARSAL, NOT A LIVE PROMOTION
        </p>
      )}

      <p className="text-sm leading-relaxed text-center mb-4" style={{ color: 'var(--color-text-2)' }}>
        {entry ? (
          <>
            Post it to your story and you’re all set for{' '}
            <strong style={{ color: 'var(--color-text)' }}>{prizeInline(prize)}</strong>.
          </>
        ) : (
          <>
            One more step: close this and add your email under{' '}
            <strong style={{ color: 'var(--color-text)' }}>Enter the competition</strong> at the
            bottom of your results.{held ? ' Your bonus entries are added as soon as you do.' : ''}
          </>
        )}
      </p>

      <ul className="flex flex-col gap-2.5">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-2.5">
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
              {line}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[10px] mt-3 leading-relaxed text-center" style={{ color: 'var(--color-muted)' }}>
        No purchase necessary.{' '}
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
