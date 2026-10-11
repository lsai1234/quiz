import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

/**
 * The few pieces of type every section of the Add page repeats.
 *
 * Not primitives — a heading, a quiet line and an inline link are compositions
 * of tokens, not controls — but written once here so the five sections cannot
 * drift into five slightly different greys, which is how the old PowerBody tab
 * came to have three.
 */

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3
      id={id}
      style={{
        fontSize: 'var(--text-body)',
        fontWeight: 'var(--weight-display)',
        fontFamily: 'var(--font-display)',
        letterSpacing: 'var(--tracking-title)',
        color: 'var(--ink-1)',
      }}
    >
      {children}
    </h3>
  )
}

/** The sentence under a heading: what this is for, and when to use it. */
export function Lede({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
      {children}
    </p>
  )
}

export const metaText: CSSProperties = {
  fontSize: 'var(--text-meta)',
  lineHeight: 'var(--leading-loose)',
  color: 'var(--ink-3)',
}

export const bodyText: CSSProperties = {
  fontSize: 'var(--text-body-sm)',
  lineHeight: 'var(--leading-loose)',
  color: 'var(--ink-2)',
}

/** A link inside a sentence. Underlined, because colour alone is not a link. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="system-focus"
      style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '0.2em', fontWeight: 'var(--weight-strong)' }}
    >
      {children}
    </Link>
  )
}

/** A row of controls that wraps on a phone. */
export function Row({ children, gap = 'var(--space-2)', align = 'center' }: { children: ReactNode; gap?: string; align?: 'center' | 'start' | 'end' }) {
  return (
    <div className={`flex flex-wrap ${align === 'start' ? 'items-start' : align === 'end' ? 'items-end' : 'items-center'}`} style={{ gap }}>
      {children}
    </div>
  )
}

/** A vertical stack at one of the system's steps. */
export function Stack({ children, gap = 'var(--space-3)', className }: { children: ReactNode; gap?: string; className?: string }) {
  return (
    <div className={`flex flex-col ${className ?? ''}`} style={{ gap }}>
      {children}
    </div>
  )
}
