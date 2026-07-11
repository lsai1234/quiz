'use client'

import { useEffect } from 'react'
import { useHubStore } from '@/lib/hub-store'
import { HubLogin } from './HubLogin'
import { SubscriptionDashboard } from './SubscriptionDashboard'

export function HubPage() {
  const session = useHubStore((s) => s.session)
  const hydrated = useHubStore((s) => s.hydrated)
  const googleEnabled = useHubStore((s) => s.googleEnabled)
  const hydrate = useHubStore((s) => s.hydrate)
  const authenticate = useHubStore((s) => s.authenticate)

  // Restore the cookie session on load (also lands the Google OAuth redirect).
  useEffect(() => {
    void hydrate()
  }, [hydrate])

  if (!session) {
    return <HubLogin onAuthenticate={authenticate} loading={!hydrated} googleEnabled={googleEnabled} />
  }

  return <SubscriptionDashboard />
}
