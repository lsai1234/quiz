'use client'

import { useState } from 'react'
import { Button, Note } from '@/components/system'

/**
 * Something in the hub didn't load, said as that, with a way to try again.
 *
 * It used to be said as something else. A failed session check showed the
 * sign-in screen to a member who was signed in; a plan that didn't load showed
 * the "no plan on this account" screen to a subscriber; the home that didn't
 * load said "pull to refresh" with nothing to press. Each is a request that
 * failed, and each now says so and offers the retry.
 */
const SAY = {
  session: 'We couldn’t reach your account just now, so we can’t tell whether you’re signed in.',
  plan: 'Your plan didn’t load just now. Nothing about it has changed.',
  hub: 'We couldn’t load your hub just now.',
} as const

export function HubLoadProblem({ what, onRetry }: { what: keyof typeof SAY; onRetry: () => Promise<unknown> | void }) {
  const [trying, setTrying] = useState(false)
  return (
    <div data-hub-load-problem={what} className="flex flex-col items-start" style={{ gap: 'var(--space-3)' }}>
      <Note tone="critical" live="assertive">
        {SAY[what]}
      </Note>
      <Button
        variant="secondary"
        size="sm"
        icon="refresh"
        loading={trying}
        onClick={async () => {
          setTrying(true)
          try {
            await onRetry()
          } finally {
            setTrying(false)
          }
        }}
      >
        Try again
      </Button>
    </div>
  )
}
