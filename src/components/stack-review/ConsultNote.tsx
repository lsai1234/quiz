'use client'

import Link from 'next/link'
import { pharmacistNoteFor, type ConsultExclusions } from '@/lib/consult/exclusions'
import { PHARMACIST_NOTE_TITLE, pharmacistNoteText } from '@/lib/consult/pharmacist-note'
import { CHANGE_ANSWERS_HASH } from '@/lib/consult/results-tab'
import { useQuizArmState } from '@/lib/experiments/client'

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
  const { heroOffer } = useQuizArmState()
  return (
    <div className="mx-5 max-w-lg lg:mx-auto mt-5 flex flex-col gap-3">
      {exclusions.pharmacistNote && (
        <div
          role="note"
          className="rounded-2xl border px-4 py-3"
          style={{ borderColor: 'var(--color-border-2)', background: 'var(--color-surface)' }}
        >
          <p className="text-xs font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {PHARMACIST_NOTE_TITLE}
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            {pharmacistNoteText(pharmacistNoteFor(exclusions.excluded))}
          </p>
        </div>
      )}
      {/*
        Where the consult lives for this visitor. A customer reached these
        results from the consult on the home page, so it reopens there. While
        the rollout is off the home page never offers it, and the only people
        with a consult's results are founders, from the gated /quizv2.
      */}
      {heroOffer === 'quiz-only' ? (
        <Link href="/quizv2?review=1" className="self-start text-xs underline underline-offset-4" style={{ color: 'var(--color-muted)' }}>
          Change my answers
        </Link>
      ) : (
        <a href={CHANGE_ANSWERS_HASH} className="self-start text-xs underline underline-offset-4" style={{ color: 'var(--color-muted)' }}>
          Change my answers
        </a>
      )}
    </div>
  )
}
