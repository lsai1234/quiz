'use client'

import { useState } from 'react'
import { Badge, Button, Card, EmptyState, Modal, ModalBody, ModalHeader, OptionRow, Segmented } from '@/components/system'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { tint } from '@/lib/ui/tokens'
import type { IconName } from '@/components/ui/Icon'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { CHANGE_REASONS, recommendReplacements, replacementRationale } from '@/lib/feedback'
import type { ChangeReason } from '@/lib/feedback'
import { computeSwapImpact, projectedEconomics } from '@/lib/recharge/mock'
import { BillingImpact } from './BillingImpact'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/** A glyph per reason, so the list can be scanned by shape as well as read. */
const REASON_ICON: Record<ChangeReason, IconName> = {
  'not-working': 'alert-triangle',
  'side-effects': 'thermometer',
  vegan: 'leaf',
  cheaper: 'trending-down',
  exploring: 'sparkle',
}

/** Where each step sits on the progress rail. */
const STEP_INDEX = { reason: 0, pick: 1, confirm: 2 } as const

interface Props {
  subscription: MemberSubscription
  line: MemberSubscriptionLine
  catalogue: CatalogueProduct[]
  onConfirm: (newProduct: CatalogueProduct, applyToNextBox: boolean) => void
  onClose: () => void
}

function deltaLabel(delta: number): string {
  if (Math.abs(delta) < 0.01) return 'Same price'
  return `${delta > 0 ? '+' : '−'}${formatGBP(Math.abs(delta))}/mo`
}

