'use client'

import { useEffect } from 'react'
import './globals.css'
import { reportClientError } from '@/lib/monitoring/client'

/**
 * The last boundary — a crash in the root layout itself.
 *
 * This one replaces the root layout rather than rendering inside it, so it gets
 * no fonts, no `<Ground>`, no `PortalSync`, no `ErrorReporter`, and must supply
 * its own `<html>` and `<body>`. That is also why it imports `globals.css`
 * directly: without it the tokens this markup references do not exist and the
 * page renders as unstyled black-on-white.
 *
 * Everything here is deliberately plain. If the root layout is what broke, the
 * design system may be exactly what is broken — so this screen leans on nothing
 * but tokens and inline styles, and reaches for no primitive that could throw a
 * second time inside the boundary meant to catch the first.
 *
 * It is also the only boundary that reports at `critical`. The client sink caps
 * a browser's claim at `error` precisely because anyone can post to it — but
 * reaching here means the entire app failed to render for somebody, and it is
 * worth the founder finding out today rather than at the weekly look.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    reportClientError({
      message: error?.message || 'Root layout crashed',
      stack: error?.stack ?? null,
      severity: 'critical',
      context: { digest: error?.digest ?? null, boundary: 'global' },
    })
  }, [error])

  return (
    <html lang="en">
      <title>Something went wrong | CHRGD</title>
      <body
        style={{
          background: 'var(--ground-base)',
          color: 'var(--ink-1)',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-6)',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 'var(--modal-sm)' }}>
          <h1
            style={{
              fontSize: 'var(--text-title)',
              fontWeight: 'var(--weight-display)',
              letterSpacing: 'var(--tracking-title)',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: 'var(--text-body)',
              lineHeight: 'var(--leading-loose)',
              color: 'var(--ink-3)',
              marginTop: 'var(--space-2)',
            }}
          >
            The page failed to load. It has been logged and we’re looking into it.
          </p>
          {/* A raw <button>: the primitives are off-limits in this file for the
              reason in the header, and `src/app` is outside the region the
              hub's no-raw-control test governs. */}
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="system-focus"
            style={{
              marginTop: 'var(--space-5)',
              padding: 'var(--space-2) var(--space-5)',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--accent)',
              color: 'var(--ink-on-accent)',
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-strong)',
              cursor: 'pointer',
              border: 'none',
            }}
          >
            Try again
          </button>
          {error?.digest ? (
            <p
              style={{
                fontSize: 'var(--text-micro)',
                color: 'var(--ink-3)',
                marginTop: 'var(--space-4)',
              }}
            >
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  )
}
