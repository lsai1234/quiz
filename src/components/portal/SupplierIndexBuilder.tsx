'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card } from '@/components/system'

interface IndexState {
  products: number
  pagesRead: number
  complete: boolean
  updatedAt: string | null
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
        page = d.nextPage
      }
    } catch {
      setError('The crawl stopped before it finished. Press again to carry on.')
    } finally {
      setBusy(false)
      setProgress(null)
      refresh()
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
    </Card>
  )
}
