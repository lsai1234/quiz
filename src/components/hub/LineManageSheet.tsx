'use client'

import { useState } from 'react'
import { Button, Card, Modal, ModalBody, ModalHeader, Segmented } from '@/components/system'
import { Icon, type IconName } from '@/components/ui/Icon'
import { tint } from '@/lib/ui/tokens'
import { formatGBP, USAGE_LEVELS, type UsageLevel } from '@/lib/stack-blueprint/pricing'
import {
  computeRemoveImpact,
  lineMonthly,
  oneOffCharge,
  setLineUsage,
  formatDispatchDate,
  effectiveNextDispatch,
} from '@/lib/recharge/mock'
import { policyForLine } from '@/lib/changes/policy'
import { constraintsFor, describeConstraints } from '@/lib/changes/safety'
import { ChangePolicyChoice } from '@/components/subscription/ChangePolicyChoice'
import { BillingImpact } from './BillingImpact'
import type { ChangePolicy, MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

interface Props {
  subscription: MemberSubscription
  line: MemberSubscriptionLine
  product?: CatalogueProduct
  onSetUsage: (usageLevel: UsageLevel) => void
  onSkip: () => void
  onExpedite: (qty: number) => void
  onRemove: () => void
  /** What to do with this line if its product becomes unavailable. */
  onSetChangePolicy?: (policy: ChangePolicy) => void
  onClose: () => void
}

const USAGE_LABEL: Record<UsageLevel, string> = { light: 'A little', standard: 'As recommended', heavy: 'A lot' }

/** One of the two one-tap moves — an action card, not a bordered grey box. */
function QuickMove({ icon, title, sub, onClick }: { icon: IconName; title: string; sub: string; onClick: () => void }) {
  return (
    <Card interactive padding="none">
      <Button variant="ghost" fullWidth layout="stack" onClick={onClick}>
        <span style={{ color: 'var(--ink-3)' }}>
          <Icon name={icon} size={17} />
        </span>
        <span
          className="block"
          style={{ fontSize: 'var(--text-body-sm)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)', marginTop: 'var(--space-2)' }}
        >
          {title}
        </span>
        <span
          className="block"
          style={{ fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-body)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}
        >
          {sub}
        </span>
      </Button>
    </Card>
  )
}

function shipSummary(units: number, months: number, noun: string): string {
  if (months > 1) return `1 ${noun} every ${months} months`
  if (units > 1) return `${units} ${noun}s a month`
  return `1 ${noun} a month`
}

export function LineManageSheet({ subscription, line, product, onSetUsage, onSkip, onExpedite, onRemove, onSetChangePolicy, onClose }: Props) {
  const [usage, setUsage] = useState<UsageLevel>(line.usageLevel ?? 'standard')
  const [confirmRemove, setConfirmRemove] = useState(false)

  const usageChanged = usage !== (line.usageLevel ?? 'standard')
  // Pure projection of the pending slider choice (not applied until confirmed).
  const previewLine = product
    ? setLineUsage(subscription, line.id, product, usage).lines.find((l) => l.id === line.id) ?? line
    : line
  const removeImpact = computeRemoveImpact(subscription, line.id)
  const oneOff = oneOffCharge(line, 1)
  const nextBox = formatDispatchDate(effectiveNextDispatch(subscription))
  const noun = (product?.formats[0] ?? '').toLowerCase().includes('powder') ? 'tub' : 'pack'
  const constraintsLabel = describeConstraints(constraintsFor(subscription))

  return (
    <Modal onClose={onClose} presentation="sheet">
      <ModalHeader eyebrow={line.slotTitle} title={`Manage ${line.productTitle}`} />

      <ModalBody className="space-y-6">
        {/* How much you get through — one slider, we do the maths */}
        <div>
          <p className="text-sm font-bold text-[var(--ink-1)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>How much do you get through?</p>
          <p className="text-xs text-[var(--ink-3)] mb-3">Pick the one that sounds like you — we&apos;ll sort how much ships and how often. You only ever pay for what ships.</p>
          {/* A segmented control, not an unstyled `input[type=range]`. The
              native slider drew a different widget in every browser and gave
              no clue that it had exactly three stops. */}
          <Segmented
            label="How much do you get through?"
            columns={3}
            value={usage}
            onChange={setUsage}
            options={USAGE_LEVELS.map((lvl) => ({ value: lvl, label: USAGE_LABEL[lvl] }))}
          />
          {/* Live preview of the pending choice — text only, so nothing reflows. */}
          <p className="text-xs text-[var(--ink-3)] mt-3">
            {shipSummary(previewLine.quantity, previewLine.deliveryIntervalMonths, noun)} · {formatGBP(previewLine.pricePerDelivery)}/box
          </p>
          {/* Always rendered (disabled when unchanged) so it never shifts the layout. */}
          <Button variant="primary" iconRight="arrow-right" onClick={() => onSetUsage(usage)} disabled={!usageChanged} className="mt-3">
            Review change
          </Button>
        </div>

        {/* Quick moves */}
        <div className="grid grid-cols-2 gap-2">
          <QuickMove icon="skip-forward" title="Get one now" sub={`One-off ${formatGBP(oneOff)} · ships ASAP`} onClick={() => onExpedite(1)} />
          <QuickMove icon="pause" title="Skip next" sub={`Credit ${formatGBP(line.pricePerDelivery)} to next payment`} onClick={onSkip} />
        </div>
        <p className="text-[11px] text-[var(--ink-3)] -mt-3">Next box: {nextBox}.</p>

        {/* What happens if this product becomes unavailable */}
        {onSetChangePolicy && (
          <div>
            <p className="text-sm font-bold text-[var(--ink-1)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              If it&apos;s out of stock
            </p>
            <p className="text-xs text-[var(--ink-3)] mb-3">
              We&apos;ll sort it without holding up your box, and email you either way.
            </p>
            <ChangePolicyChoice
              policy={policyForLine(subscription, line)}
              onChange={onSetChangePolicy}
              monthly={subscription.flatMonthly}
              removesMonthly={lineMonthly(line)}
              constraintsLabel={constraintsLabel}
              variant="compact"
            />
          </div>
        )}

        {/* Remove */}
        <div>
          {!confirmRemove ? (
            <Button variant="ghost" icon="trash" onClick={() => setConfirmRemove(true)}>
              Remove from stack
            </Button>
          ) : (
            <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: `color-mix(in srgb, ${'var(--tone-attention)'} 40%, transparent)`, background: `color-mix(in srgb, ${'var(--tone-attention)'} 6%, transparent)` }}>
              <p className="text-sm font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>Remove {line.productTitle}?</p>
              <BillingImpact
                monthlyBefore={removeImpact.currentMonthly}
                monthlyAfter={removeImpact.newMonthly}
                settlement={removeImpact.settlement}
                note={removeImpact.settlement > 0.01
                  ? `A one-off settlement covers the box already sent that you haven’t finished paying for. Your monthly then drops to ${formatGBP(removeImpact.newMonthly)}.`
                  : `Nothing’s shipped yet, so there’s no charge. Your monthly drops to ${formatGBP(removeImpact.newMonthly)}.`}
              />
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setConfirmRemove(false)}>Keep it</Button>
                <Button variant="destructive" size="sm" icon="trash" onClick={onRemove}>Remove</Button>
              </div>
            </div>
          )}
        </div>
      </ModalBody>
    </Modal>
  )
}
