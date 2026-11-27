'use client'

import { useMemo, useState } from 'react'
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, Segmented } from '@/components/system'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription, PlanRoutine } from '@/lib/recharge/types'
import type { TrainingFrequency, WeightBand } from '@/lib/types'
import { applyRoutine, rhythmChanges, TRAINING_CHOICES, WEIGHT_CHOICES } from '@/lib/recharge/routine'
import { planRateChange, ratePct, withPlanRate } from '@/lib/recharge/plan-rate'
import { formatGBP } from '@/lib/stack-blueprint/pricing'

/**
 * "Your routine": how many days a week they train and (optionally) their
 * weight, which every product's rhythm is worked out from. Changing it shows
 * what moves (each product whose rhythm changes, the monthly, the plan saving
 * if it crosses a band) and applies it all in one confirm (`applyRoutine`).
 */

const body = { fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-2)' } as const
const label = { fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' } as const
const NOT_SAID = 'not-said'

export function RoutineSheet({
  subscription,
  catalogue,
  onConfirm,
  onClose,
}: {
  subscription: MemberSubscription
  catalogue: CatalogueProduct[]
  onConfirm: (routine: PlanRoutine) => void
  onClose: () => void
}) {
  const start = subscription.routine
  const [training, setTraining] = useState<TrainingFrequency | null>(start?.trainingFrequency ?? null)
  const [weight, setWeight] = useState<WeightBand | null>(start?.weightBand ?? null)

  const routine: PlanRoutine = useMemo(
    () => ({ trainingFrequency: training, weightBand: weight, ...(start?.asNeeded ? { asNeeded: start.asNeeded } : {}), source: 'member' }),
    [training, weight, start?.asNeeded],
  )
  const after = useMemo(() => withPlanRate(subscription, applyRoutine(subscription, routine, catalogue), catalogue), [subscription, routine, catalogue])
  const changes = rhythmChanges(subscription, after)
  const rate = planRateChange(subscription, after, catalogue)
  const changed = training !== (start?.trainingFrequency ?? null) || weight !== (start?.weightBand ?? null)

  return (
    <Modal onClose={onClose} presentation="sheet">
      <ModalHeader eyebrow="Your plan" title="Your routine" />
      <ModalBody className="space-y-5">
        <p style={body}>
          How often each product comes is worked out from this, so it arrives about when you’d run out.
          {start?.source === 'estimate' || !start ? ' Until you tell us, it’s our estimate: about three training days a week.' : ''}
        </p>

        <div>
          <p style={label}>How many days a week do you train?</p>
          <div style={{ marginTop: 'var(--space-2)' }}>
            <Segmented
              label="How many days a week do you train?"
              columns={2}
              value={training ?? null}
              onChange={(v) => setTraining(v as TrainingFrequency)}
              options={TRAINING_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
            />
          </div>
        </div>

        <div>
          <p style={label}>Your weight</p>
          <p style={{ ...body, marginTop: 'var(--space-1)' }}>Optional. It only sizes protein, and stays in your hub.</p>
          <div style={{ marginTop: 'var(--space-2)' }}>
            <Segmented
              label="Your weight"
              columns={2}
              value={weight ?? NOT_SAID}
              onChange={(v) => setWeight(v === NOT_SAID ? null : (v as WeightBand))}
              options={[...WEIGHT_CHOICES.map((c) => ({ value: c.value as string, label: c.label })), { value: NOT_SAID, label: 'Rather not say' }]}
            />
          </div>
        </div>

        {/* What it changes, before anything does. */}
        <div aria-live="polite" data-routine-preview>
          {!changed ? null : changes.length === 0 ? (
            <p style={body}>Nothing on your plan comes more or less often with that.</p>
          ) : (
            <>
              <p style={label}>What changes</p>
              <ul style={{ display: 'grid', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
                {changes.map((c) => (
                  <li key={c.lineId} style={body}>
                    <span style={{ color: 'var(--ink-1)' }}>{c.title}</span>: {c.before} → <strong style={{ color: 'var(--ink-1)' }}>{c.after}</strong>
                  </li>
                ))}
              </ul>
              <p style={{ ...body, marginTop: 'var(--space-2)' }}>
                Your monthly {formatGBP(subscription.flatMonthly)} → <strong style={{ color: 'var(--ink-1)' }}>{formatGBP(after.flatMonthly)}</strong>
                {rate ? `, and your plan saving goes from ${ratePct(rate.from)} to ${ratePct(rate.to)}` : ''}. Each one counts from your last delivery.
              </p>
            </>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!changed} onClick={() => onConfirm(routine)}>
          Update my plan
        </Button>
      </ModalFooter>
    </Modal>
  )
}
