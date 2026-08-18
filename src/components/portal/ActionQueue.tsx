'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { countdownTo } from '@/lib/changes/health'
import type { ChangeEvent, ChangeKind } from '@/lib/changes/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { NO_CONSTRAINTS, describeConstraints, failedConstraints } from '@/lib/changes/safety'
import { Button, Card, Input } from '@/components/system'


const KIND_LABEL: Record<ChangeKind, string> = {
  'out-of-stock': 'Out of stock',
  discontinued: 'Discontinued',
  'price-increase': 'Price up',
  'price-decrease': 'Price down',
}

const REASON_LABEL: Record<string, string> = {
  'member-chose-swap': 'They asked us to keep their plan whole',
  'member-chose-remove': 'They asked us to take things off',
  'no-replacement-available': 'Nothing else in the category is available',
  'no-safe-replacement': 'Nothing available suits their dietary needs',
  'replacement-uneconomic': 'The only match would sell below the margin floor',
  'price-absorbed-by-default': 'Absorbed unless you pass it on',
}

const ACTION_LABEL: Record<string, string> = {
  substitute: 'Swapping',
  remove: 'Removing from plan',
  hold: 'Holding',
  absorb: 'Absorbing',
  dismiss: 'Dismissing',
}

/** What the system will do, and when it lands if nobody intervenes. */
function IntentLine({ event }: { event: ChangeEvent }) {
  const action = ACTION_LABEL[event.intendedAction.resolution.type] ?? 'Resolving'
  const target =
    event.intendedAction.resolution.type === 'substitute' ? ` to ${event.suggestedReplacementTitle}` : ''
  const countdown = countdownTo(event.autoApplyAt)

  return (
    <p className="text-[11px] mt-1.5" style={{ color: 'var(--accent)' }}>
      {action}
      {target}
      {countdown ? ` · applies ${countdown}` : ''}
    </p>
  )
}

function Money({ event }: { event: ChangeEvent }) {
  const p = event.billingPreview
  if (!p) return null
  const changed = Math.abs(p.newMonthly - p.currentMonthly) >= 0.01
  return (
    <p className="text-[11px] text-[var(--ink-3)] mt-1">
      {changed
        ? `${formatGBP(p.currentMonthly)}/mo → ${formatGBP(p.newMonthly)}/mo`
        : `${formatGBP(p.currentMonthly)}/mo unchanged`}
      {p.credit > 0 ? ` · ${formatGBP(p.credit)} credit` : ''}
      {p.effectiveFrom ? ` · from ${new Date(p.effectiveFrom).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
    </p>
  )
}

interface Props {
  events: ChangeEvent[]
  catalogue: CatalogueProduct[]
  busyId: string | null
  onResolve: (id: string, action: string, replacementProductId?: string) => void
  onBulk: (productId: string, action: string, replacementProductId?: string) => void
}

export function ActionQueue({ events, catalogue, busyId, onResolve, onBulk }: Props) {
  const [pickerFor, setPickerFor] = useState<string | null>(null)

  // Events grouped by product: one dead SKU usually means many identical
  // decisions, and making them one at a time is the difference between a
  // usable queue and an unusable one.
  const groups = useMemo(() => {
    const map = new Map<string, ChangeEvent[]>()
    for (const e of events) map.set(e.productId, [...(map.get(e.productId) ?? []), e])
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [events])

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--edge)] p-8 text-center" style={{ background: 'var(--surface-1)' }}>
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--tone-positive)', fontFamily: 'var(--font-display)' }}>Nothing needs you</p>
        <p className="text-xs text-[var(--ink-3)]">
          Every subscribed product is available, and anything that did change has already been handled and the member told.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map(([productId, group]) => (
        <ProductGroup
          key={productId}
          productId={productId}
          events={group}
          catalogue={catalogue}
          busyId={busyId}
          pickerFor={pickerFor}
          setPickerFor={setPickerFor}
          onResolve={onResolve}
          onBulk={onBulk}
        />
      ))}
    </div>
  )
}

function ProductGroup({
  productId, events, catalogue, busyId, pickerFor, setPickerFor, onResolve, onBulk,
}: {
  productId: string
  events: ChangeEvent[]
  catalogue: CatalogueProduct[]
  busyId: string | null
  pickerFor: string | null
  setPickerFor: (id: string | null) => void
  onResolve: Props['onResolve']
  onBulk: Props['onBulk']
}) {
  const first = events[0]
  const many = events.length > 1
  const removeOnly = events.filter((e) => e.policy === 'remove').length

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: 'var(--surface-1)', borderColor: `var(--attention-line)` }}
    >
      <div className="p-4 border-b border-[var(--edge)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
              {first.productTitle}
            </p>
            <p className="text-[11px] text-[var(--ink-3)]">
              {first.slotTitle} · SKU {first.sku ?? '—'} · affecting {events.length} member{events.length === 1 ? '' : 's'}
            </p>
          </div>
          <span
            className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ color: 'var(--tone-attention)', background: `var(--attention-fill)` }}
          >
            {KIND_LABEL[first.kind]}
          </span>
        </div>

        {many && (
          <div className="mt-3">
            <p className="text-[11px] text-[var(--ink-3)] mb-2">
              Resolve for everyone at once.
              {removeOnly > 0 && ` ${removeOnly} of them asked us to remove rather than swap — they'll be removed whatever you pick here.`}
            </p>
            <div className="flex flex-wrap gap-2">
              {first.suggestedReplacementId && (
                <BulkButton
                  label={`Swap all to ${first.suggestedReplacementTitle}`}
                  onClick={() => onBulk(productId, 'substitute', first.suggestedReplacementId!)}
                  disabled={busyId !== null}
                  primary
                />
              )}
              <BulkButton label="Remove for all" onClick={() => onBulk(productId, 'remove')} disabled={busyId !== null} />
            </div>
          </div>
        )}
      </div>

      <div className="divide-y divide-[var(--edge)]">
        {events.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            catalogue={catalogue}
            busy={busyId === event.id}
            disabled={busyId !== null}
            pickerOpen={pickerFor === event.id}
            onTogglePicker={() => setPickerFor(pickerFor === event.id ? null : event.id)}
            onResolve={onResolve}
          />
        ))}
      </div>
    </div>
  )
}

