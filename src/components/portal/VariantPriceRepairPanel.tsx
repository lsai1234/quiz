'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Badge, Button, Card, Note } from '@/components/system'
import { ProductLink, useProductIndex } from '@/components/portal/fixups/product-index'
import type { FixupPanelProps } from '@/components/portal/fixups/types'
import { ADD_PRODUCTS_HREF } from '@/lib/portal/product-links'

interface Candidate {
  productId: string
  title: string
  variants: number
  onePrice: boolean
  servingsKnown: number
  picturesKnown: number
}

interface Scan {
  products: Candidate[]
  total: number
}

interface Repair {
  productId: string
  title: string
  changed: Record<string, string>
}

/** What one batch managed, in the terms a founder would ask about. */
interface RunReport {
  asked: number
  answered: number
  unindexed: string[]
  pricesFound: number
  servingsFound: number
  picturesFound: number
  slow: boolean
  elapsedMs: number
  error: string | null
}

interface BatchResult {
  ok?: boolean
  error?: string
  message?: string
  offset?: number
  products?: number
  totalProducts?: number
  nextOffset?: number | null
  total?: number
  variants?: number
  report?: RunReport
  repaired?: Repair[]
}

/** Running totals across the batches of one run. */
interface Progress {
  productsDone: number
  totalProducts: number
  skusAsked: number
  skusAnswered: number
  prices: number
  servings: number
  pictures: number
  unindexed: string[]
  seconds: number
}

const EMPTY: Progress = {
  productsDone: 0, totalProducts: 0, skusAsked: 0, skusAnswered: 0,
  prices: 0, servings: 0, pictures: 0, unindexed: [], seconds: 0,
}

const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' } as const
/** How many products to list before the rest fold behind "Show all". */
const LISTED = 12
const EYEBROW = { fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-strong)', textTransform: 'uppercase', color: 'var(--ink-3)' } as const
const LINK = { color: 'var(--accent)', fontWeight: 'var(--weight-strong)', textDecoration: 'underline', textUnderlineOffset: '0.2em' } as const

/**
 * Variants that were all given the main SKU's price, servings and picture.
 *
 * Import merged a roster row's sibling SKUs into one product and took all three
 * from the row's main SKU, because a flavour of one tub costs one price and
 * looks like the others. That holds for flavours and for nothing else, and the
 * sheet is written by a person: the glycine row merged 100 × 1000mg capsules
 * (£11.12 to us, 33 servings) with a 454g bag of the same powder (£20.04, 454
 * servings), and both went live at one price with one serving count.
 *
 * ── Why this runs in batches ────────────────────────────────────────────────
 * Reading a SKU is one throttled call to PowerBody, who allow us two at a time.
 * A hundred SKUs is minutes; a serverless request gets sixty seconds. So the
 * screen drives the loop — a dozen SKUs a request — and every batch writes what
 * it repaired before it returns. A run that stops halfway has still fixed half,
 * and pressing the button again picks up where it stopped.
 *
 * The route chooses the products (every one with more than one SKU) and takes
 * no list, so the sweep also covers products still waiting for review — which
 * is harmless, since a pull is what Review would do for them anyway. They are
 * marked in the list, so the count is not mistaken for products on sale.
 */
