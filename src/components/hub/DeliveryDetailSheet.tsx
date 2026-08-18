'use client'

import { useMemo, useState } from 'react'
import { Eyebrow } from './Eyebrow'
import { Button, EmptyState, Input, Modal, ModalBody, ModalHeader } from '@/components/system'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { Icon } from '@/components/ui/Icon'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { skipCredit, oneOffUnitPrice } from '@/lib/recharge/schedule'
import { projectedEconomics } from '@/lib/recharge/mock'
import type { Delivery, DeliveryItem } from '@/lib/recharge/schedule'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

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
    <Modal onClose={onClose} presentation="sheet">
        {/* Header */}
      <ModalHeader
        eyebrow={skipped ? 'Skipped delivery' : delivery.isNext ? 'Next delivery' : 'Upcoming delivery'}
        title={fmtLong(delivery.date)}
      />

      <ModalBody className="space-y-5">
        {/* Items in this box */}
        <div>
          <Eyebrow className="mb-2">In this box {delivery.items.length > 0 && `· ${delivery.items.length}`}</Eyebrow>
          {delivery.items.length === 0 ? (
            <EmptyState icon="box" title="Nothing ships in this box">
              Everything in your stack is on a longer cycle than this month. Add a one-off below if you want something anyway.
            </EmptyState>
          ) : (
            <div className="space-y-2">
              {delivery.items.map((it, i) => (
                <div key={`${it.productId}-${i}`} className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: 'var(--surface-1)', border: `1px solid var(--edge)` }}>
                  <ProductTile imageUrl={catalogue.find((p) => p.id === it.productId)?.imageUrl} slot={catalogue.find((p) => p.id === it.productId)?.stackSlots[0]} title={it.productTitle} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--ink-1)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{it.productTitle}</p>
                    <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                      {it.slotTitle}{it.units > 1 ? ` · ${it.units}×` : ''}{it.oneOff ? ' · one-off' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-black" style={{ color: it.oneOff ? 'var(--tone-positive)' : 'var(--accent)', fontFamily: 'var(--font-display)' }}>{formatGBP(it.price)}</span>
                    <Button variant="secondary" size="sm" icon="dash" aria-label={`Remove ${it.productTitle}`} onClick={() => onRemoveItem(it)} />
                    {(() => { const prod = catalogue.find((p) => p.id === it.productId); return prod ? (
                      <Button
                        variant="primary"
                        size="sm"
                        icon="plus"
                        aria-label={`Add an extra ${it.productTitle} to this box`}
                        onClick={() => onAddItem(prod)}
                      />
                    ) : null })()}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-[var(--ink-3)] mt-2 leading-relaxed">
            This {formatGBP(delivery.total - delivery.oneOffTotal)} of regular items isn’t a separate charge — it’s part of your flat {formatGBP(subscription.flatMonthly)}/mo.
            {delivery.oneOffTotal > 0.01 && <> One-off extras (<span style={{ color: 'var(--tone-positive)' }}>{formatGBP(delivery.oneOffTotal)}</span>) are added on top of that month’s bill.</>}
          </p>
        </div>

        {/* Add to this box */}
        <div>
          {!adding ? (
            <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
              Add something to this box
            </Button>
          ) : (
            <div className="rounded-2xl p-3" style={{ background: 'var(--surface-2)', border: `1px solid var(--edge)` }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>Add a product</p>
                <Button variant="ghost" size="sm" fullWidth={false} onClick={() => setAdding(false)} className="-mr-2">Done</Button>
              </div>
              <p className="text-[11px] text-[var(--ink-3)] mb-2">Just this box (one-off, full price) or every delivery (joins your plan & spreads the cost).</p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {addable.map((p) => {
                  const econ = projectedEconomics(p)
                  return (
                    <div key={p.id} className="rounded-xl p-3" style={{ background: 'var(--surface-1)', border: `1px solid var(--edge)` }}>
                      <div className="flex items-center gap-2.5">
                        <ProductTile imageUrl={p.imageUrl} slot={p.stackSlots[0]} title={p.title} size={36} />
                        <p className="text-sm font-medium text-[var(--ink-1)] truncate flex-1" style={{ fontFamily: 'var(--font-display)' }}>{p.title}</p>
                      </div>
                      {econ.discountPct > 0 && (
                        <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                          <span className="line-through">{formatGBP(econ.listUnit)}</span> {formatGBP(econ.discountedUnit)} · save {econ.discountPct}% on plan
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <Button variant="secondary" size="sm" onClick={() => { onAddItem(p); setAdding(false) }}>
                          Just this box · +{formatGBP(oneOffUnitPrice(p))}
                        </Button>
                        <Button variant="primary" size="sm" onClick={() => { onAddRecurring(p); setAdding(false) }}>
                          Every delivery · +{formatGBP(econ.perMonth)}/mo
                        </Button>
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
            style={{ background: 'var(--surface-1)', border: `1px solid var(--edge)` }}
          >
            <Icon name="calendar" size={16} className="text-[var(--ink-3)] shrink-0" />
            <span className="text-xs font-semibold text-[var(--ink-2)] flex-1">Pick a date</span>
            {/* `compact`: the row to the left already says "Move this box", so
                a stacked label would say it twice. */}
            <Input
              label="Move this box to"
              compact
              align="right"
              type="date"
              value={toInputDate(delivery.date)}
              onChange={(e) => { if (e.target.value) onReschedule(new Date(e.target.value)) }}
            />
          </label>
        </div>

        {/* Skip / unskip */}
        {skipped ? (
          <Button variant="primary" icon="refresh" onClick={onUnskip}>Restore this delivery</Button>
        ) : (
          <div>
            <Button variant="destructive" icon="skip-forward" onClick={onSkip}>
              Skip this box{credit > 0 ? ` · credit ${formatGBP(credit)}` : ''}
            </Button>
            <p className="text-[11px] text-[var(--ink-3)] mt-2 text-center leading-relaxed">
              You won’t be charged for it, and it won’t use up a month — your plan simply moves back a month.
            </p>
          </div>
        )}
      </ModalBody>
    </Modal>
  )
}

function addDays(iso: string, days: number): Date {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  const today = new Date()
  return d < today ? today : d
}
