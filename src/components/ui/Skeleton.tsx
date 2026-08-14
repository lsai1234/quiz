import { GLASS } from '@/lib/ui/tokens'

/**
 * A placeholder block.
 *
 * The hub needs these because `HubPage` renders the *login screen* while the
 * session is still hydrating — so a signed-in member sees "Sign in to manage
 * your stack" flash on every single load. The shop already solved this
 * (`ShopShell`'s `LoadingSkeleton`): mirror the loaded layout at matching
 * heights so the swap doesn't shift the page.
 *
 * The shimmer is one shared animation, and it stops under reduced motion — a
 * pulsing rectangle is exactly the kind of thing that triggers people.
 */
export function Skeleton({
  width,
  height,
  radius = 12,
  className,
}: {
  width?: number | string
  height?: number | string
  radius?: number
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={`skeleton-shimmer ${className ?? ''}`}
      style={{ width, height, borderRadius: radius, background: GLASS.raised }}
    />
  )
}

/** Several lines of placeholder text, the last one short like a real paragraph. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={10} radius={6} width={i === lines - 1 ? '62%' : '100%'} />
      ))}
    </div>
  )
}
