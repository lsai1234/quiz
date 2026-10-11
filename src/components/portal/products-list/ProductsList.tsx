'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button, EmptyState, Input, Note, Select, Skeleton, buttonSurface } from '@/components/system'
import { ADD_PRODUCTS_HREF, PRODUCTS_HREF, REVIEW_HREF } from '@/lib/portal/product-links'
import { ProductRow } from './ProductRow'
import {
  categoriesOf,
  countViews,
  inView,
  parseShow,
  visibleEntries,
  type ListEntry,
  type ListFilters,
  type ShowView,
} from './model'

const CATALOGUE_SETTINGS_HREF = '/founderhub/settings/catalogue'

type Load =
  | { status: 'loading' }
  | { status: 'ready'; entries: ListEntry[]; source: 'mock' | 'real' }
  | { status: 'signed-out' }
  | { status: 'failed'; message: string }

/** The pills, in the order a founder reads the catalogue: what sells, what waits, what is wrong, what is gone. */
const PILLS: Array<{ view: Exclude<ShowView, 'attention'>; label: string }> = [
  { view: 'live', label: 'On sale' },
  { view: 'pending', label: 'Waiting for review' },
  { view: 'blocking', label: 'Blocking' },
  { view: 'warnings', label: 'Warnings' },
  { view: 'removed', label: 'Removed' },
  { view: 'all', label: 'All' },
]

/** One sentence under the pills saying what the view is, so a count is never a riddle. */
const VIEW_LINE: Record<ShowView, string> = {
  live: 'Everything the shop and the quiz are selling.',
  pending: 'Added from PowerBody and held out of the shop until you have checked them.',
  attention: 'Products on sale with something to fix — blocking problems first, then warnings. Each one opens where it is fixed.',
  blocking: 'Products on sale with a problem that stops them selling properly. Each one opens where it is fixed.',
  warnings: 'Products on sale that sell, but with something worth fixing. Each one opens where it is fixed.',
  removed: 'Hidden from the shop, the quiz and the hub lists. Open one to restore it.',
  all: 'Every product — on sale, waiting for review and removed.',
}

/** The list's own state, written to the address bar so Back from a product lands on the same view. */
function urlFor(filters: ListFilters): string {
  const params = new URLSearchParams()
  if (filters.show !== 'all') params.set('show', filters.show)
  if (filters.query.trim()) params.set('q', filters.query.trim())
  if (filters.category) params.set('category', filters.category)
  if (filters.several) params.set('several', '1')
  if (filters.subscription) params.set('sub', '1')
  const query = params.toString()
  return query ? `${PRODUCTS_HREF}?${query}` : PRODUCTS_HREF
}

/**
 * The Products list — every product a founder can open, in one place.
 *
 * ── Why one list ────────────────────────────────────────────────────────────
 * This replaced three screens. Catalogue and Dashboard were two views of the
 * same products with different searches and different things you could do from
 * them, and Readiness was a third copy sorted worst-first. A founder looking for
 * a product had to guess which one held it, and a product waiting for review
 * was on none of them. Now there is one list, and every row opens the one page
 * where everything about that product is changed.
 *
 * ── Read-only on purpose ────────────────────────────────────────────────────
 * Nothing is edited here. Removing, restoring, approving and every field live on
 * the product page, where you can see what you are changing; a list that also
 * edits is how the old screens ended up with two ways to do everything, each
 * writing products its own way.
 *
 * The catalogue-wide jobs that used to sit above the Catalogue (tag
 * suggestions, short names) moved to Fix-ups, so this page is only the list.
 */
