'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { skipCredit, oneOffUnitPrice } from '@/lib/recharge/schedule'
import { projectedEconomics } from '@/lib/recharge/mock'
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
  /** Add a one-off of a product to this box only. */
  onAddItem: (product: CatalogueProduct) => void
  /** Add a product to the recurring plan (every delivery). */
  onAddRecurring: (product: CatalogueProduct) => void
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

export function DeliveryDetailSheet({ subscription, delivery, catalogue, onSkip, onUnskip, onReschedule, onAddItem, onAddRecurring, onRemoveItem, onClose }: Props) {
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

  const recurringIds = useMemo(() => new Set(subscription.lines.map((l) => l.productId)), [subscription.lines])
  const addable = useMemo(
    () => catalogue.filter((p) => p.subscriptionEligible && !p.isSubscriptionOnly && !recurringIds.has(p.id)),
    [catalogue, recurringIds],
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
          <IconButton icon="x" label="Close" size="sm" filled onClick={onClose} className="mt-0.5" />
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
                      <IconButton icon="dash" label={`Remove ${it.productTitle}`} size="sm" filled onClick={() => onRemoveItem(it)} />
                      {(() => { const prod = catalogue.find((p) => p.id === it.productId); return prod ? (
                        <IconButton
                          icon="plus"
                          label={`Add an extra ${it.productTitle} to this box`}
                          size="sm"
                          onClick={() => onAddItem(prod)}
                          color="var(--color-bg)"
                          className="bg-[var(--color-accent)]"
                        />
                      ) : null })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-[var(--color-muted)] mt-2 leading-relaxed">
              This {formatGBP(delivery.total - delivery.oneOffTotal)} of regular items isn’t a separate charge — it’s part of your flat {formatGBP(subscription.flatMonthly)}/mo.
              {delivery.oneOffTotal > 0.01 && <> One-off extras (<span style={{ color: GREEN }}>{formatGBP(delivery.oneOffTotal)}</span>) are added on top of that month’s bill.</>}
            </p>
          </div>

          {/* Add to this box */}
          <div>
            {!adding ? (
              <button onClick={() => setAdding(true)} className="w-full py-3 rounded-xl text-sm font-bold active:scale-95 transition-all inline-flex items-center justify-center gap-1.5"
                style={{ background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT, fontFamily: 'var(--font-display)' }}>
                <Icon name="plus" size={15} />
                Add something to this box
              </button>
            ) : (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Add a product</p>
                  <button onClick={() => setAdding(false)} className="text-xs text-[var(--color-muted)]">Done</button>
                </div>
                <p className="text-[11px] text-[var(--color-muted)] mb-2">Just this box (one-off, full price) or every delivery (joins your plan & spreads the cost).</p>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {addable.map((p) => {
                    const econ = projectedEconomics(p)
                    return (
                      <div key={p.id} className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3">
                        <p className="text-sm font-semibold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{p.title}</p>
                        {econ.discountPct > 0 && (
                          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                            <span className="line-through">{formatGBP(econ.listUnit)}</span> {formatGBP(econ.discountedUnit)} · save {econ.discountPct}% on plan
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <button onClick={() => { onAddItem(p); setAdding(false) }} className="py-2 rounded-lg text-xs font-bold active:scale-95 transition-all" style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}>
                            Just this box · +{formatGBP(oneOffUnitPrice(p))}
                          </button>
                          <button onClick={() => { onAddRecurring(p); setAdding(false) }} className="py-2 rounded-lg text-xs font-bold active:scale-95 transition-all" style={{ background: ACCENT, color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}>
                            Every delivery · +{formatGBP(econ.perMonth)}/mo
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Move this delivery */}
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>Move this delivery</p>
            <div className="flex gap-2 mb-2">
              <Button size="sm" icon="arrow-left" fullWidth onClick={() => onReschedule(addDays(delivery.date, -7))}>
                A week earlier
              </Button>
              <Button size="sm" iconRight="arrow-right" fullWidth onClick={() => onReschedule(addDays(delivery.date, 7))}>
                A week later
              </Button>
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
            <div>
              <button onClick={onSkip} className="w-full py-3 rounded-2xl text-sm font-semibold active:scale-95 transition-all"
                style={{ border: `1px solid color-mix(in srgb, ${AMBER} 35%, transparent)`, color: AMBER, fontFamily: 'var(--font-display)' }}>
                Skip this box{credit > 0 ? ` · credit ${formatGBP(credit)}` : ''}
              </button>
              <p className="text-[11px] text-[var(--color-muted)] mt-2 text-center leading-relaxed">
                You won’t be charged for it, and it won’t use up a month — your plan simply moves back a month.
              </p>
            </div>
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
