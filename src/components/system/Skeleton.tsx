import { CSSProperties } from 'react'

/**
 * A placeholder block.
 *
 * My Hub needs these because the page renders the *login screen* while the
 * session is still hydrating — so a signed-in member saw "Sign in to manage your
 * stack" flash on every single load. Mirroring the loaded layout at matching
 * heights is what stops the swap shifting the page under them.
 *
 * `aria-hidden` throughout. A skeleton is a drawing of content that has not
 * arrived; announcing it means announcing furniture. The region it fills should
 * carry the `aria-busy` instead.
 *
 * The shimmer is one shared animation and it stops under reduced motion — a
 * pulsing rectangle is exactly the kind of thing that setting exists for.
 */
export function Skeleton({
  width,
  height,
  radius = 'var(--radius-row)',
  className,
}: {
  width?: number | string
  height?: number | string
  /** A radius token. Defaults to the row radius. */
  radius?: string
  className?: string
}) {
  const style: CSSProperties = { width, height, borderRadius: radius, background: 'var(--surface-2)' }
  return <div aria-hidden className={`system-shimmer ${className ?? ''}`} style={style} />
}

/** Several lines of placeholder text, the last one short like a real paragraph. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col ${className ?? ''}`} style={{ gap: 'var(--space-2)' }} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={10} radius="var(--radius-chip)" width={i === lines - 1 ? '62%' : '100%'} />
      ))}
    </div>
  )
}
