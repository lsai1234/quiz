'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { CatalogueCoverage, CoverageItem, CoverageStatus } from '@/lib/portal/coverage'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { productHref } from '@/lib/portal/product-links'
import { Badge, Button, Card, EmptyState } from '@/components/system'

const TONE: Record<CoverageStatus, 'positive' | 'attention' | 'critical'> = { ok: 'positive', warn: 'attention', fail: 'critical' }
const STATUS: Record<CoverageStatus, string> = { ok: 'Covered', warn: 'Thin', fail: 'Gap' }
const RANK: Record<CoverageStatus, number> = { fail: 0, warn: 1, ok: 2 }

type Named = { id: string; title: string }

/**
 * Which product each title in a coverage line is.
 *
 * The coverage read reports titles only, and two products can share one — two
 * brands' "Creatine Monohydrate" is an ordinary catalogue. So the products are
 * matched the way coverage itself matched them (the goal or slot, quiz-
 * offerable products only, in catalogue order) and each title is checked
 * against the product in the same place; a title that does not line up falls
 * back to the first product with that name, and failing that stays plain text
 * rather than linking to the wrong product.
 */
function namedProducts(item: CoverageItem, products: CatalogueProduct[]): Array<Named | string> {
  const [kind, key] = item.key.split(':') as [string, string]
  const offerable = products.filter((p) => !p.isSubscriptionOnly)
  const same = offerable.filter((p) =>
    kind === 'goal' ? (p.goals as string[]).includes(key) : (p.stackSlots as string[]).includes(key),
  )
  const firstByTitle = new Map<string, CatalogueProduct>()
  for (const p of products) if (!firstByTitle.has(p.title)) firstByTitle.set(p.title, p)
  return item.productTitles.map((title, i) => {
    const exact = same[i]?.title === title ? same[i] : firstByTitle.get(title)
    return exact ? { id: exact.id, title } : title
  })
}

function Group({
  title,
  subtitle,
  items,
  products,
}: {
  title: string
  subtitle: string
  items: CoverageItem[]
  products: CatalogueProduct[]
}) {
  const sorted = [...items].sort((a, b) => RANK[a.status] - RANK[b.status])
  return (
    <section style={{ marginBottom: 'var(--space-6)' }}>
      <h3 style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
        {title}
      </h3>
      <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginBottom: 'var(--space-3)' }}>{subtitle}</p>
      <ul className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
        {sorted.map((i) => (
          <Card as="li" key={i.key} solid padding="tight" tone={i.status === 'fail' ? 'critical' : undefined}>
            <div className="flex items-center justify-between" style={{ gap: 'var(--space-2)' }}>
              <div className="flex items-center min-w-0" style={{ gap: 'var(--space-2)' }}>
                <Badge tone={TONE[i.status]} dot>
                  {STATUS[i.status]}
                </Badge>
                <span className="truncate" style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
                  {i.label}
                </span>
              </div>
              <span className="shrink-0" style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
                {i.productCount} product{i.productCount === 1 ? '' : 's'} · {i.subscriptionCount} on subscription
              </span>
            </div>
            {i.note && (
              <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', marginTop: 'var(--space-2)', color: i.status === 'fail' ? 'var(--tone-critical)' : 'var(--ink-2)' }}>
                {i.note}
              </p>
            )}
            {i.productTitles.length > 0 && (
              <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
                {/* Each one opens at its quiz settings — goals and stack slots
                    are what put a product on this line, and where a founder
                    goes to move it onto another. */}
                {namedProducts(i, products).map((p, n) => (
                  <Fragment key={`${typeof p === 'string' ? p : p.id}-${n}`}>
                    {n > 0 && ', '}
                    {typeof p === 'string' ? (
                      p
                    ) : (
                      <Link href={productHref(p.id, 'quiz')} className="system-focus" style={{ color: 'var(--ink-2)', textDecoration: 'underline', borderRadius: 'var(--radius-chip)' }}>
                        {p.title}
                      </Link>
                    )}
                  </Fragment>
                ))}
              </p>
            )}
          </Card>
        ))}
      </ul>
    </section>
  )
}

export default function CoveragePage() {
  const [cov, setCov] = useState<CatalogueCoverage | null>(null)
  const [products, setProducts] = useState<CatalogueProduct[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    fetch('/api/portal/coverage', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) throw new Error('Your session has expired — sign in again to see coverage.')
        if (!r.ok) throw new Error(`The server answered with an error (HTTP ${r.status}).`)
        return r.json()
      })
      .then((d) => setCov(d.coverage))
      .catch((e: Error) => setError(e.message || 'Could not reach the server — check the connection.'))
    // The products on sale, the same list coverage is worked out from, so each
    // title can link to its product. Without it the titles are still shown.
    fetch('/api/portal/products', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { products?: Array<{ product: CatalogueProduct }> } | null) => {
        if (d?.products) setProducts(d.products.map((row) => row.product))
      })
      .catch(() => {})
  }, [])
  useEffect(load, [load])

  return (
    <div>
      <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)', marginBottom: 'var(--space-1)' }}>
        Coverage
      </h2>
      <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)', marginBottom: 'var(--space-5)' }}>
        Where the quiz can recommend something — does the range actually back it up? Open a product to change the
        goals and stack slots it covers.
      </p>

      {!cov ? (
        error ? (
          <EmptyState
            icon="alert-triangle"
            title="Coverage could not be worked out"
            action={
              <Button variant="secondary" size="sm" icon="refresh" onClick={load}>
                Try again
              </Button>
            }
          >
            {error}
          </EmptyState>
        ) : (
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>Loading…</p>
        )
      ) : (
        <>
          <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
            <Card elevation={2} className="text-center">
              <p style={{ fontSize: 'var(--text-display)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: cov.gaps > 0 ? 'var(--tone-critical)' : 'var(--tone-positive)' }}>{cov.gaps}</p>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>Gaps (nothing backs it)</p>
            </Card>
            <Card elevation={2} className="text-center">
              <p style={{ fontSize: 'var(--text-display)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: cov.thin > 0 ? 'var(--tone-attention)' : 'var(--tone-positive)' }}>{cov.thin}</p>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>Thin (1 product / no subscription)</p>
            </Card>
          </div>

          <Group title="Goals" subtitle="Every outcome the quiz can target." items={cov.goals} products={products} />
          <Group title="Stack slots" subtitle="Every functional job a stack can include." items={cov.slots} products={products} />
        </>
      )}
    </div>
  )
}
