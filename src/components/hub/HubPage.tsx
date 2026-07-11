'use client'

import { useEffect } from 'react'
import { useHubStore } from '@/lib/hub-store'
import { HubLogin } from './HubLogin'
import { SubscriptionDashboard } from './SubscriptionDashboard'

export function HubPage() {
  const session = useHubStore((s) => s.session)
  const hydrated = useHubStore((s) => s.hydrated)
  const providers = useHubStore((s) => s.providers)
  const hydrate = useHubStore((s) => s.hydrate)
  const authenticate = useHubStore((s) => s.authenticate)

  // Restore the cookie session on load (also lands the OAuth redirect back).
  useEffect(() => {
    void hydrate()
  }, [hydrate])

  if (!session) {
    return <HubLogin onAuthenticate={authenticate} loading={!hydrated} providers={providers} />
  }

  return <SubscriptionDashboard />
}
