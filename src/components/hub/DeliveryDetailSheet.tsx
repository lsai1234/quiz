'use client'

import { useMemo, useState } from 'react'
import { IconButton } from '@/components/ui/IconButton'
import { Sheet, SheetBody, SheetHeader } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { GLASS } from '@/lib/ui/tokens'
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
  const [adding, setAdding] = useState(false)

  const recurringIds = useMemo(() => new Set(subscription.lines.map((l) => l.productId)), [subscription.lines])
  const addable = useMemo(
    () => catalogue.filter((p) => p.subscriptionEligible && !p.isSubscriptionOnly && !recurringIds.has(p.id)),
    [catalogue, recurringIds],
  )

  const skipped = delivery.status === 'skipped'
  const credit = skipCredit(delivery)

  return (
    <Sheet onClose={onClose}>
        {/* Header */}
      <SheetHeader
        eyebrow={skipped ? 'Skipped delivery' : delivery.isNext ? 'Next delivery' : 'Upcoming delivery'}
        eyebrowColor={skipped ? AMBER : ACCENT}
        title={fmtLong(delivery.date)}
      />

      <SheetBody className="space-y-5">
        {/* Items in this box */}
        <div>
          <Eyebrow className="mb-2">In this box {delivery.items.length > 0 && `· ${delivery.items.length}`}</Eyebrow>
          {delivery.items.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)] py-4 text-center">Nothing ships in this box.</p>
          ) : (
            <div className="space-y-2">
              {delivery.items.map((it, i) => (
                <div key={`${it.productId}-${i}`} className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: GLASS.surface, border: `1px solid ${GLASS.hairline}` }}>
                  <ProductTile imageUrl={catalogue.find((p) => p.id === it.productId)?.imageUrl} slot={catalogue.find((p) => p.id === it.productId)?.stackSlots[0]} title={it.productTitle} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{it.productTitle}</p>
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
            <div className="rounded-2xl p-3" style={{ background: GLASS.raised, border: `1px solid ${GLASS.hairline}` }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Add a product</p>
                <button onClick={() => setAdding(false)} className="text-xs text-[var(--color-muted)]">Done</button>
              </div>
              <p className="text-[11px] text-[var(--color-muted)] mb-2">Just this box (one-off, full price) or every delivery (joins your plan & spreads the cost).</p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {addable.map((p) => {
                  const econ = projectedEconomics(p)
                  return (
                    <div key={p.id} className="rounded-xl p-3" style={{ background: GLASS.surface, border: `1px solid ${GLASS.hairline}` }}>
                      <div className="flex items-center gap-2.5">
                        <ProductTile imageUrl={p.imageUrl} slot={p.stackSlots[0]} title={p.title} size={36} />
                        <p className="text-sm font-medium text-[var(--color-text)] truncate flex-1" style={{ fontFamily: 'var(--font-display)' }}>{p.title}</p>
                      </div>
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
          <Eyebrow className="mb-2">Move this delivery</Eyebrow>
          <div className="flex gap-2 mb-2">
            <Button size="sm" icon="arrow-left" fullWidth onClick={() => onReschedule(addDays(delivery.date, -7))}>
              A week earlier
            </Button>
            <Button size="sm" iconRight="arrow-right" fullWidth onClick={() => onReschedule(addDays(delivery.date, 7))}>
              A week later
            </Button>
          </div>
          {/* The native picker still opens; what changed is that the row it
              opens from is drawn rather than left to the browser. */}
          <label
            className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 min-h-11 cursor-pointer transition-colors duration-200"
            style={{ background: GLASS.surface, border: `1px solid ${GLASS.hairline}` }}
          >
            <Icon name="calendar" size={16} className="text-[var(--color-muted)] shrink-0" />
            <span className="text-xs font-semibold text-[var(--color-text-2)] flex-1">Pick a date</span>
            <input
              type="date"
              value={toInputDate(delivery.date)}
              onChange={(e) => { if (e.target.value) onReschedule(new Date(e.target.value)) }}
              className="bg-transparent text-sm text-[var(--color-text)] outline-none text-right"
              style={{ colorScheme: 'dark' }}
            />
          </label>
        </div>

        {/* Skip / unskip */}
        {skipped ? (
          <Button variant="primary" icon="refresh" onClick={onUnskip}>Restore this delivery</Button>
        ) : (
          <div>
            <Button variant="tone" tone={AMBER} icon="skip-forward" onClick={onSkip}>
              Skip this box{credit > 0 ? ` · credit ${formatGBP(credit)}` : ''}
            </Button>
            <p className="text-[11px] text-[var(--color-muted)] mt-2 text-center leading-relaxed">
              You won’t be charged for it, and it won’t use up a month — your plan simply moves back a month.
            </p>
          </div>
        )}
      </SheetBody>
    </Sheet>
  )
}

function addDays(iso: string, days: number): Date {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  const today = new Date()
  return d < today ? today : d
}
