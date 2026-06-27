'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { skipCredit, oneOffUnitPrice } from '@/lib/recharge/schedule'
import type { Delivery, DeliveryItem } from '@/lib/recharge/schedule'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'

interface Props {
  subscription: MemberSubscription
  delivery: Delivery
  catalogue: CatalogueProduct[]
  onSkip: () => void
  onUnskip: () => void
  onReschedule: (date: Date) => void
  onAddItem: (product: CatalogueProduct) => void
  onRemoveItem: (item: DeliveryItem) => void
  onClose: () => void
}

function fmtLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}
function toInputDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function DeliveryDetailSheet({ subscription, delivery, catalogue, onSkip, onUnskip, onReschedule, onAddItem, onRemoveItem, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const inBox = useMemo(() => new Set(delivery.items.map((it) => it.productId)), [delivery.items])
  const addable = useMemo(
    () => catalogue.filter((p) => p.subscriptionEligible && !p.isSubscriptionOnly && !inBox.has(p.id)),
    [catalogue, inBox],
  )

  if (!mounted) return null

  const skipped = delivery.status === 'skipped'
  const credit = skipCredit(delivery)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(0,0,0,0.72)' }}
    >
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col" style={{ background: 'var(--color-surface)', maxHeight: '92dvh' }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border-2)]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 flex items-start justify-between gap-3 flex-shrink-0 border-b border-[var(--color-border)]">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase mb-0.5" style={{ color: skipped ? AMBER : ACCENT, fontFamily: 'var(--font-display)' }}>
              {skipped ? 'Skipped delivery' : delivery.isNext ? 'Next delivery' : 'Upcoming delivery'}
            </p>
            <h3 className="text-lg font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{fmtLong(delivery.date)}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-muted)] bg-[var(--color-surface-2)] active:scale-90 flex-shrink-0 mt-0.5" aria-label="Close">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Items in this box */}
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              In this box {delivery.items.length > 0 && `· ${delivery.items.length}`}
            </p>
            {delivery.items.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)] py-4 text-center">Nothing ships in this box.</p>
            ) : (
              <div className="space-y-2">
                {delivery.items.map((it, i) => (
                  <div key={`${it.productId}-${i}`} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{it.productTitle}</p>
                      <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                        {it.slotTitle}{it.units > 1 ? ` · ${it.units}×` : ''}{it.oneOff ? ' · one-off' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-black" style={{ color: it.oneOff ? GREEN : ACCENT, fontFamily: 'var(--font-display)' }}>{formatGBP(it.price)}</span>
                      <button onClick={() => onRemoveItem(it)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] active:scale-90" aria-label={`Remove ${it.productTitle}`}>−</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {delivery.oneOffTotal > 0.01 && (
              <p className="text-[11px] text-[var(--color-muted)] mt-2">Includes {formatGBP(delivery.oneOffTotal)} of one-off extras, charged with this box.</p>
            )}
          </div>

          {/* Add to this box */}
          <div>
            {!adding ? (
              <button onClick={() => setAdding(true)} className="w-full py-3 rounded-xl text-sm font-bold active:scale-95 transition-all"
                style={{ background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT, fontFamily: 'var(--font-display)' }}>
                + Add something to this box
              </button>
            ) : (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Add a one-off (full price, just this box)</p>
                  <button onClick={() => setAdding(false)} className="text-xs text-[var(--color-muted)]">Done</button>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {addable.map((p) => (
                    <button key={p.id} onClick={() => { onAddItem(p); setAdding(false) }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left active:scale-[0.98] transition-all"
                      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                      <span className="text-sm font-semibold text-[var(--color-text)] truncate">{p.title}</span>
                      <span className="text-xs font-bold flex-shrink-0" style={{ color: GREEN }}>+{formatGBP(oneOffUnitPrice(p))}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Move this delivery */}
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>Move this delivery</p>
            <div className="flex gap-2 mb-2">
              <button onClick={() => onReschedule(addDays(delivery.date, -7))} className="flex-1 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all"
                style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}>← A week earlier</button>
              <button onClick={() => onReschedule(addDays(delivery.date, 7))} className="flex-1 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all"
                style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}>A week later →</button>
            </div>
            <label className="flex items-center justify-between gap-2 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 py-2.5">
              <span className="text-xs font-semibold text-[var(--color-text-2)]">Pick a date</span>
              <input type="date" value={toInputDate(delivery.date)} onChange={(e) => { if (e.target.value) onReschedule(new Date(e.target.value)) }}
                className="bg-transparent text-sm text-[var(--color-text)] outline-none" />
            </label>
          </div>

          {/* Skip / unskip */}
          {skipped ? (
            <button onClick={onUnskip} className="w-full py-3 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
              Restore this delivery
            </button>
          ) : (
            <button onClick={onSkip} className="w-full py-3 rounded-2xl text-sm font-semibold active:scale-95 transition-all"
              style={{ border: `1px solid color-mix(in srgb, ${AMBER} 35%, transparent)`, color: AMBER, fontFamily: 'var(--font-display)' }}>
              Skip this box{credit > 0 ? ` · credit ${formatGBP(credit)}` : ''}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function addDays(iso: string, days: number): Date {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  const today = new Date()
  return d < today ? today : d
}
