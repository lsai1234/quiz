'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { ResolvedBundle } from '@/lib/bundles/resolve'
import { bundleSlug } from '@/lib/bundles/resolve'
import type { BundlePriceSummary } from '@/lib/bundles/pricing'
import type { BundleReadiness, CheckStatus } from '@/lib/bundles/readiness'
import { formatGBP } from '@/lib/stack-blueprint/pricing'

const DOT: Record<CheckStatus, string> = { ok: '#34d399', warn: '#fbbf24', fail: '#f87171' }

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
        <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Bundles</h1>
        <Link
          href="/portal/bundles/new"
          className="text-xs font-bold px-3 py-2 rounded-xl bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          + New bundle
        </Link>
      </div>
      <p className="text-[11px] text-[var(--color-muted)] mb-4">
        Prebuilt bundles shown in the shop, top to bottom. Reorder, publish, edit or remove them.
      </p>

      {error && (
        <div className="mb-3 rounded-xl border border-[var(--color-red)]/30 bg-[var(--color-red)]/8 px-4 py-2.5 text-xs text-[var(--color-red)]">
          {error}
        </div>
      )}

      {rows === null ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        <div className="space-y-2">
          {visible.map((row, i) => {
            const { bundle, price, readiness } = row
            const isOpen = expanded === bundle.slug
            return (
              <div key={bundle.slug} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: DOT[readiness.overall] }} />
                        <p className="text-sm font-bold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{bundle.name}</p>
                        {!bundle.published && (
                          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full" style={{ color: 'var(--color-muted)', border: '1px solid var(--color-border-2)' }}>Draft</span>
                        )}
                        {bundle.custom && (
                          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full" style={{ color: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}>Custom</span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--color-muted)] mt-1">
                        {bundle.seriesName} · {formatGBP(price.price)}
                        {price.saving > 0 && ` · save ${formatGBP(price.saving)}`} · {bundle.blueprint.slots.length} products
                        {!readiness.sellable && ' · ⚠ product unavailable'}
                      </p>
                    </div>

                    {/* Reorder */}
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button onClick={() => move(bundle.slug, -1)} disabled={i === 0 || !!busy} aria-label="Move up" className="w-7 h-6 rounded-lg text-xs disabled:opacity-30" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>↑</button>
                      <button onClick={() => move(bundle.slug, 1)} disabled={i === visible.length - 1 || !!busy} aria-label="Move down" className="w-7 h-6 rounded-lg text-xs disabled:opacity-30" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>↓</button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button
                      onClick={() => post({ action: 'publish', slug: bundle.slug, published: !bundle.published })}
                      disabled={!!busy}
                      className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg"
                      style={{
                        background: bundle.published ? 'var(--color-surface-2)' : 'var(--color-accent)',
                        color: bundle.published ? 'var(--color-muted)' : 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        fontFamily: 'var(--font-display)',
                      }}
                    >
                      {bundle.published ? 'Unpublish' : 'Publish'}
                    </button>
                    <Link href={`/portal/bundles/${bundle.slug}`} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-display)' }}>Edit</Link>
                    <Link href={`/bundles/${bundle.slug}`} target="_blank" className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-display)' }}>Preview ↗</Link>
                    <button onClick={() => duplicate(bundle.slug, bundle.name)} disabled={!!busy} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-display)' }}>Duplicate</button>
                    <button onClick={() => setExpanded(isOpen ? null : bundle.slug)} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>{isOpen ? 'Hide checks' : 'Checks'}</button>
                    <div className="flex-1" />
                    <button onClick={() => remove(bundle.slug, bundle.name)} disabled={!!busy} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-red)', fontFamily: 'var(--font-display)' }}>Remove</button>
                    {bundle.custom && (
                      <button onClick={() => del(bundle.slug, bundle.name)} disabled={!!busy} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-red)', fontFamily: 'var(--font-display)' }}>Delete</button>
                    )}
                  </div>

                  {isOpen && (
                    <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
                      {readiness.checks.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 text-[11px]">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DOT[c.status] }} />
                          <span className="text-[var(--color-text-2)] font-semibold">{c.label}</span>
                          {c.detail && <span className="text-[var(--color-muted)]">— {c.detail}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {visible.length === 0 && <p className="text-sm text-[var(--color-muted)] text-center py-8">No bundles yet.</p>}

          {/* Removed bundles — restorable */}
          {removed.length > 0 && (
            <div className="mt-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-muted)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>Removed</p>
              <div className="space-y-2">
                {removed.map(({ bundle }) => (
                  <div key={bundle.slug} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-[var(--color-muted)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{bundle.name}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => post({ action: 'restore', slug: bundle.slug })} disabled={!!busy} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}>Restore</button>
                      {bundle.custom && (
                        <button onClick={() => del(bundle.slug, bundle.name)} disabled={!!busy} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-red)', fontFamily: 'var(--font-display)' }}>Delete</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
