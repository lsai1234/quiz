'use client'

import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/system'
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
 * Two-deep on purpose, and the one legitimate case in the hub: it is raised BY a
 * sheet and has to sit above it. `Modal` restores the previous scroll-lock value
 * rather than clearing it, so closing the upper one does not unlock the page
 * underneath the lower one.
 */
export function ChangeSummary({ change, onClose }: { change: PendingChange; onClose: () => void }) {
  return (
    <Modal onClose={onClose} presentation="sheet">
      <ModalHeader title={change.title} subtitle={change.subtitle} />

      <ModalBody>
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
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => { change.onConfirm(); onClose() }}>
          {change.confirmLabel ?? 'Confirm change'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
