import type { ReactNode } from 'react'

/**
 * The small-caps label above a section.
 *
 * Local to My Hub rather than a primitive, and deliberately so: this is a
 * typographic treatment, not a control. The system exports things that carry
 * behaviour — focus, disabled, busy, an accessible name — and a styled `<p>`
 * carries none of it. Promoting every piece of type to a component is how a
 * design system becomes an inventory nobody can hold in their head.
 *
 * It exists at all because the hub printed `text-[10px] font-bold
 * tracking-widest uppercase` more than twenty times, including above
 * single-sentence blocks — so nothing was emphasised, because everything was. It
 * belongs above a genuine section head and nowhere else.
 */
export function Eyebrow({
  children,
  color = 'var(--ink-3)',
  className,
}: {
  children: ReactNode
  color?: string
  className?: string
}) {
  return (
    <p
      className={className}
      style={{
        fontSize: 'var(--text-micro)',
        fontWeight: 'var(--weight-strong)',
        fontFamily: 'var(--font-display)',
        letterSpacing: 'var(--tracking-eyebrow)',
        textTransform: 'uppercase',
        color,
      }}
    >
      {children}
    </p>
  )
}
