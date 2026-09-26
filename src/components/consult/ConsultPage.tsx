'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { AmpConsult } from './AmpConsult'
import { FounderPreview } from './FounderPreview'

/**
 * `/quizv2` (founders only): the consult, with Back on the first scene returning home. The
 * handoff opens the results reveal on `/` — `/#stack` is how anything outside
 * that page points at it, and the store already holds the stack.
 *
 * `?review=1` is "Change my answers" from the results page (H10): the last
 * finished consult reopens on its review screen.
 */
interface Props {
  /** The server has an OpenAI key: the founder preview runs with the AI layer on. */
  aiConfigured: boolean
  /** The animated Amp's file is in place and switched on. */
  rive: boolean
}

export function ConsultPage({ aiConfigured, rive }: Props) {
  const router = useRouter()
  const reopen = useSearchParams().get('review') === '1'
  return (
    <>
      <FounderPreview aiConfigured={aiConfigured} rive={rive} />
      <AmpConsult
        reopen={reopen}
        ai={aiConfigured}
        onExit={() => router.push('/')}
        onHandoff={() => router.push('/#stack')}
      />
    </>
  )
}
