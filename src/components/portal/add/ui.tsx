'use client'

import Link from 'next/link'
import { useId, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/system'

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

/**
 * A section that folds away but keeps what is inside it running.
 *
 * Not the `Disclosure` primitive, on purpose: that one unmounts its children
 * when it closes, and the thing folded here is the index crawl — a run of
 * several minutes whose loop lives in the component. Closing a Disclosure over
 * it would orphan the loop (still asking PowerBody, with nobody to report to)
 * and reopening it would offer to start a second crawl beside the first. So the
 * children stay mounted and are hidden with the `hidden` attribute, and while
 * something inside is `busy` the section will not fold at all.
 *
 * The toggle is the system Button, with the same `aria-expanded` /
 * `aria-controls` wiring Disclosure has.
 */
export function Collapsible({
  title,
  badge,
  lede,
  open,
  onOpenChange,
  busy = false,
  children,
}: {
  title: ReactNode
  badge?: ReactNode
  lede?: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  busy?: boolean
  children: ReactNode
}) {
  const panelId = useId()
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
      <div>
        <Row>
          <SectionTitle id={headingId}>{title}</SectionTitle>
          {badge}
          <Button
            size="sm"
            variant="ghost"
            iconRight="chevron-down"
            aria-expanded={open}
            aria-controls={panelId}
            disabled={open && busy}
            title={open && busy ? 'It cannot be folded away while it is running.' : undefined}
            onClick={() => onOpenChange(!open)}
          >
            {open ? 'Hide' : 'Show'}
          </Button>
        </Row>
        {lede && <Lede>{lede}</Lede>}
      </div>
      <div id={panelId} hidden={!open}>
        {children}
      </div>
    </section>
  )
}
