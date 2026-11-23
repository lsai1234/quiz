'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { buttonSurface } from '@/components/system'
import { HubSignedOut } from '@/components/hub/HubSignedOut'
import { HubShell } from '@/components/hub/HubShell'
import { HubSkeleton } from '@/components/hub/HubSkeleton'
import { useHubStore } from '@/lib/hub-store'
import { TRAINER_COPY as C } from '@/lib/trainer/copy'
import { TrainerChat } from './TrainerChat'

/** /myhub/trainer: ask the trainer, signed in; the hub's own sign-in otherwise. */
export function TrainerPage() {
  const session = useHubStore((s) => s.session)
  const hydrated = useHubStore((s) => s.hydrated)
  const hydrate = useHubStore((s) => s.hydrate)
  const logout = useHubStore((s) => s.logout)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  if (!hydrated) {
    return (
      <HubShell>
        <HubSkeleton />
      </HubShell>
    )
  }
  if (!session) return <HubSignedOut />

  const back = buttonSurface('ghost', 'sm')
  return (
    <HubShell onSignOut={logout} nav="trainer">
      <div className="hub-back-top" style={{ marginBottom: 'var(--space-4)' }}>
        <Link href="/myhub" className={back.className} style={back.style} data-back-hub>
          ← {C.backToHub}
        </Link>
      </div>
      <TrainerChat />
    </HubShell>
  )
}