export function ProductsList() {
  const searchParams = useSearchParams()
  const initial = useRef<ListFilters | null>(null)
  if (initial.current === null) {
    initial.current = {
      show: parseShow(searchParams.get('show')),
      query: searchParams.get('q') ?? '',
      category: searchParams.get('category') ?? '',
      several: searchParams.get('several') === '1',
      subscription: searchParams.get('sub') === '1',
    }
  }
  const [filters, setFilters] = useState<ListFilters>(initial.current)
  const current = useRef(filters)
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  /*
    Following a link to a different view while already here.

    The front page's "Products not launch-ready" and the sub-nav's "Products"
    both point at this page; following one while it is open can change the
    address without remounting, so the view follows the address — but only when
    the address moved to a view this page did not write itself. Only the VIEW is
    followed, never the search box: echoing the address back into a field being
    typed in can land a stale value over the next keystroke.
  */
  const written = useRef<ShowView>(initial.current.show)
  const urlShow = searchParams.get('show')
  useEffect(() => {
    const show = parseShow(urlShow)
    if (show === written.current) return
    written.current = show
    const next = { ...current.current, show }
    current.current = next
    setFilters(next)
  }, [urlShow])

  const update = useCallback((patch: Partial<ListFilters>) => {
    const next = { ...current.current, ...patch }
    current.current = next
    written.current = next.show
    setFilters(next)
    try {
      // `replaceState`, not a navigation: narrowing a list is not somewhere to
      // go Back to, and Next keeps `useSearchParams` in step with it. Written so
      // that Back from a product page lands on the view the founder left.
      window.history.replaceState(window.history.state, '', urlFor(next))
    } catch {
      /* the address is a convenience; the list works without it */
    }
  }, [])

  const fetchProducts = useCallback(async () => {
    setLoad({ status: 'loading' })
    try {
      const res = await fetch('/api/portal/products?all=1', { cache: 'no-store' })
      if (res.status === 401) return setLoad({ status: 'signed-out' })
      const data = (await res.json().catch(() => null)) as { products?: ListEntry[]; source?: string; error?: string } | null
      if (!res.ok || !data || !Array.isArray(data.products)) {
        return setLoad({
          status: 'failed',
          message: data?.error ?? `The server answered with an error (HTTP ${res.status}).`,
        })
      }
      setLoad({ status: 'ready', entries: data.products, source: data.source === 'real' ? 'real' : 'mock' })
    } catch {
      setLoad({ status: 'failed', message: 'Could not reach the server — check the connection.' })
    }
  }, [])

  useEffect(() => {
    void fetchProducts()
  }, [fetchProducts])

  const entries = useMemo(() => (load.status === 'ready' ? load.entries : []), [load])
  const counts = useMemo(() => countViews(entries), [entries])
  const categories = useMemo(() => categoriesOf(entries), [entries])
  const rows = useMemo(() => visibleEntries(entries, filters), [entries, filters])

  // The two toggles count within the view the founder is looking at, so the
  // number on the button is the number of rows pressing it will leave.
  const inThisView = useMemo(() => entries.filter((e) => inView(e, filters.show)), [entries, filters.show])
  const severalCount = inThisView.filter((e) => e.product.variants.length > 1).length
  const subscriptionCount = inThisView.filter((e) => e.product.subscriptionEligible).length

  const narrowed = !!(filters.query.trim() || filters.category || filters.several || filters.subscription)
  const showChecks = filters.show === 'attention' || filters.show === 'blocking' || filters.show === 'warnings'

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
        <div className="min-w-0">
          <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
            Every product
          </h2>
          <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)', marginTop: 'var(--space-1)', maxWidth: '42rem' }}>
            Open one to change anything about it — what the shop shows, its flavours and sizes, its prices, how the
            quiz uses it, and where it comes from.
          </p>
        </div>
        {/* A link, not a button: it goes somewhere, and someone expecting to
            middle-click it should be able to. */}
        <Link href={ADD_PRODUCTS_HREF} {...buttonSurface('primary', 'sm')}>
          Add products
        </Link>
      </div>

      {load.status === 'ready' && load.source === 'mock' && (
        <div style={{ marginBottom: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
          <Note tone="info">
            This is the <strong>sample catalogue</strong> — made-up products for trying the shop and the quiz out.
            Your own products from PowerBody are sold once you switch to them in{' '}
            <Link href={CATALOGUE_SETTINGS_HREF} style={{ color: 'var(--accent)', fontWeight: 'var(--weight-strong)' }}>
              Settings → Catalogue
            </Link>
            .
          </Note>
        </div>
      )}

      {load.status === 'loading' && <LoadingRows />}

      {load.status === 'signed-out' && (
        <Note tone="attention" icon="lock" live="assertive">
          Your session has expired, so the products could not be loaded. Sign in again and this list comes back as
          you left it.{' '}
          {/* A full page load, not a client navigation: the sign-in screen is
              drawn by the hub's root layout, which a soft navigation keeps. */}
          <a href={urlFor(filters)} style={{ color: 'var(--accent)', fontWeight: 'var(--weight-strong)' }}>
            Sign in again
          </a>
        </Note>
      )}

      {load.status === 'failed' && (
        <EmptyState
          icon="alert-triangle"
          title="The products could not be loaded"
          action={
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => void fetchProducts()}>
              Try again
            </Button>
          }
        >
          {load.message} Nothing has changed — this only failed to read them.
        </EmptyState>
      )}

      {load.status === 'ready' && entries.length === 0 && (
        <EmptyState
          icon="box"
          title="No products yet"
          action={
            <Link href={ADD_PRODUCTS_HREF} {...buttonSurface('primary', 'sm')}>
              Add products
            </Link>
          }
        >
          Paste PowerBody SKUs or product ids and each comes back as a product, waiting for you to check before it goes
          on sale.
        </EmptyState>
      )}

      {load.status === 'ready' && entries.length > 0 && (
        <>
          {/* Filters, not tabs: they narrow one list rather than switching
              between panels, so `aria-pressed` is the state that fits. In the
              "needs attention" view both Blocking and Warnings are pressed —
              that view IS the two of them together. */}
          <div className="flex flex-wrap" role="group" aria-label="Show" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            {PILLS.map(({ view, label }) => {
              const pressed =
                filters.show === view ||
                (filters.show === 'attention' && (view === 'blocking' || view === 'warnings'))
              return (
                <Button
                  key={view}
                  size="sm"
                  variant={pressed ? 'primary' : 'secondary'}
                  aria-pressed={pressed}
                  onClick={() => update({ show: view })}
                >
                  {`${label} (${counts[view]})`}
                </Button>
              )
            })}
          </div>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-2)' }}>
            {VIEW_LINE[filters.show]}
            {showChecks && counts.live > 0 && ` ${counts.live - counts.attention} of ${counts.live} on sale pass every check.`}
            {filters.show === 'pending' && counts.pending > 0 && (
              <>
                {' '}
                <Link href={REVIEW_HREF} style={{ color: 'var(--accent)', fontWeight: 'var(--weight-strong)' }}>
                  Work through them in Review
                </Link>
              </>
            )}
          </p>

          <div
            className="grid grid-cols-1 sm:grid-cols-2"
            style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)', marginBottom: 'var(--space-2)' }}
          >
            <Input
              label="Search products"
              compact
              className="w-full"
              type="search"
              value={filters.query}
              onChange={(e) => update({ query: e.target.value })}
              placeholder="Name, brand, flavour, size, SKU or PowerBody id…"
            />
            <Select
              label="Category"
              compact
              className="w-full"
              value={filters.category}
              onChange={(e) => update({ category: e.target.value })}
            >
              <option value="">Every category</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {`${c.name} (${c.count})`}
                </option>
              ))}
              {/* A category in the address that no product has any more —
                  kept as an option so the box says what is filtering. */}
              {filters.category && !categories.some((c) => c.name === filters.category) && (
                <option value={filters.category}>{`${filters.category} (0)`}</option>
              )}
            </Select>
          </div>
          {/*
            Two yes/no questions about the SHAPE of a product, not categories.
            They combine with everything else — "several flavours, in Protein,
            on subscription" is the question a founder chasing per-flavour data
            actually asks — so they get their own row.
          */}
          <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            <Button
              size="sm"
              variant={filters.several ? 'primary' : 'secondary'}
              aria-pressed={filters.several}
              onClick={() => update({ several: !filters.several })}
            >
              {`Several flavours/sizes (${severalCount})`}
            </Button>
            <Button
              size="sm"
              variant={filters.subscription ? 'primary' : 'secondary'}
              aria-pressed={filters.subscription}
              onClick={() => update({ subscription: !filters.subscription })}
            >
              {`Subscription (${subscriptionCount})`}
            </Button>
          </div>

          {rows.length > 0 ? (
            <>
              <p className="sr-only" role="status">
                {`${rows.length} product${rows.length === 1 ? '' : 's'} shown`}
              </p>
              <ul className="grid grid-cols-1" style={{ gap: 'var(--space-2)' }}>
                {rows.map((entry) => (
                  <ProductRow key={entry.product.id} entry={entry} showChecks={showChecks} />
                ))}
              </ul>
            </>
          ) : (
            <NothingInView
              show={filters.show}
              narrowed={narrowed}
              onClear={() => update({ query: '', category: '', several: false, subscription: false })}
              onShowAll={() => update({ show: 'all', query: '', category: '', several: false, subscription: false })}
            />
          )}
        </>
      )}
    </div>
  )
}

