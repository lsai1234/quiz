'use client'

import { useState } from 'react'
import { Sheet, SheetBody, SheetHeader } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { ACCENT, GLASS, GREEN, tint } from '@/lib/ui/tokens'
import { OptionRow } from '@/components/ui/OptionRow'
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
    <Sheet onClose={onClose}>
      <SheetHeader eyebrow={`${line.slotTitle} · currently ${line.productTitle}`} title={heading}>
        {/* Where they are in the three steps, in the quiz's own rail — the flow
            gave no sense of length or progress at all. */}
        <div className="flex items-center gap-1.5 mt-3">
          {(['reason', 'pick', 'confirm'] as const).map((s, i) => (
            <div
              key={s}
              className="h-1 rounded-full flex-1 transition-all duration-200"
              style={{ background: i <= STEP_INDEX[step] ? ACCENT : GLASS.hairline }}
            />
          ))}
        </div>
      </SheetHeader>

      <SheetBody>
        {/* Step 1: reason */}
        {step === 'reason' && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--color-muted)] mb-2">What's prompting the change? We'll tailor the recommendation.</p>
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
              <p className="text-sm text-[var(--color-muted)] text-center py-10">No alternatives match that for this product. Try a different reason.</p>
            ) : (
              alternatives.map((alt) => {
                const imp = computeSwapImpact(subscription, line.id, alt)
                return (
                  <button
                    key={alt.id}
                    type="button"
                    onClick={() => setSelected(alt)}
                    className="w-full text-left rounded-2xl p-4 transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2"
                    style={{ background: GLASS.surface, border: `1px solid ${GLASS.hairline}`, ['--tw-ring-color' as string]: tint(ACCENT, 45) }}
                  >
                    <div className="flex items-start gap-3">
                      {/* A replacement is a purchase decision. Making it from
                          a title and a delta, with no picture of the thing,
                          is the same mistake the whole hub was making. */}
                      <ProductTile imageUrl={alt.imageUrl} slot={alt.stackSlots[0]} title={alt.title} size={48} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-[var(--color-text)] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{alt.title}</p>
                          <span className="text-xs font-black shrink-0" style={{ color: imp.monthlyDelta > 0 ? 'var(--color-text-2)' : GREEN, fontFamily: 'var(--font-display)' }}>{deltaLabel(imp.monthlyDelta)}</span>
                        </div>
                        <p className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed line-clamp-2">{alt.description}</p>
                      </div>
                    </div>
                    <Chip color={ACCENT} className="mt-2.5">{reason ? replacementRationale(alt, reason) : ''}</Chip>
                  </button>
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
                  <p className="text-xs text-[var(--color-muted)]">Switching to</p>
                  <p className="text-base font-black text-[var(--color-text)] mt-0.5" style={{ fontFamily: 'var(--font-display)' }}>{selected.title}</p>
                </div>
              </div>
            </Card>

            {/* When */}
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-2)' }}>When should it start?</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="When should it start?">
                {([true, false] as const).map((when) => {
                  const active = applyToNextBox === when
                  return (
                    <button
                      key={String(when)}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setApplyToNextBox(when)}
                      className="py-3 px-2 min-h-11 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2"
                      style={{
                        background: active ? tint(ACCENT, 12) : GLASS.surface,
                        border: `1px solid ${active ? tint(ACCENT, 55) : GLASS.hairline}`,
                        color: active ? ACCENT : 'var(--color-text-2)',
                        fontFamily: 'var(--font-display)',
                        ['--tw-ring-color' as string]: tint(ACCENT, 45),
                      }}
                    >
                      {when ? `Next box · ${effectiveDate}` : 'From next payment'}
                    </button>
                  )
                })}
              </div>
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
      </SheetBody>
    </Sheet>
  )
}
