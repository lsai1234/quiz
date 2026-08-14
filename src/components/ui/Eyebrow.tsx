import type { ReactNode } from 'react'

/**
 * The small caps label above a section.
 *
 * Deliberately a component rather than a copied class string, because the point
 * of Phase 3 is to use it *less*. The hub currently prints
 * `text-[10px] font-bold tracking-widest uppercase` more than twenty times,
 * including above single-sentence blocks — so nothing is emphasised, because
 * everything is. It belongs above a genuine section head and nowhere else.
 */
export function Eyebrow({
  children,
  color = 'var(--color-muted)',
  className,
}: {
  children: ReactNode
  color?: string
  className?: string
}) {
  return (
    <p
      className={`text-[10px] font-bold tracking-widest uppercase ${className ?? ''}`}
      style={{ color, fontFamily: 'var(--font-display)' }}
    >
      {children}
    </p>
  )
}
