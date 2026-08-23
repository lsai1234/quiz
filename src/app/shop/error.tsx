'use client'

import { SurfaceError } from '@/components/monitoring/SurfaceError'

/** The shop's boundary — a crash here is a basket abandoned mid-purchase. */
export default function ShopError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return <SurfaceError error={error} retry={unstable_retry} what="the shop" />
}
