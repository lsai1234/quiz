'use client'

import { SurfaceError } from '@/components/monitoring/SurfaceError'

/**
 * My Hub's boundary — a crash here reaches a paying member trying to manage a
 * subscription, which is the population least able to shrug and come back later.
 */
export default function MyHubError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return <SurfaceError error={error} retry={unstable_retry} what="your hub" />
}
