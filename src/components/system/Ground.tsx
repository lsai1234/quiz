import type { ReactNode } from 'react'

/**
 * The layered background the glass refracts.
 *
 * This component is load-bearing, not decoration. `backdrop-filter: blur()` over
 * a flat colour produces grey haze — there is nothing behind the surface to
 * bend, so a "glass" card reads as a slightly lighter rectangle and the whole
 * effect looks like a mistake. The mesh is what makes a translucent surface
 * legible as translucent.
 *
 * Three damped radial blooms, fixed rather than scrolling: the ground is the
 * room the content moves through, not part of the content. Scrolling it would
 * make the page feel like it has a texture rather than a depth.
 *
 * Brightness is capped in the tokens at 6%, and the cap is a contrast
 * constraint rather than a taste one — every point of extra mesh raises the
 * floor under the quiet text tier, and past 6% it cannot be lifted far enough
 * to clear AA without colliding with the tier above it. `tokens.test.ts` holds
 * the line. See DESIGN.md.
 */
export function Ground({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative min-h-screen ${className ?? ''}`} style={{ background: 'var(--ground-base)' }}>
      {/* Fixed and inert. `pointer-events-none` matters: this sits over the page
          background but under the content, and without it the whole viewport
          becomes an invisible click target. */}
      <div aria-hidden className="fixed inset-0 pointer-events-none" style={{ background: 'var(--ground)' }} />
      <div className="relative">{children}</div>
    </div>
  )
}
