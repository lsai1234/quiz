'use client'

import { useEffect, useState } from 'react'
import type { ShareCardPayload } from '@/lib/share-card/types'
import { ShareStackButton } from '@/components/share-card/ShareStackButton'
import { ShareSheet } from '@/components/share-card/ShareSheet'

/**
 * The bench.
 *
 * ── The competition switch ──────────────────────────────────────────────────
 * Both components read the live campaign from `/api/competition/enter`, and the
 * campaign is `off` by default and stays that way until the founder has written
 * the CAP Code wording. Without a way to fake it, the giveaway half of this flow
 * — the prize chip, the entry card, the handle step — could only be reviewed by
 * switching a real promotion on, which is not something a styleguide should ask
 * anybody to do.
 *
 * So the switch patches `fetch` for that one URL while the bench is mounted. It
 * is a review tool on a page nothing links to from the app, and it is scoped to
 * a single endpoint and restored on unmount.
 */
export function ShareFlowBench({ payload }: { payload: ShareCardPayload }) {
  const [live, setLive] = useState(true)
  const [test, setTest] = useState(false)
  const [open, setOpen] = useState(false)
  const [patched, setPatched] = useState(false)

  useEffect(() => {
    const real = window.fetch
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/api/competition/enter') && (!init || init.method !== 'POST')) {
        return new Response(
          JSON.stringify(
            live
              ? {
                  state: 'open',
                  prize: 'Win £200 of supplements',
                  test,
                  closesAt: '2026-11-30T23:59:00.000Z',
                  // The campaign defaults, so the confirmation step shows the
                  // conditions it will actually show in production.
                  entrySteps: [
                    'Follow @getchrgd_',
                    'Take the quiz',
                    'Share it to your story tagging us',
                  ],
                }
              : { state: 'off' },
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return real(input, init)
    }) as typeof window.fetch

    setPatched(true)
    return () => { window.fetch = real }
  }, [live, test])

  const toggle = (on: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '0.5rem',
    borderRadius: '0.75rem',
    fontSize: '0.6875rem',
    fontWeight: 700,
    cursor: 'pointer',
    background: on ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.05)',
    border: `1px solid ${on ? 'rgba(0,212,255,0.38)' : 'rgba(255,255,255,0.09)'}`,
    color: on ? '#00D4FF' : 'var(--color-text-2)',
  })

  return (
    <div style={{ maxWidth: '30rem', margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '0.5rem', padding: '0 1.25rem', marginBottom: '1.5rem' }}>
        <button type="button" style={toggle(!live)} onClick={() => setLive(false)}>
          No draw
        </button>
        <button type="button" style={toggle(live && !test)} onClick={() => { setLive(true); setTest(false) }}>
          Draw open
        </button>
        <button type="button" style={toggle(live && test)} onClick={() => { setLive(true); setTest(true) }}>
          Test run
        </button>
      </div>

      {/* Remounted on every switch: both components read the campaign once, on
          mount, which is correct in the app and means the bench has to give them
          a fresh mount to see a different answer. */}
      {patched && (
        <ShareStackButton
          key={`tile-${live}-${test}`}
          payload={payload}
          onOpen={() => setOpen(true)}
        />
      )}

      {open && patched && (
        <ShareSheet
          key={`sheet-${live}-${test}`}
          payload={payload}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
