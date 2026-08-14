'use client'

import { useState } from 'react'
import { Sheet, SheetBody, SheetHeader } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { GLASS, tint } from '@/lib/ui/tokens'
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

const ACCENT = '#00D4FF'
const AMBER = '#fbbf24'

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
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl p-3.5 text-left transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2"
      style={{
        background: GLASS.surface,
        border: `1px solid ${GLASS.hairline}`,
        ['--tw-ring-color' as string]: tint(ACCENT, 45),
      }}
    >
      <Icon name={icon} size={17} className="text-[var(--color-muted)]" />
      <p className="text-sm font-bold text-[var(--color-text)] mt-2" style={{ fontFamily: 'var(--font-display)' }}>{title}</p>
      <p className="text-[11px] text-[var(--color-muted)] mt-0.5 leading-snug">{sub}</p>
    </button>
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
    <Sheet onClose={onClose}>
      <SheetHeader eyebrow={line.slotTitle} title={`Manage ${line.productTitle}`} />

      <SheetBody className="space-y-6">
        {/* How much you get through — one slider, we do the maths */}
        <div>
          <p className="text-sm font-bold text-[var(--color-text)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>How much do you get through?</p>
          <p className="text-xs text-[var(--color-muted)] mb-3">Pick the one that sounds like you — we&apos;ll sort how much ships and how often. You only ever pay for what ships.</p>
          {/* A segmented control, not an unstyled `input[type=range]`. The
              native slider drew a different widget in every browser and gave
              no clue that it had exactly three stops. */}
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How much do you get through?">
            {USAGE_LEVELS.map((lvl) => {
              const active = usage === lvl
              return (
                <button
                  key={lvl}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setUsage(lvl)}
                  className="rounded-xl px-2 py-3 min-h-11 text-xs font-bold transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    background: active ? tint(ACCENT, 12) : GLASS.surface,
                    border: `1px solid ${active ? tint(ACCENT, 55) : GLASS.hairline}`,
                    color: active ? ACCENT : 'var(--color-text-2)',
                    fontFamily: 'var(--font-display)',
                    ['--tw-ring-color' as string]: tint(ACCENT, 45),
                  }}
                >
                  {USAGE_LABEL[lvl]}
                </button>
              )
            })}
          </div>
          {/* Live preview of the pending choice — text only, so nothing reflows. */}
          <p className="text-xs text-[var(--color-muted)] mt-3">
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
        <p className="text-[11px] text-[var(--color-muted)] -mt-3">Next box: {nextBox}.</p>

        {/* What happens if this product becomes unavailable */}
        {onSetChangePolicy && (
          <div>
            <p className="text-sm font-bold text-[var(--color-text)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              If it&apos;s out of stock
            </p>
            <p className="text-xs text-[var(--color-muted)] mb-3">
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
            <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: `color-mix(in srgb, ${AMBER} 40%, transparent)`, background: `color-mix(in srgb, ${AMBER} 6%, transparent)` }}>
              <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Remove {line.productTitle}?</p>
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
                <Button variant="danger" size="sm" icon="trash" onClick={onRemove}>Remove</Button>
              </div>
            </div>
          )}
        </div>
      </SheetBody>
    </Sheet>
  )
}
