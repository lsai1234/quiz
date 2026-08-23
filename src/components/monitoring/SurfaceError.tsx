'use client'

import { useEffect } from 'react'
import { Button, Card } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import { reportClientError } from '@/lib/monitoring/client'

/**
 * What a customer sees when a screen breaks, and what we learn from it.
 *
 * One component behind every `error.tsx`, because a crash screen is the one
 * screen you cannot check by looking at it — it appears on somebody else's
 * phone, once, and then they leave. Having a single implementation means the
 * copy, the recovery action and the reporting are all exercised by whichever
 * boundary someone happens to hit.
 *
 * ── The reporting ───────────────────────────────────────────────────────────
 * The `useEffect` is the whole point of the file. A React error boundary is the
 * only place a render-time crash can be observed at all: it never reaches
 * `window.onerror`, so without this the most serious class of client failure —
 * the one that blanks the page — is exactly the one nothing records.
 *
 * A Server Component error arrives here with its message already stripped by
 * Next (deliberately — the real one could name a table or a key) and only a
 * `digest` to go on. That digest is reported, because it is what ties this to
 * the full stack `instrumentation.ts` already recorded on the server.
 *
 * ── The copy ────────────────────────────────────────────────────────────────
 * No apology theatre, and no error code shouted at somebody who cannot use one.
 * What went wrong in plain words, the fact that we know about it — which is now
 * true — and a button that genuinely retries.
 */
export function SurfaceError({
  error,
  retry,
  /** What the person was trying to reach, as a noun phrase: "the shop", "your hub". */
  what,
}: {
  error: Error & { digest?: string }
  retry: () => void
  what: string
}) {
  useEffect(() => {
    reportClientError({
      message: error?.message || 'Render error',
      stack: error?.stack ?? null,
      context: {
        // Present on Server Component errors, absent on client ones.
        digest: error?.digest ?? null,
        boundary: what,
      },
    })
  }, [error, what])

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ padding: 'var(--space-6)' }}
    >
      {/* The width sits here rather than on the Card: `Card` deliberately takes
          no `style` prop, so design values reach it as its own props or as
          tokens on a wrapper, never as loose CSS on the primitive. */}
      <div className="w-full" style={{ maxWidth: 'var(--modal-sm)' }}>
        <Card elevation={1}>
          <div className="flex flex-col items-center text-center">
            <span
              className="inline-flex items-center justify-center"
              style={{
                width: 'var(--control-md)',
                height: 'var(--control-md)',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--critical-fill)',
                color: 'var(--tone-critical)',
                marginBottom: 'var(--space-3)',
              }}
            >
              <Icon name="alert-triangle" size={19} />
            </span>

            <h1
              style={{
                fontSize: 'var(--text-title)',
                fontWeight: 'var(--weight-display)',
                fontFamily: 'var(--font-display)',
                letterSpacing: 'var(--tracking-title)',
                color: 'var(--ink-1)',
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
              We couldn’t load {what}. It has been logged and we’re on it — trying again
              often works.
            </p>

            <div style={{ marginTop: 'var(--space-5)' }}>
              <Button variant="primary" onClick={retry} icon="refresh">
                Try again
              </Button>
            </div>

            {/* The reference, small and last. Useless to most people, and the
                first thing worth asking for when somebody does get in touch. */}
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
        </Card>
      </div>
    </div>
  )
}
