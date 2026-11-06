'use client'

import { useEffect } from 'react'
import { useHubStore } from '@/lib/hub-store'
import { HubLogin } from './HubLogin'
import { HubShell } from './HubShell'
import { HubSkeleton } from './HubSkeleton'
import { NoSubscription } from './NoSubscription'
import { SubscriptionDashboard } from './SubscriptionDashboard'
import { MemberHome } from './home/MemberHome'
import { YourData } from './YourData'

export function HubPage() {
  const session = useHubStore((s) => s.session)
  const subscription = useHubStore((s) => s.subscription)
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

  /**
   * Signed in, no plan.
   *
   * `SubscriptionDashboard` renders nothing at all without a subscription, so
   * this used to be a header over an empty page — and the only reason nobody
   * saw it is that the API invented a plan for anyone who lacked one. It no
   * longer does that where real money is involved, so the state is now real and
   * needs a screen of its own.
   */
  // One member hub for everyone signed in: one-off buyers, subscribers, and
  // those whose hub has closed (`MemberHome`). The plan controls are a section
  // of it for subscribers, rendered straight away rather than after the home's
  // own request. `YourData` is on every branch: the right to a copy of your data
  // and to have it deleted does not depend on holding a live subscription.
  return (
    <HubShell onSignOut={logout} nav="home">
      <MemberHome
        name={session.name ?? null}
        plan={subscription ? <SubscriptionDashboard embedded /> : null}
        none={<NoSubscription name={session.name} email={session.email} onSignOut={logout} />}
        data={<YourData />}
      />
    </HubShell>
  )
}
