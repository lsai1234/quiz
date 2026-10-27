'use client'

import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { FREE_GIFT_TERMS_PATH, OFFER_COPY } from '@/lib/offer/copy'
import type { BonusLine } from '@/lib/offer/results'
import { titleOf } from '@/lib/offer/results'

/**
 * The free bonus, under the depth picker (plan Phase 4): that this depth comes
 * with one, or what would qualify. Its conditions are always on the next line
 * and the terms one tap away: "free" is never said on its own (CAP Code
 * 3.23–3.25).
 */
export function BonusNote({ line, minimum, firstOrderOnly, subscription, moreFor = null }: {
  line: NonNullable<BonusLine>
  minimum: number
  firstOrderOnly: boolean
  /** The subscription tab is chosen: it comes in the first box only. */
  subscription: boolean
  /** "£X more for the full stack and a free …", against "Start here". */
  moreFor?: string | null
}) {
  const headline = line.kind === 'comes-with' ? OFFER_COPY.comesWith(titleOf(line.choice.product)) : OFFER_COPY.bonusFrom(line.title, line.minimum)
  return (
    <div
      className="mt-3 rounded-xl px-3.5 py-3"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      data-bonus-note={line.kind}
    >
      <p className="flex items-center gap-2 text-[13px] font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        <span aria-hidden style={{ color: 'var(--color-accent)' }}><Icon name="sparkle" size={15} /></span>
        {headline}
      </p>
      {line.kind === 'comes-with' && (
        <p className="mt-1 text-[12px] leading-snug" style={{ color: 'var(--color-text-2)' }}>{OFFER_COPY.bonusReason}</p>
      )}
      {line.kind === 'comes-with' && moreFor && (
        <p className="mt-1 text-[12px] font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>{moreFor}</p>
      )}
      <p className="mt-1.5 text-[11px] leading-snug" style={{ color: 'var(--color-text-2)' }}>
        {OFFER_COPY.bonusConditions(minimum, firstOrderOnly)} {subscription ? `${OFFER_COPY.bonusOnSubscription} ` : ''}
        {OFFER_COPY.bonusNoCode}{' '}
        <Link href={FREE_GIFT_TERMS_PATH} className="underline underline-offset-2 font-semibold" style={{ color: 'var(--color-text)' }}>
          {OFFER_COPY.terms}
        </Link>
      </p>
    </div>
  )
}
