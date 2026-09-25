'use client'

import { useRouter } from 'next/navigation'
import { AmpConsult } from './AmpConsult'

/**
 * `/consult`: the consult, with Back on the first scene returning home. The
 * handoff opens the results reveal on `/` — `/#stack` is how anything outside
 * that page points at it, and the store already holds the stack.
 */
export function ConsultPage() {
  const router = useRouter()
  return <AmpConsult onExit={() => router.push('/')} onHandoff={() => router.push('/#stack')} />
}
