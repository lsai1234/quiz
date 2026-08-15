'use client'

import { useEffect } from 'react'
import { useHubStore } from '@/lib/hub-store'
import { HubLogin } from './HubLogin'
import { HubShell } from './HubShell'
import { HubSkeleton } from './HubSkeleton'
import { SubscriptionDashboard } from './SubscriptionDashboard'

export function HubPage() {
  const session = useHubStore((s) => s.session)
  const hydrated = useHubStore((s) => s.hydrated)
  const providers = useHubStore((s) => s.providers)
  const canResetPassword = useHubStore((s) => s.canResetPassword)
  const hydrate = useHubStore((s) => s.hydrate)
  const authenticate = useHubStore((s) => s.authenticate)
  const logout = useHubStore((s) => s.logout)

  // Restore the cookie session on load (also lands the OAuth redirect back).
  useEffect(() => {
    void hydrate()
  }, [hydrate])

  /**
   * "No session yet" and "signed out" are not the same thing, and this used to
   * treat them as one: `!session` rendered the login screen, including for the
   * whole hydration round-trip, so a signed-in member watched "Sign in to manage
   * your stack" flash past on every load. Wait for the answer before claiming to
   * know it.
   */
  if (!hydrated) {
    return (
      <HubShell>
        <HubSkeleton />
      </HubShell>
    )
  }

  if (!session) {
    return (
      <HubLogin
        onAuthenticate={authenticate}
        providers={providers}
        canResetPassword={canResetPassword}
      />
    )
  }

  return (
    <HubShell onSignOut={logout}>
      <SubscriptionDashboard />
    </HubShell>
  )
}