export function ChangeProductFlow({ subscription, line, catalogue, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState<ChangeReason | null>(null)
  const [selected, setSelected] = useState<CatalogueProduct | null>(null)
  const [applyToNextBox, setApplyToNextBox] = useState(true)

  const step: 'reason' | 'pick' | 'confirm' = selected ? 'confirm' : reason ? 'pick' : 'reason'
  const alternatives = reason ? recommendReplacements(line, reason, catalogue) : []
  const impact = selected ? computeSwapImpact(subscription, line.id, selected) : null
  const effectiveDate = impact ? new Date(impact.effectiveFrom).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : ''
  const oneOff = impact && applyToNextBox ? impact.oneOffNow : 0

  const heading = step === 'reason' ? `Change your ${line.slotTitle.toLowerCase()}`
    : step === 'pick' ? 'Recommended for you'
    : 'Confirm your change'

  return (
    <Modal onClose={onClose} presentation="sheet">
      <ModalHeader eyebrow={`${line.slotTitle} · currently ${line.productTitle}`} title={heading}>
        {/* Where they are in the three steps, in the quiz's own rail — the flow
            gave no sense of length or progress at all. */}
        <div className="flex items-center gap-1.5 mt-3">
          {(['reason', 'pick', 'confirm'] as const).map((s, i) => (
            <div
              key={s}
              className="h-1 rounded-full flex-1 transition-all duration-200"
              style={{ background: i <= STEP_INDEX[step] ? 'var(--accent)' : 'var(--edge)' }}
            />
          ))}
        </div>
      </ModalHeader>

      <ModalBody>
        {/* Step 1: reason */}
        {step === 'reason' && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--ink-3)] mb-2">What's prompting the change? We'll tailor the recommendation.</p>
            {CHANGE_REASONS.map((r) => (
              <OptionRow key={r.id} label={r.label} icon={REASON_ICON[r.id]} navigates onClick={() => setReason(r.id)} />
            ))}
          </div>
        )}

        {/* Step 2: pick */}
        {step === 'pick' && (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" icon="arrow-left" fullWidth={false} onClick={() => setReason(null)} className="mb-1 -ml-2 underline">Change reason</Button>
            {alternatives.length === 0 ? (
              <EmptyState
                icon="swap"
                title="Nothing else fits that"
                action={<Button variant="secondary" size="sm" icon="arrow-left" onClick={() => setReason(null)}>Try another reason</Button>}
              >
                We don&apos;t have an alternative that answers that for this product yet.
              </EmptyState>
            ) : (
              alternatives.map((alt) => {
                const imp = computeSwapImpact(subscription, line.id, alt)
                return (
                  // The card is the surface, the button inside it is the
                  // target — so the whole tile is pressable rather than the
                  // words in the middle of it.
                  <Card key={alt.id} interactive padding="none">
                  <Button
                    variant="ghost"
                    fullWidth
                    layout="stack"
                    aria-label={`Change to ${alt.title}`}
                    onClick={() => setSelected(alt)}
                  >
                    <span className="flex items-start gap-3">
                      {/* A replacement is a purchase decision. Making it from
                          a title and a delta, with no picture of the thing,
                          is the same mistake the whole hub was making. */}
                      <ProductTile imageUrl={alt.imageUrl} slot={alt.stackSlots[0]} title={alt.title} size={48} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span style={{ fontSize: 'var(--text-body-sm)', fontFamily: 'var(--font-display)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-1)' }}>
                            {alt.title}
                          </span>
                          <span
                            className="shrink-0"
                            style={{ fontSize: 'var(--text-meta)', fontFamily: 'var(--font-display)', color: imp.monthlyDelta > 0 ? 'var(--ink-2)' : 'var(--tone-positive)' }}
                          >
                            {deltaLabel(imp.monthlyDelta)}
                          </span>
                        </span>
                        <span
                          className="block line-clamp-2"
                          style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-body)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-2)', marginTop: 'var(--space-1)' }}
                        >
                          {alt.description}
                        </span>
                      </span>
                    </span>
                    <Badge tone="accent" className="mt-2.5 self-start">
                      {reason ? replacementRationale(alt, reason) : ''}
                    </Badge>
                  </Button>
                  </Card>
                )
              })
            )}
          </div>
        )}

        {/* Step 3: confirm */}
        {step === 'confirm' && selected && impact && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" icon="arrow-left" fullWidth={false} onClick={() => setSelected(null)} className="-ml-2 underline">Back to options</Button>

            <Card padding="tight">
              <div className="flex items-center gap-3">
                <ProductTile imageUrl={selected.imageUrl} slot={selected.stackSlots[0]} title={selected.title} size={48} />
                <div className="min-w-0">
                  <p className="text-xs text-[var(--ink-3)]">Switching to</p>
                  <p className="text-base font-black text-[var(--ink-1)] mt-0.5" style={{ fontFamily: 'var(--font-display)' }}>{selected.title}</p>
                </div>
              </div>
            </Card>

            {/* When */}
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>When should it start?</p>
              {/* `'next' | 'payment'` rather than a boolean: `Segmented` keys on
                  the value, and `true`/`false` make for keys and aria state a
                  screen reader would read out as "true". */}
              <Segmented
                label="When should it start?"
                columns={2}
                value={applyToNextBox ? 'next' : 'payment'}
                onChange={(v) => setApplyToNextBox(v === 'next')}
                options={[
                  { value: 'next', label: `Next box · ${effectiveDate}` },
                  { value: 'payment', label: 'From next payment' },
                ]}
              />
            </div>

            {/* Pricing impact */}
            <BillingImpact
              monthlyBefore={impact.currentMonthly}
              monthlyAfter={impact.newMonthly}
              oneOffNow={oneOff > 0 ? oneOff : 0}
              credit={oneOff < 0 ? Math.abs(oneOff) : 0}
              economics={projectedEconomics(selected)}
              note={applyToNextBox
                ? `Ships in your next box on ${effectiveDate}.`
                : 'Your current box is unchanged; this applies from your next payment.'}
            />

            <Button variant="primary" size="lg" onClick={() => onConfirm(selected, applyToNextBox)}>
              Confirm change
            </Button>
          </div>
        )}
      </ModalBody>
    </Modal>
  )
}
