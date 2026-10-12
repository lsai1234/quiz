'use client'

import { useId, useState, type ReactNode } from 'react'
import { Badge, Button, Card } from '@/components/system'
import type { FixupSummary } from './types'

/**
 * One catalogue-wide pass, folded down to a line until it is wanted.
 *
 * ── Why not the Disclosure primitive ────────────────────────────────────────
 * `Disclosure` unmounts what it hides. That is right for a settings block and
 * wrong here: a pass that is halfway through two hundred products holds its
 * progress, its Stop button and the list of what it has changed in component
 * state, and unmounting it throws all of that away mid-run — the requests
 * already sent still land, but nothing on screen says so. So the panel stays
 * mounted from the moment the page opens (which is also what lets it report its
 * count while closed) and is hidden with the `hidden` attribute, which tells
 * assistive tech the same thing `Disclosure` does.
 *
 * And while a pass runs, the card cannot be closed: the Stop button is inside.
 */
export function FixupCard({
  id,
  title,
  does,
  summary,
  running,
  open,
  onOpenChange,
  children,
}: {
  /** Anchor for `#id` links straight to this pass. */
  id: string
  title: string
  /** One sentence: what the pass does. */
  does: string
  summary: FixupSummary | null
  running: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const panelId = useId()
  const titleId = useId()
  const count = summary?.count ?? null

  return (
    <Card as="section" padding="normal">
      <div id={id} role="region" style={{ scrollMarginTop: 'var(--space-8)' }} aria-labelledby={titleId}>
        <div className="flex items-start justify-between" style={{ gap: 'var(--space-3)' }}>
          <div className="min-w-0" style={{ display: 'grid', gap: 'var(--space-1)' }}>
            <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
              <h3
                id={titleId}
                style={{
                  fontSize: 'var(--text-body)',
                  fontWeight: 'var(--weight-display)',
                  fontFamily: 'var(--font-display)',
                  color: 'var(--ink-1)',
                }}
              >
                {title}
              </h3>
              {running ? (
                <Badge tone="info">Running</Badge>
              ) : count === null ? null : count > 0 ? (
                <Badge tone="attention">{count} to fix</Badge>
              ) : (
                <Badge tone="positive" icon="check">
                  Nothing to fix
                </Badge>
              )}
            </div>
            <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' }}>{does}</p>
            <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-2)' }}>
              {summary?.line ?? 'Counting…'}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            iconRight={open ? 'chevron-up' : 'chevron-down'}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${open ? 'Hide' : 'Open'} ${title}`}
            // Open while running, and it stays that way — see above.
            disabled={running && open}
            title={running && open ? 'Running — this stays open until it finishes or you stop it.' : undefined}
            onClick={() => onOpenChange(!open)}
          >
            {open ? 'Hide' : 'Open'}
          </Button>
        </div>

        {/* Mounted always; `hidden` when closed. */}
        <div id={panelId} hidden={!open} style={{ marginTop: 'var(--space-4)' }}>
          {children}
        </div>
      </div>
    </Card>
  )
}
