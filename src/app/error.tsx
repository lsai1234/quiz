'use client'

import { SurfaceError } from '@/components/monitoring/SurfaceError'

/**
 * The boundary for the quiz and everything else under the root segment.
 *
 * Next 16 hands the boundary `unstable_retry` — which re-fetches *and*
 * re-renders — alongside the older `reset`, which only clears the error state.
 * `unstable_retry` is the one worth wiring to a button: a crash here is very
 * often a Server Component that failed on a bad response, and `reset` cannot
 * recover from that because it never re-fetches. See
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
 */
export default function QuizError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return <SurfaceError error={error} retry={unstable_retry} what="this page" />
}
