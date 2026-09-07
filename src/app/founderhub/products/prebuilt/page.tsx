'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { ProductBundle } from '@/lib/bundles'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { Badge, Button, Card, buttonSurface } from '@/components/system'

interface Usage {
  slug: string
  price: number
  subscriptionPrice: number
  missing: string[]
  usedBy: string[]
}

/**
 * Pre-built bundles — the stacks, on their own screen.
 *
 * There are two of them and there is no landing page for either: a pre-built
 * bundle is products and the reasons they are together, and a workout bundle
 * wraps one in a name, a photograph and a session. Keeping them apart is what
 * lets one stack serve every package built on it — edit Strength once and every
 * session selling it ships the new stack.
 *
 * The column that matters is the last one: who is selling this. A stack nobody
 * sells is a draft; a stack four packages sell is four shop cards that change
 * when it does.
 */
export default function PrebuiltBundlesPage() {
  const [bundles, setBundles] = useState<ProductBundle[] | null>(null)
  const [usage, setUsage] = useState<Usage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/portal/product-bundles')
      .then((r) => r.json())
      .then((d: { bundles?: ProductBundle[]; usage?: Usage[] }) => {
        setBundles(d.bundles ?? [])
        setUsage(d.usage ?? [])
      })
      .catch(() => setBundles([]))
  }, [])
  useEffect(load, [load])

  async function remove(slug: string, name: string) {
    setBusy(slug)
    setError(null)
    try {
      const res = await fetch('/api/portal/product-bundles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const data = await res.json()
      // The store refuses while a package still sells it, and names them — that
      // message is more useful than anything this screen could invent.
      if (!res.ok) setError(data.error ?? `Could not delete ${name}`)
      else load()
    } catch {
      setError('Unable to reach the server')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
            Pre-built bundles
          </h2>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
            The stacks. A workout bundle sells one of these, so a product changed here changes every package
            that sells it.
          </p>
        </div>
        <Link href="/founderhub/products/prebuilt/new" {...buttonSurface('primary', 'sm')}>
          New stack
        </Link>
      </div>

      {error && (
        <Card tone="critical" padding="tight" className="mb-3">
          <p role="status" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--tone-critical)' }}>{error}</p>
        </Card>
      )}

      {bundles === null ? (
        <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>Loading…</p>
      ) : bundles.length === 0 ? (
        <Card elevation={1} className="space-y-2">
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>No stacks yet.</p>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
            Build the two you sell — one around strength, one around fitness — and then point each workout
            bundle at whichever it belongs to. Until a package points at a stack it has no products, so the
            shop leaves it off the shelf.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {bundles.map((bundle) => {
            const use = usage.find((u) => u.slug === bundle.slug)
            return (
              <Card as="li" key={bundle.slug} solid padding="none">
                <div className="flex items-center justify-between gap-2" style={{ padding: 'var(--space-3)' }}>
                  <Link href={`/founderhub/products/prebuilt/${bundle.slug}`} className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className="truncate"
                        style={{ fontSize: 'var(--text-body-sm)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}
                      >
                        {bundle.name}
                      </span>
                      {use && use.missing.length > 0 && (
                        <Badge tone="critical" dot>{use.missing.length} unavailable</Badge>
                      )}
                    </span>
                    <span className="block" style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
                      {bundle.blueprint.slots.length} product{bundle.blueprint.slots.length === 1 ? '' : 's'}
                      {use ? ` · ${formatGBP(use.price)}` : ''}
                      {use && use.usedBy.length > 0
                        ? ` · sold by ${use.usedBy.join(', ')}`
                        : ' · not sold by any workout bundle yet'}
                    </span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    aria-label={`Delete ${bundle.name}`}
                    loading={busy === bundle.slug}
                    onClick={() => remove(bundle.slug, bundle.name)}
                  />
                </div>
              </Card>
            )
          })}
        </ul>
      )}
    </div>
  )
}