export function VariantPriceRepairPanel({ onSummary, onRunningChange }: FixupPanelProps) {
  const index = useProductIndex()
  const [scan, setScan] = useState<Scan | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress>(EMPTY)
  const [repaired, setRepaired] = useState<Repair[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const cancelled = useRef(false)

  const load = useCallback(() => {
    setLoadError(null)
    fetch('/api/portal/products/repair-variant-pricing', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => null)
        if (r.ok && Array.isArray(d?.products)) setScan(d)
        else setLoadError(d?.error ?? `The server answered with an error (HTTP ${r.status}).`)
      })
      .catch(() => setLoadError('Could not reach the server — check the connection.'))
  }, [])

  useEffect(load, [load])
  useEffect(() => onRunningChange?.(busy), [busy, onRunningChange])

  const waiting = (id: string) => index.byId.get(id)?.state === 'pending'

  useEffect(() => {
    if (!onSummary) return
    if (loadError) return onSummary({ count: null, line: 'Could not count — see inside.' })
    if (!scan) return onSummary({ count: null, line: 'Counting…' })
    const onePrice = scan.products.filter((p) => p.onePrice).length
    const noPictures = scan.products.filter((p) => p.picturesKnown === 0).length
    onSummary({
      count: scan.total,
      line:
        scan.total === 0
          ? 'No product has more than one PowerBody SKU behind it, so there is nothing to read per SKU.'
          : `${scan.total} product${scan.total === 1 ? '' : 's'} with more than one SKU — ${onePrice} showing every SKU at one price, ${noPictures} with no per-flavour pictures yet.`,
    })
  }, [onSummary, scan, loadError])

  /**
   * One batch.
   *
   * A response that is not JSON is the case worth naming: it means the platform
   * stopped the request rather than the route answering, and "could not reach
   * PowerBody" would be the wrong thing to say about our own timeout.
   */
  async function runBatch(force: boolean, offset: number): Promise<BatchResult | null> {
    let res: Response
    try {
      res = await fetch('/api/portal/products/repair-variant-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force, offset }),
      })
    } catch {
      setError('Could not reach our server — check the connection. Anything already corrected is saved; press the button again to carry on.')
      return null
    }
    const body = await res.json().catch(() => null)
    if (!body) {
      setError(
        res.status === 504 || res.status === 502
          ? `The batch ran out of time before PowerBody answered (HTTP ${res.status}). Anything already ` +
            'corrected is saved — press the button again to carry on from where it stopped.'
          : `PowerBody could not be read and the server did not say why (HTTP ${res.status}).`,
      )
      return null
    }
    if (!res.ok || body.ok === false) {
      setError(body.error ?? `The run failed (HTTP ${res.status}).`)
      return null
    }
    return body
  }

  async function run(force: boolean) {
    setBusy(true)
    cancelled.current = false
    setError(null)
    setDone(null)
    setNote(null)
    setRepaired(null)
    setProgress(EMPTY)

    const fixed: Repair[] = []
    const totals = { ...EMPTY }
    let offset = 0
    let refused: string | null = null

    try {
      for (;;) {
        if (cancelled.current) break
        const batch = await runBatch(force, offset)
        if (!batch) break

        const report = batch.report
        totals.productsDone += batch.products ?? 0
        totals.totalProducts = batch.totalProducts ?? totals.totalProducts
        if (report) {
          totals.skusAsked += report.asked
          totals.skusAnswered += report.answered
          totals.prices += report.pricesFound
          totals.servings += report.servingsFound
          totals.pictures += report.picturesFound
          totals.seconds += Math.round(report.elapsedMs / 100) / 10
          for (const sku of report.unindexed) if (!totals.unindexed.includes(sku)) totals.unindexed.push(sku)
          // The supplier's own words, kept and shown — including the transport's
          // advice about concurrency, which is the actual remedy when it is one.
          if (report.error) setNote(report.error)
          /*
            A batch that asked and learned nothing is a supplier that is not
            answering. Walking the remaining batches would be a dozen more
            requests to be refused by, so the run stops here and says why —
            with their words rather than ours.
          */
          if (report.error && report.answered === 0 && report.asked > 0) {
            refused = report.error
            // Their words go in the failure, not beside it: the same sentence
            // twice on one screen reads as two problems.
            setNote(null)
            setProgress({ ...totals })
            break
          }
        }
        fixed.push(...(batch.repaired ?? []))
        setProgress({ ...totals })
        setRepaired([...fixed])

        if (batch.nextOffset == null) break
        offset = batch.nextOffset
      }

      const changed = fixed.reduce((n, r) => n + Object.keys(r.changed).length, 0)
      const message =
        fixed.length > 0
          ? `${changed} variant${changed === 1 ? '' : 's'} corrected across ${fixed.length} ` +
            `product${fixed.length === 1 ? '' : 's'}.`
          : 'Nothing needed changing — every variant already carries its own price, serving count and picture.'
      if (!cancelled.current && !refused) setDone(message)
      if (refused) {
        /*
          Their message already carries the remedy when there is one — the
          transport appends "lower POWERBODY_MAX_CONCURRENT or raise
          POWERBODY_MIN_INTERVAL_MS" to a rate limit it could not ride out. So
          this says where the run got to and quotes them, rather than offering
          the same advice a second time in our own words.
        */
        setError(
          `PowerBody answered for none of the SKUs in that batch, so the run stopped at ` +
            `${totals.productsDone} of ${totals.totalProducts || (scan?.total ?? 0)} products. ` +
            `Anything corrected before that is saved, and pressing the button again carries on. ` +
            `They said: ${refused}`,
        )
      }
      // The shop, the product page and the per-serving price all read these.
      invalidateCatalogue()
      load()
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <Note tone="critical">
        The per-SKU prices could not be checked: {loadError}{' '}
        <Button size="sm" variant="ghost" icon="refresh" onClick={load}>
          Try again
        </Button>
      </Note>
    )
  }
  if (!scan) return <p style={META}>Counting…</p>

  const suspect = scan.products.filter((p) => p.onePrice)
  const noPictures = scan.products.filter((p) => p.picturesKnown === 0).length
  const totalSkus = scan.products.reduce((n, p) => n + p.variants, 0)

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <p style={{ ...META, color: 'var(--ink-2)' }}>
        {scan.total === 0
          ? 'No product has more than one supplier SKU behind it.'
          : `${scan.total} product${scan.total === 1 ? '' : 's'} merge more than one supplier SKU — ` +
            `${totalSkus} SKUs in all. ${suspect.length} show every variant at the same price, and ` +
            `${noPictures} have no per-flavour pictures yet.`}
      </p>

      {scan.total > 0 && (
        <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
          {busy ? (
            <Button size="sm" variant="secondary" icon="pause" onClick={() => { cancelled.current = true }}>
              Stop after this batch
            </Button>
          ) : (
            <>
              <Button size="sm" variant="primary" onClick={() => void run(false)}>
                Fix mispriced variants
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void run(true)}>
                Re-price all from cost
              </Button>
            </>
          )}
        </div>
      )}

      {/*
        What is happening, while it happens.

        A run is a minute or two of throttled supplier calls in a dozen requests,
        and a button that sits there saying nothing for that long is
        indistinguishable from one that has hung. Every number here is a fact
        from the batch that just returned.
      */}
      {busy && (
        <Note tone="info" live="polite">
          Reading PowerBody, {progress.productsDone} of {progress.totalProducts || scan.total} products
          {progress.skusAsked > 0 && (
            <>
              {' '}· {progress.skusAnswered} of {progress.skusAsked} SKUs answered · {progress.prices} prices,{' '}
              {progress.servings} serving counts, {progress.pictures} pictures · {progress.seconds.toFixed(1)}s
              waiting on them
            </>
          )}
          . Each SKU is one throttled call, so this takes a minute or two. It saves as it goes — stopping is safe.
        </Note>
      )}

      {scan.total > 0 && !busy && (
        <Note tone="attention">
          Anything imported before this was fixed took its price, serving count and photograph from the
          row&rsquo;s MAIN SKU, so two genuinely different things under one master SKU — 100 capsules and a
          454g bag of the same powder — went live at one price with one serving count.
          <br />
          <br />
          <strong>Fix mispriced variants</strong> only re-prices products whose SKUs actually cost different
          amounts and are still showing one shelf price, which is the exact signature of that bug; a product you
          have priced by hand already has variants that differ, so it is left alone. Serving counts, costs and
          photographs are read either way — those are facts, not decisions. PowerBody hold one picture per SKU
          and a flavour is its own SKU at their end, so a six-flavour product has six real pictures and the shop
          was showing one of them six times. A picture already set is never replaced.
          <br />
          <br />
          It reads {totalSkus} SKUs a dozen at a time, because PowerBody allow two calls at once and a hundred
          of them does not fit in one request. Every batch saves before the next one starts, so it is safe to
          stop, and safe to re-run.
          <br />
          <br />
          <strong>Re-price all from cost</strong> rewrites every variant of every multi-SKU product back to
          the rule price from its own cost. A price you set yourself on a product&rsquo;s page is never touched by
          either button.
        </Note>
      )}

      {error && (
        <Note tone="critical" live="assertive">
          {error}
        </Note>
      )}

      {done && !error && (
        <Note tone="positive" live="polite">
          {done}{' '}
          {progress.skusAsked > 0 && (
            <>
              Read {progress.skusAnswered} of {progress.skusAsked} SKUs from PowerBody in{' '}
              {progress.seconds.toFixed(1)}s.
            </>
          )}
        </Note>
      )}

      {/* PowerBody's own words when they refused — including the transport's
          advice about concurrency, which is the remedy when it is one. */}
      {note && <Note tone="attention">PowerBody said: {note}</Note>}

      {progress.unindexed.length > 0 && (
        <Note tone="attention">
          {progress.unindexed.length} SKU{progress.unindexed.length === 1 ? ' is' : 's are'} not in the stored PowerBody
          index ({progress.unindexed.slice(0, 6).join(', ')}
          {progress.unindexed.length > 6 ? '…' : ''}), so nothing could be asked about{' '}
          {progress.unindexed.length === 1 ? 'it' : 'them'}. Build or refresh the index at the bottom of{' '}
          <Link href={ADD_PRODUCTS_HREF} style={LINK}>
            Add products
          </Link>
          , then run this again — or open a product and use Pull from PowerBody, which searches for any id it is missing.
        </Note>
      )}

      {!busy && suspect.length > 0 && !repaired && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <p style={EYEBROW}>Every variant at one price ({suspect.length})</p>
          <ul style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {(showAll ? suspect : suspect.slice(0, LISTED)).map((c) => (
              <Card key={c.productId} as="li" solid padding="tight">
                <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
                  <ProductLink id={c.productId} section="variants">
                    {c.title}
                  </ProductLink>
                  {waiting(c.productId) && <Badge tone="info">Waiting for review</Badge>}
                </div>
                <p style={META}>
                  {c.variants} variants · {c.servingsKnown} with their own serving count ·{' '}
                  {c.picturesKnown} with their own picture
                </p>
              </Card>
            ))}
          </ul>
          {suspect.length > LISTED && (
            <div>
              <Button size="sm" variant="ghost" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${suspect.length}`}
              </Button>
            </div>
          )}
        </div>
      )}

      {repaired && repaired.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <p style={EYEBROW}>Corrected ({repaired.length})</p>
          <ul style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {repaired.map((r) => (
              <Card key={r.productId} as="li" solid padding="tight">
                <p style={{ fontSize: 'var(--text-body-sm)' }}>
                  <ProductLink id={r.productId} section="variants">
                    {r.title}
                  </ProductLink>
                </p>
                <p style={{ ...META, color: 'var(--ink-2)', lineHeight: 'var(--leading-snug)' }}>
                  {Object.entries(r.changed).map(([sku, what]) => `${sku}: ${what}`).join(' · ')}
                </p>
              </Card>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
