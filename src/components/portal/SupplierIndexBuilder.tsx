'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card } from '@/components/system'

interface IndexState {
  products: number
  pagesRead: number
  complete: boolean
  updatedAt: string | null
  sweptIds?: number
  sweptFound?: number
  sweptTo?: number | null
  sweepComplete?: boolean
}

/**
 * Read PowerBody's whole product list once, and keep it.
 *
 * WHY THIS IS THE FIRST THING TO PRESS
 * ────────────────────────────────────
 * Every other screen here needs a `product_id` and only has a SKU. The only
 * bulk source of that mapping is PowerBody's paged product list, so without a
 * stored copy every single import re-walks their feed to rediscover a mapping
 * that never changes — and a SKU their feed cannot reach costs tens of
 * throttled requests to binary-search for instead.
 *
 * Crawled once, all of that becomes a lookup. It is the cheap call — codes,
 * prices and stock, no pictures or descriptions — so the cost is the paging.
 *
 * It runs in passes because one request cannot read an arbitrarily long feed:
 * each pass reads what fits and says where it got to, and this loops until the
 * feed genuinely ends.
 */
export function SupplierIndexBuilder() {
  const [state, setState] = useState<IndexState | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sweeping, setSweeping] = useState(false)
  /** Set once the user has agreed to the sweep's cost — see the note below. */
  const [sweepArmed, setSweepArmed] = useState(false)
  /** What deep pages of their list actually return — see `probeDepth`. */
  const [depth, setDepth] = useState<{
    verdict: string
    warning?: string
    pageSize: number
    lastPage: number
    totalProducts: number
    probed: Array<{ page: number; rows: number; firstSku?: string | null }>
  } | null>(null)
  const [probing, setProbing] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/supplier/index', { cache: 'no-store' })
      if (res.ok) setState(await res.json())
    } catch {
      // A failed status read is not worth a message of its own — the crawl
      // button reports properly when it is pressed.
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function crawl(reset: boolean) {
    setBusy(true)
    setError(null)
    let page: number | null = 1
    let passes = 0
    /** Consecutive passes that came back refused at the SAME page. */
    let stalled = 0
    let lastPage: number | null = null
    try {
      while (page !== null && passes < 200) {
        const res: Response = await fetch('/api/portal/supplier/index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromPage: page, reset: reset && passes === 0 }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(d.error ?? 'PowerBody could not be reached.')
          return
        }
        passes += 1
        setProgress(`${d.total} products from ${d.pagesRead} pages…`)
        setState({ products: d.total, pagesRead: d.pagesRead, complete: d.complete, updatedAt: new Date().toISOString() })
        if (d.complete || d.nextPage === null) break

        /**
         * Refused mid-feed. Asking again straight away is asking the same
         * question that was just refused, so it waits — longer each time it is
         * refused at the same page, because that is the signal that the pause
         * is not yet long enough.
         */
        if (d.throttled) {
          stalled = d.nextPage === lastPage ? stalled + 1 : 1
          if (stalled > 6) {
            setError(
              `PowerBody keep refusing at page ${d.nextPage}. ${d.total.toLocaleString()} products are indexed and kept — ` +
                'press again in a few minutes to carry on from there. Nothing is lost.',
            )
            return
          }
          const wait = Math.min(60_000, 5_000 * 2 ** (stalled - 1))
          setProgress(`PowerBody are throttling us at page ${d.nextPage}. Waiting ${Math.round(wait / 1000)}s…`)
          await new Promise((resolve) => setTimeout(resolve, wait))
        } else {
          stalled = 0
        }
        lastPage = d.nextPage
        page = d.nextPage
      }
    } catch {
      setError('The crawl stopped before it finished. Press again to carry on — what it already read is kept.')
    } finally {
      setBusy(false)
      setProgress(null)
      refresh()
    }
  }

  /**
   * Sweep product ids for everything their list feed will not hand over.
   *
   * The list call is capped server-side; `getProductInfo` is not, and its reply
   * carries the SKU — so walking ids is the only route to the rest of the
   * catalogue. It costs one throttled request per id and takes the best part of
   * an hour, which is why it is a separate, deliberate press rather than part
   * of the crawl.
   *
   * Resumable by design: each pass records where it got to, so closing the tab
   * costs the current pass and nothing more.
   */
  async function sweep() {
    setSweeping(true)
    setError(null)
    let next: number | null | undefined = undefined
    let passes = 0
    try {
      // 400 passes at ~45s each is around five hours — far more than the sweep
      // should ever need, and a bound so a bug cannot loop forever.
      while (passes < 400) {
        const res: Response = await fetch('/api/portal/supplier/index/sweep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next === undefined ? {} : { fromId: next }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(d.error ?? 'PowerBody could not be reached.')
          return
        }
        passes += 1
        setProgress(
          `Swept ${d.sweptIds.toLocaleString()} ids, found ${d.sweptFound.toLocaleString()} products the feed cannot reach. ` +
            `At id ${d.to.toLocaleString()}…`,
        )
        setState((prev) => (prev ? { ...prev, products: d.total, sweptIds: d.sweptIds, sweptFound: d.sweptFound, sweepComplete: d.complete } : prev))
        if (d.complete || d.nextId === null) break
        next = d.nextId
      }
    } catch {
      setError('The sweep stopped before it finished. Press again to carry on from where it got to.')
    } finally {
      setSweeping(false)
      setProgress(null)
      refresh()
    }
  }

  /**
   * Ask their list for specific deep pages and print what comes back.
   *
   * "Their feed caps at 3,000" was asserted here for a long time because an
   * export produced exactly 3,000 rows. That number was ours — a 200-page guard
   * at fifteen rows a page — and a pager stopping on its own budget looks
   * exactly like a feed that ended. One request to page 201 settles it, so it
   * is asked rather than reasoned about.
   */
  async function probeDepth() {
    setProbing(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/supplier/page-probe', { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'PowerBody could not be reached.')
        return
      }
      setDepth(d)
    } catch {
      setError('Could not reach PowerBody.')
    } finally {
      setProbing(false)
    }
  }

  const built = state && state.products > 0

  return (
    <Card padding="tight" className="space-y-2.5">
      <div>
        <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
          PowerBody product index
        </p>
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)', lineHeight: 'var(--leading-loose)' }}>
          Reads their whole product list once and keeps the SKU → product id mapping. Do this before importing a
          roster: every code it reaches then imports without paging or searching for it.
        </p>
      </div>

      <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)' }}>
        {progress ??
          (built
            ? `${state.products.toLocaleString()} products from ${state.pagesRead} pages.` +
              (state.complete
                ? ' Their feed ended here, so a code that is missing is genuinely not on the account.'
                : ' The crawl stopped early — a missing code proves nothing yet.')
            : 'Nothing crawled yet.')}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <Button variant={built ? 'secondary' : 'primary'} loading={busy} onClick={() => crawl(false)}>
          {built ? 'Refresh the index' : 'Build the index'}
        </Button>
        {built && (
          <Button variant="ghost" size="sm" loading={busy} onClick={() => crawl(true)}>
            Start over
          </Button>
        )}
      </div>

      {error && (
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--tone-critical)' }}>{error}</p>
      )}

      {/* Settles how deep their list actually goes, with their own answers
          rather than an assumption. */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" loading={probing} onClick={probeDepth}>
          How deep does their list go?
        </Button>
      </div>

      {depth && (
        <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)' }}>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-1)', lineHeight: 'var(--leading-loose)' }}>
            {depth.verdict}
          </p>
          {/* A sandbox answers every call successfully, so "small catalogue"
              and "wrong account" look identical without saying it out loud. */}
          {depth.warning && (
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--tone-attention)', marginTop: 'var(--space-2)', lineHeight: 'var(--leading-loose)' }}>
              {depth.warning}
            </p>
          )}
          <div className="overflow-x-auto" style={{ marginTop: 'var(--space-2)' }}>
            <table style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingRight: '1rem' }}>Page</th>
                  <th style={{ textAlign: 'left', paddingRight: '1rem' }}>Rows</th>
                  <th style={{ textAlign: 'left' }}>First code</th>
                </tr>
              </thead>
              <tbody>
                {depth.probed.map((row) => (
                  <tr key={row.page}>
                    <td style={{ paddingRight: '1rem' }}>{row.page}</td>
                    <td style={{ paddingRight: '1rem', color: row.rows > 0 ? 'var(--tone-positive)' : 'var(--ink-3)' }}>
                      {row.rows}
                    </td>
                    <td>{row.firstSku ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/*
        The sweep exists for a feed that will not hand its catalogue over. When
        the crawl reports `complete`, the feed ENDED — everything it has is
        everything there is — and sweeping ids would spend the best part of an
        hour rediscovering products the index already holds.
        So a finished crawl retires the offer rather than leaving an expensive
        button sitting there looking like the next step.
      */}
      {built && state.complete && (state.sweptIds ?? 0) === 0 && (
        <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', lineHeight: 'var(--leading-loose)' }}>
          Their feed ended on its own, so this index holds their whole catalogue. There is nothing left to search for.
        </p>
      )}

      {built && !state.complete && (
        <div className="pt-2.5" style={{ borderTop: '1px solid var(--edge)' }}>
          <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
            The products their feed will not list
          </p>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)', lineHeight: 'var(--leading-loose)' }}>
            PowerBody cap the product LIST at 3,000. They do not cap the product DETAIL call, and its reply carries
            the code — so walking their product ids reaches the rest of the catalogue. It is the only route to those
            products, and it costs one throttled request per id:{' '}
            <strong style={{ color: 'var(--ink-2)' }}>expect it to run for the best part of an hour</strong>. It
            resumes where it left off, so closing this tab costs a minute, not the run.
          </p>

          {(state.sweptIds ?? 0) > 0 && (
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)', marginTop: 'var(--space-2)' }}>
              {state.sweptIds?.toLocaleString()} ids swept, {state.sweptFound?.toLocaleString()} products found.
              {state.sweepComplete ? ' Their ids ran out — this is the whole catalogue.' : ' Not finished.'}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 'var(--space-2)' }}>
            {state.sweepComplete ? (
              <Button variant="ghost" size="sm" loading={sweeping} onClick={() => { setSweepArmed(true); sweep() }}>
                Sweep again
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                loading={sweeping}
                // Two presses. An hour of requests against somebody else's
                // rate-limited API is not something to start by mistake.
                onClick={() => (sweepArmed ? sweep() : setSweepArmed(true))}
              >
                {sweepArmed
                  ? 'Start it — this will run for a while'
                  : (state.sweptIds ?? 0) > 0
                    ? 'Carry on sweeping'
                    : 'Find the rest of the catalogue'}
              </Button>
            )}
            {sweepArmed && !sweeping && (
              <Button variant="ghost" size="sm" onClick={() => setSweepArmed(false)}>
                Not now
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
