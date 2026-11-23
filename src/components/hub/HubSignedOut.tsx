'use client'

import { useHubStore } from '@/lib/hub-store'
import { HubLoadProblem } from './HubLoadProblem'
import { HubLogin } from './HubLogin'
import { HubShell } from './HubShell'

/**
 * What a hub page shows without a session: the sign-in screen, or, when the
 * session check itself failed, a retry.
 *
 * Every hub page used to go straight to sign-in whenever there was no session,
 * and a failed check left no session, so a member who was signed in was asked to
 * sign in again each time the account couldn't be reached.
 */
export function HubSignedOut() {
  const loadProblem = useHubStore((s) => s.loadProblem)
  const hydrate = useHubStore((s) => s.hydrate)
  const authenticate = useHubStore((s) => s.authenticate)
  const providers = useHubStore((s) => s.providers)
  const canResetPassword = useHubStore((s) => s.canResetPassword)

  if (loadProblem === 'session') {
    return (
      <HubShell>
        <div className="mx-auto max-w-2xl">
          <HubLoadProblem what="session" onRetry={hydrate} />
        </div>
      </HubShell>
    )
  }
  return <HubLogin onAuthenticate={authenticate} providers={providers} canResetPassword={canResetPassword} />
}