/**
 * An empty view, said for what it is.
 *
 * "No products match." under a Blocking filter reads as a fault; it is the best
 * news this page can give. So each view says what its emptiness means, and a
 * search that found nothing offers to clear itself rather than leaving the
 * founder to work out which of four controls is hiding the product.
 */
function NothingInView({
  show,
  narrowed,
  onClear,
  onShowAll,
}: {
  show: ShowView
  narrowed: boolean
  onClear: () => void
  onShowAll: () => void
}) {
  if (narrowed) {
    return (
      <EmptyState
        icon="grid"
        title="Nothing matches"
        action={
          <Button variant="secondary" size="sm" onClick={show === 'all' ? onClear : onShowAll}>
            {show === 'all' ? 'Clear the search and filters' : 'Search every product instead'}
          </Button>
        }
      >
        No product in this view matches the search and filters. A product can be found by its name, brand, category,
        a flavour or size, a SKU or its PowerBody id.
      </EmptyState>
    )
  }

  const empty: Record<ShowView, { title: string; line: string }> = {
    live: { title: 'Nothing on sale yet', line: 'Products go on sale when you approve them in Review.' },
    pending: { title: 'Nothing waiting for review', line: 'Products you add from PowerBody wait here until you have checked them.' },
    attention: { title: 'Nothing needs fixing', line: 'Every product on sale passes its checks.' },
    blocking: { title: 'Nothing is blocked', line: 'No product on sale has a problem that stops it selling properly.' },
    warnings: { title: 'No warnings', line: 'No product on sale has anything worth fixing.' },
    removed: { title: 'Nothing removed', line: 'A product you remove is kept here so it can be restored.' },
    all: { title: 'No products yet', line: 'Add products from PowerBody to start.' },
  }
  const { title, line } = empty[show]
  return (
    <EmptyState
      icon={show === 'attention' || show === 'blocking' || show === 'warnings' ? 'check' : 'box'}
      title={title}
      action={
        show === 'live' || show === 'pending' || show === 'all' ? (
          <Link href={show === 'live' ? REVIEW_HREF : ADD_PRODUCTS_HREF} {...buttonSurface('secondary', 'sm')}>
            {show === 'live' ? 'Open Review' : 'Add products'}
          </Link>
        ) : (
          <Button variant="secondary" size="sm" onClick={onShowAll}>
            Show every product
          </Button>
        )
      }
    >
      {line}
    </EmptyState>
  )
}

function LoadingRows() {
  return (
    <div aria-busy="true" aria-label="Loading products" style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} height="var(--control-lg)" radius="var(--radius-card)" />
      ))}
    </div>
  )
}