function BulkButton({ label, onClick, disabled, primary }: { label: string; onClick: () => void; disabled: boolean; primary?: boolean }) {
  return (
    <Button size="sm" variant={primary ? 'primary' : 'secondary'} disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  )
}

function EventRow({
  event, catalogue, busy, disabled, pickerOpen, onTogglePicker, onResolve,
}: {
  event: ChangeEvent
  catalogue: CatalogueProduct[]
  busy: boolean
  disabled: boolean
  pickerOpen: boolean
  onTogglePicker: () => void
  onResolve: Props['onResolve']
}) {

  return (
    <div className="p-4">
      <p className="text-xs font-semibold text-[var(--ink-2)]">{event.customerEmail ?? 'member'}</p>
      <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
        {REASON_LABEL[event.intendedAction.reason] ?? event.intendedAction.reason}
      </p>
      <IntentLine event={event} />
      <Money event={event} />

      {event.intendedAction.breaksPlan && (
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--tone-attention)' }}>
          Removing this would leave their plan below the minimum — worth a look before it lands.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {event.suggestedReplacementId && (
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={disabled}
            onClick={() => onResolve(event.id, 'substitute', event.suggestedReplacementId!)}
          >
            {`Swap to ${event.suggestedReplacementTitle}`}
          </Button>
        )}
        <Button size="sm" disabled={disabled} aria-expanded={pickerOpen} onClick={onTogglePicker}>
          Choose another
        </Button>
        <Button size="sm" disabled={disabled} onClick={() => onResolve(event.id, 'remove')}>
          Remove from plan
        </Button>
        {event.kind === 'out-of-stock' && (
          <Button size="sm" disabled={disabled} onClick={() => onResolve(event.id, 'hold')}>
            Hold next box
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onResolve(event.id, 'dismiss')}>
          Dismiss
        </Button>
      </div>

      {pickerOpen && (
        <ReplacementPicker
          event={event}
          catalogue={catalogue}
          onPick={(id) => { onTogglePicker(); onResolve(event.id, 'substitute', id) }}
        />
      )}
    </div>
  )
}

/**
 * Same-category alternatives, with a hard warning when one doesn't meet the
 * member's stated dietary needs. A founder CAN override — they might know
 * something we don't — but never by accident.
 */
function ReplacementPicker({
  event, catalogue, onPick,
}: {
  event: ChangeEvent
  catalogue: CatalogueProduct[]
  onPick: (productId: string) => void
}) {
  const [query, setQuery] = useState('')
  const constraints = event.constraints ?? NO_CONSTRAINTS
  const constraintsLabel = describeConstraints(constraints)

  const candidates = useMemo(() => {
    const sameGroup = catalogue.filter(
      (p) => p.swapGroup === event.swapGroup && p.id !== event.productId && p.subscriptionEligible,
    )
    const q = query.trim().toLowerCase()
    return (q ? sameGroup.filter((p) => p.title.toLowerCase().includes(q)) : sameGroup).slice(0, 8)
  }, [catalogue, event, query])

  return (
    <Card solid padding="tight" className="mt-3">
      {constraintsLabel && (
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--accent)', marginBottom: 'var(--space-2)' }}>
          This member needs {constraintsLabel} products.
        </p>
      )}
      <div className="mb-2">
        <Input
          label={`Search ${event.slotTitle.toLowerCase()}`}
          compact
          className="w-full"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${event.slotTitle.toLowerCase()}…`}
        />
      </div>
      {candidates.length === 0 ? (
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', padding: 'var(--space-2) 0' }}>
          Nothing else in this category.
        </p>
      ) : (
        <div className="space-y-1">
          {candidates.map((p) => {
            const failures = failedConstraints(p, constraints)
            return (
              <Button
                key={p.id}
                variant="ghost"
                size="sm"
                fullWidth
                className="justify-start text-left"
                onClick={() => {
                  // A founder may know something we don't, but never by accident.
                  if (
                    failures.length > 0 &&
                    !window.confirm(
                      `${p.title} is ${failures.join(' and ')}, which doesn't match what this member told us.\n\nSend it anyway?`,
                    )
                  ) {
                    return
                  }
                  onPick(p.id)
                }}
              >
                <span>
                  <span>{p.title}</span>
                  <span style={{ fontWeight: 'var(--weight-body)', color: 'var(--ink-3)' }}> · {formatGBP(p.basePrice)}</span>
                  {failures.length > 0 && (
                    <span className="block" style={{ fontSize: 'var(--text-micro)', color: 'var(--tone-attention)', marginTop: 'var(--space-1)' }}>
                      {failures.join(' · ')}
                    </span>
                  )}
                </span>
              </Button>
            )
          })}
        </div>
      )}
    </Card>
  )
}
