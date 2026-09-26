'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { AmpConsult } from './AmpConsult'

/**
 * `/quizv2` (founders only): the consult, with Back on the first scene returning home. The
 * handoff opens the results reveal on `/` — `/#stack` is how anything outside
 * that page points at it, and the store already holds the stack.
 *
 * `?review=1` is "Change my answers" from the results page (H10): the last
 * finished consult reopens on its review screen.
 */
export function ConsultPage() {
  const router = useRouter()
  const reopen = useSearchParams().get('review') === '1'
  return (
    <AmpConsult
      reopen={reopen}
      onExit={() => router.push('/')}
      onHandoff={() => router.push('/#stack')}
    />
  )
}
