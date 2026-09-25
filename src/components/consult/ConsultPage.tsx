'use client'

import { useRouter } from 'next/navigation'
import { AmpConsult } from './AmpConsult'

/** `/consult`: the consult, with Back on the first scene returning home. */
export function ConsultPage() {
  const router = useRouter()
  return <AmpConsult onExit={() => router.push('/')} />
}
