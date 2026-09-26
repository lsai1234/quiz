'use client'

import Link from 'next/link'
import type { ConsultExclusions } from '@/lib/consult/exclusions'

/**
 * What a stack from the Amp Consult brings onto this page (builds H9, H10).
 *
 *   - The pharmacist note, when the circuit check involved a medicine. It
 *     travels with the stack rather than staying behind on the consult.
 *   - "Change my answers", which reopens the consult's review with everything
 *     filled in and hands back an updated stack.
 *
 * Styled in this page's own palette: it is part of the results page, not the
 * consult.
 */
export function ConsultNote({ exclusions }: { exclusions: ConsultExclusions }) {
  return (
    <div className="mx-5 max-w-lg lg:mx-auto mt-5 flex flex-col gap-3">
      {exclusions.pharmacistNote && (
        <div
          role="note"
          className="rounded-2xl border px-4 py-3"
          style={{ borderColor: 'var(--color-border-2)', background: 'var(--color-surface)' }}
        >
          <p className="text-xs font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            Check with a pharmacist first
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            You told us you take prescription medicine, so we’ve kept out anything known to interact with it — here and
            in the extras below. Please check this stack with your pharmacist before you start.
          </p>
        </div>
      )}
      <Link
        href="/quizv2?review=1"
        className="self-start text-xs underline underline-offset-4"
        style={{ color: 'var(--color-muted)' }}
      >
        Change my answers
      </Link>
    </div>
  )
}
