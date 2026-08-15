'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { PriceGroupImpact } from '@/lib/changes/price'


type Group = PriceGroupImpact & { suggestedPassOnPct: number | null; noticeDays: number }

const pct = (n: number) => `${Math.round(n * 100)}%`

/**
 * Supplier price moves, one card per product.
 *
 * Deliberately shows both outcomes at once rather than making the founder pick
 * blind and find out after: what the margin becomes if we swallow it, what each
 * member pays if we don't. Absorb is one click because it's the safe default;
 * passing on takes a share and a confirmation, because it moves someone's bill.
 */
export function PriceChanges() {
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [shares, setShares] = useState<Record<string, number>>({})

  const load = useCallback(() => {
    fetch('/api/portal/changes/price')
      .then((r) => r.json())
      .then((d) => setGroups(d.groups ?? []))
      .catch(() => setGroups([]))
  }, [])

  useEffect(() => load(), [load])

  const act = useCallback(
    async (productId: string, action: 'absorb' | 'pass-on', passOnPct?: number) => {
      setBusy(productId)
      setNote(null)
      const res = await fetch('/api/portal/changes/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, action, passOnPct }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setNote(
          action === 'absorb'
            ? `Absorbed for ${d.resolved} member${d.resolved === 1 ? '' : 's'} — nobody's price moved.`
            : `Scheduled for ${d.scheduled} member${d.scheduled === 1 ? '' : 's'}, ${d.notified} notice${d.notified === 1 ? '' : 's'} sent. Takes effect ${d.effectiveFrom ? new Date(d.effectiveFrom).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : 'after notice'}.`,
        )
        load()
      }
      setBusy(null)
    },
    [load],
  )

  if (!groups) return <p className="text-sm text-[var(--ink-3)]">Loading…</p>
  if (groups.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-3)] py-6 text-center">
        No supplier price moves outstanding.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {note && <p className="text-xs" style={{ color: 'var(--accent)' }}>{note}</p>}

      {groups.map((g) => {
        const share = shares[g.productId] ?? g.suggestedPassOnPct ?? 1
        const rising = g.move.wholesaleDeltaPct > 0
        return (
          <div
            key={g.productId}
            className="rounded-2xl border p-4"
            style={{
              background: 'var(--surface-1)',
              borderColor: g.absorbLosesMoney
                ? `color-mix(in srgb, var(--tone-critical) 45%, transparent)`
                : `var(--attention-line)`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                  {g.productTitle}
                </p>
                <p className="text-[11px] text-[var(--ink-3)]">
                  SKU {g.sku ?? '—'} · cost {formatGBP(g.currentCost)} → {formatGBP(g.newCost)} (
                  {rising ? '+' : ''}{pct(g.move.wholesaleDeltaPct)}) · {g.affectedCount} member
                  {g.affectedCount === 1 ? '' : 's'}
                </p>
              </div>
              <span
                className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
                style={{ color: rising ? 'var(--tone-attention)' : 'var(--accent)', background: `color-mix(in srgb, ${rising ? 'var(--tone-attention)' : 'var(--accent)'} 14%, transparent)` }}
              >
                {rising ? 'Cost up' : 'Cost down'}
              </span>
            </div>

            {/* Both sides of the call, side by side. */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-3)] mb-1">If you absorb it</p>
                <p className="text-sm font-black" style={{ color: g.absorbLosesMoney ? 'var(--tone-critical)' : g.absorbBreachesFloor ? 'var(--tone-attention)' : 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
                  {pct(g.marginIfAbsorbed)} margin
                </p>
                <p className="text-[11px] text-[var(--ink-3)] mt-0.5">was {pct(g.marginNow)} · nobody&apos;s price moves</p>
                {g.absorbLosesMoney && (
                  <p className="text-[11px] font-semibold mt-1" style={{ color: 'var(--tone-critical)' }}>You&apos;d sell at a loss.</p>
                )}
                {!g.absorbLosesMoney && g.absorbBreachesFloor && (
                  <p className="text-[11px] font-semibold mt-1" style={{ color: 'var(--tone-attention)' }}>Below your margin floor.</p>
                )}
              </div>

              <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-3)] mb-1">If you pass on {pct(share)}</p>
                <p className="text-sm font-black" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
                  {formatGBP(g.passOnUnitPrice)} list
                </p>
                <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                  was {formatGBP(g.currentUnitPrice)} · {g.totalMonthlyDelta >= 0 ? '+' : ''}
                  {formatGBP(g.totalMonthlyDelta)}/mo across everyone
                </p>
              </div>
            </div>

            {g.suggestedPassOnPct !== null && (
              <p className="text-[11px] mt-2" style={{ color: 'var(--accent)' }}>
                Passing on {pct(g.suggestedPassOnPct)} is the least that keeps this above your floor.
              </p>
            )}

            {/* Per-member, because they're on different rates and quantities —
                a blended figure would hide the outlier worth seeing. */}
            {g.members.length > 0 && (
              <div className="mt-3 space-y-1">
                {g.members.slice(0, 5).map((m) => (
                  <p key={m.eventId} className="text-[11px] text-[var(--ink-3)]">
                    {m.email ?? m.userId} · {formatGBP(m.monthlyBefore)} → {formatGBP(m.monthlyAfter)}/mo
                    {m.monthlyDelta !== 0 && ` (${m.monthlyDelta > 0 ? '+' : ''}${formatGBP(m.monthlyDelta)})`}
                  </p>
                ))}
                {g.members.length > 5 && (
                  <p className="text-[11px] text-[var(--ink-3)]">…and {g.members.length - 5} more.</p>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => act(g.productId, 'absorb')}
                disabled={busy !== null}
                className="text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-40"
                style={{ background: 'var(--accent)', color: 'var(--ink-on-accent)' }}
              >
                {busy === g.productId ? 'Working…' : 'Absorb it'}
              </button>

              <div className="flex items-center gap-2">
                <input
                  type="range" min={0} max={100} step={5}
                  value={Math.round(share * 100)}
                  onChange={(e) => setShares({ ...shares, [g.productId]: Number(e.target.value) / 100 })}
                  className="w-28"
                  style={{ accentColor: 'var(--accent)' }}
                  aria-label="Share to pass on"
                />
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        `Pass ${pct(share)} of this on to ${g.affectedCount} member${g.affectedCount === 1 ? '' : 's'}?\n\nThey'll be emailed now and the new price starts after ${g.noticeDays} days' notice. They can cancel free in the meantime.`,
                      )
                    ) {
                      act(g.productId, 'pass-on', share)
                    }
                  }}
                  disabled={busy !== null}
                  className="text-xs font-bold px-3 py-2 rounded-xl border disabled:opacity-40"
                  style={{ borderColor: 'var(--edge)', color: 'var(--ink-2)' }}
                >
                  Pass on {pct(share)}
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
