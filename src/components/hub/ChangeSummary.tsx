'use client'

import { Button } from '@/components/ui/Button'
import { Sheet, SheetBody, SheetFooter, SheetHeader } from '@/components/ui/Sheet'
import { BillingImpact } from './BillingImpact'
import type { LineEconomics } from '@/lib/recharge/mock'

/** A pending, price-affecting change awaiting the member's confirmation. */
export interface PendingChange {
  /** Short heading, e.g. "Add to your plan". */
  title: string
  /** What it applies to, e.g. the product title. */
  subtitle?: string
  monthlyBefore: number
  monthlyAfter: number
  oneOffNow?: number
  credit?: number
  settlement?: number
  effectiveFrom?: string
  economics?: LineEconomics & { title?: string }
  note?: string
  confirmLabel?: string
  /** Applies the change. The summary closes itself after calling this. */
  onConfirm: () => void
}

/**
 * A single, consistent "review your change" screen. Every hub action that
 * changes the price routes through this: it shows exactly what happens to the
 * bill (via BillingImpact) and only applies on Confirm.
 *
 * `layer="over"` because it is raised BY a sheet and has to sit above it — the
 * one legitimate two-deep case in the hub.
 */
export function ChangeSummary({ change, onClose }: { change: PendingChange; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} layer="over">
      <SheetHeader eyebrow="Review your change" title={change.title}>
        {change.subtitle && <p className="text-xs text-[var(--color-muted)] mt-0.5">{change.subtitle}</p>}
      </SheetHeader>

      <SheetBody>
        <BillingImpact
          monthlyBefore={change.monthlyBefore}
          monthlyAfter={change.monthlyAfter}
          oneOffNow={change.oneOffNow}
          credit={change.credit}
          settlement={change.settlement}
          effectiveFrom={change.effectiveFrom}
          economics={change.economics}
          note={change.note}
        />
      </SheetBody>

      <SheetFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => { change.onConfirm(); onClose() }}>
          {change.confirmLabel ?? 'Confirm change'}
        </Button>
      </SheetFooter>
    </Sheet>
  )
}
