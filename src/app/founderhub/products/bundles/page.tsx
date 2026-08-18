'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { ResolvedBundle } from '@/lib/bundles/resolve'
import { bundleSlug } from '@/lib/bundles/resolve'
import type { BundlePriceSummary } from '@/lib/bundles/pricing'
import type { BundleReadiness, CheckStatus } from '@/lib/bundles/readiness'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { Badge, Button, Card, buttonSurface } from '@/components/system'

/** Readiness status → the system's semantic tone. `Badge` owns the colours. */
const TONE: Record<CheckStatus, 'positive' | 'attention' | 'critical'> = { ok: 'positive', warn: 'attention', fail: 'critical' }

interface Row {
  bundle: ResolvedBundle
  price: BundlePriceSummary
  readiness: BundleReadiness
}

export default function PortalBundlesPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/portal/bundles')
      .then((r) => r.json())
      .then((d) => setRows(d.bundles ?? []))
      .catch(() => setRows([]))
  }, [])
  useEffect(load, [load])

  const post = useCallback(
    async (body: Record<string, unknown>, method: 'POST' | 'DELETE' = 'POST') => {
      setBusy(JSON.stringify(body))
      setError(null)
      try {
        const res = await fetch('/api/portal/bundles', {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) setError(data.error ?? 'Something went wrong')
        else load()
      } catch {
        setError('Unable to reach the server')
      } finally {
        setBusy(null)
      }
    },
    [load],
  )

  const visible = (rows ?? []).filter((r) => !r.bundle.removed)
  const removed = (rows ?? []).filter((r) => r.bundle.removed)

  const move = (slug: string, dir: -1 | 1) => {
    const order = visible.map((r) => r.bundle.slug)
    const i = order.indexOf(slug)
    const j = i + dir
    if (i === -1 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    post({ action: 'reorder', slugs: order })
  }

  const duplicate = (slug: string, name: string) => {
    const newName = window.prompt(`Duplicate "${name}" as a new draft. Name it:`, `${name} Copy`)
    if (!newName?.trim()) return
    post({ action: 'duplicate', slug, newSlug: bundleSlug(newName), newName: newName.trim() })
  }

  const remove = (slug: string, name: string) => {
    if (window.confirm(`Hide "${name}" from the shop? You can restore it later.`)) post({ action: 'remove', slug })
  }

  const del = (slug: string, name: string) => {
    if (window.confirm(`Permanently delete "${name}"? This cannot be undone.`)) post({ slug }, 'DELETE')
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
          Bundles
        </h2>
        {/* A link, not a button: it goes somewhere, and someone expecting to
            middle-click it should be able to. */}
        <Link href="/founderhub/products/bundles/new" {...buttonSurface('primary', 'sm')}>
          New bundle
        </Link>
      </div>
      <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginBottom: 'var(--space-4)' }}>
        Prebuilt bundles shown in the shop, top to bottom. Reorder, publish, edit or remove them.
      </p>

      {error && (
        <div className="mb-3">
          <Card tone="critical" padding="tight">
            <p role="status" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--tone-critical)' }}>
              {error}
            </p>
          </Card>
        </div>
      )}

      {rows === null ? (
        <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>Loading…</p>
      ) : (
        <div className="space-y-2">
          {visible.map((row, i) => {
            const { bundle, price, readiness } = row
            const isOpen = expanded === bundle.slug
            return (
              <Card key={bundle.slug} solid>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="truncate" style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
                          {bundle.name}
                        </p>
                        {readiness.overall !== 'ok' && (
                          <Badge tone={TONE[readiness.overall]} dot>
                            {readiness.overall === 'fail' ? 'Not ready' : 'Needs a look'}
                          </Badge>
                        )}
                        {!bundle.published && <Badge>Draft</Badge>}
                        {bundle.custom && <Badge tone="accent">Custom</Badge>}
                      </div>
                      <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
                        {bundle.seriesName} · {formatGBP(price.price)}
                        {price.saving > 0 && ` · save ${formatGBP(price.saving)}`} · {bundle.blueprint.slots.length} products
                        {!readiness.sellable && ' · product unavailable'}
                      </p>
                    </div>

                    {/* Reorder. Named per bundle: a page of twenty rows all
                        offering "Move up" is a list nobody can navigate. */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="chevron-up"
                        aria-label={`Move ${bundle.name} up`}
                        onClick={() => move(bundle.slug, -1)}
                        disabled={i === 0 || !!busy}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="chevron-down"
                        aria-label={`Move ${bundle.name} down`}
                        onClick={() => move(bundle.slug, 1)}
                        disabled={i === visible.length - 1 || !!busy}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Button
                      size="sm"
                      variant={bundle.published ? 'secondary' : 'primary'}
                      disabled={!!busy}
                      aria-label={bundle.published ? `Unpublish ${bundle.name}` : `Publish ${bundle.name}`}
                      onClick={() => post({ action: 'publish', slug: bundle.slug, published: !bundle.published })}
                    >
                      {bundle.published ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Link
                      href={`/founderhub/products/bundles/${bundle.slug}`}
                      aria-label={`Edit ${bundle.name}`}
                      {...buttonSurface('secondary', 'sm')}
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/bundles/${bundle.slug}`}
                      target="_blank"
                      aria-label={`Preview ${bundle.name} in a new tab`}
                      {...buttonSurface('secondary', 'sm')}
                    >
                      Preview
                    </Link>
                    <Button size="sm" disabled={!!busy} aria-label={`Duplicate ${bundle.name}`} onClick={() => duplicate(bundle.slug, bundle.name)}>
                      Duplicate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Hide' : 'Show'} readiness checks for ${bundle.name}`}
                      onClick={() => setExpanded(isOpen ? null : bundle.slug)}
                    >
                      {isOpen ? 'Hide checks' : 'Checks'}
                    </Button>
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" disabled={!!busy} aria-label={`Remove ${bundle.name} from the shop`} onClick={() => remove(bundle.slug, bundle.name)}>
                      Remove
                    </Button>
                    {bundle.custom && (
                      // Destructive, because it is: remove hides, delete cannot
                      // be undone, and the two used to look identical.
                      <Button variant="destructive" size="sm" disabled={!!busy} aria-label={`Permanently delete ${bundle.name}`} onClick={() => del(bundle.slug, bundle.name)}>
                        Delete
                      </Button>
                    )}
                  </div>

                  {isOpen && (
                    <ul className="mt-3 pt-3 space-y-1.5" style={{ borderTop: '1px solid var(--edge)' }}>
                      {readiness.checks.map((c) => (
                        <li key={c.id} className="flex items-center gap-2" style={{ fontSize: 'var(--text-meta)' }}>
                          <Badge tone={TONE[c.status]} dot>
                            {c.label}
                          </Badge>
                          {c.detail && <span style={{ color: 'var(--ink-3)' }}>{c.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
              </Card>
            )
          })}
          {visible.length === 0 && (
            <p className="text-center" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)', padding: 'var(--space-8) 0' }}>
              No bundles yet.
            </p>
          )}

          {/* Removed bundles — restorable */}
          {removed.length > 0 && (
            <div className="mt-6">
              <p style={{ fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 'var(--space-2)' }}>
                Removed
              </p>
              <div className="space-y-2">
                {removed.map(({ bundle }) => (
                  <Card key={bundle.slug} solid className="flex items-center justify-between gap-3">
                    <p className="truncate" style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-3)' }}>
                      {bundle.name}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="primary" size="sm" disabled={!!busy} aria-label={`Restore ${bundle.name}`} onClick={() => post({ action: 'restore', slug: bundle.slug })}>
                        Restore
                      </Button>
                      {bundle.custom && (
                        <Button variant="destructive" size="sm" disabled={!!busy} aria-label={`Permanently delete ${bundle.name}`} onClick={() => del(bundle.slug, bundle.name)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
