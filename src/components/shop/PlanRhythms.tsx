'use client'

import { useId, useState } from 'react'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { BasketRoutine } from '@/lib/basket/store'
import { rhythmLabel } from '@/lib/hub/line-facts'
import { routineMatters, routineWords, TRAINING_CHOICES, WEIGHT_CHOICES } from '@/lib/recharge/routine'

/**
 * A monthly basket's products, each with how often it comes, and the estimate
 * that's worked out from, which the shopper can change in two questions.
 *
 * The rhythm is the plan's own (`buildShopPlan`, the function the server
 * charges from), so what this lists is what the hub will show and what will
 * come. The estimate is said as one, and only offered for change when the
 * basket has something it changes (training-day, protein or when-needed
 * products): a basket of daily vitamins has nothing to ask about.
 */
export function PlanRhythms({
  plan,
  products,
  routine,
  onRoutine,
}: {
  plan: MemberSubscription
  products: CatalogueProduct[]
  routine: BasketRoutine | null
  onRoutine: (routine: BasketRoutine | null) => void
}) {
  const [open, setOpen] = useState(false)
  const trainingId = useId()
  const weightId = useId()
  const inPlan = products.filter((p) => plan.lines.some((l) => l.productId === p.id))
  const asks = routineMatters(inPlan)
  const current: BasketRoutine = routine ?? { trainingFrequency: null, weightBand: null }

  return (
    <div className="sf-drawer-rhythms" data-plan-rhythms>
      <ul>
        {plan.lines.map((l) => (
          <li key={l.id}>
            <span>{l.productTitle}</span>
            <span>{rhythmLabel(l.quantity, l.deliveryIntervalMonths)}</span>
          </li>
        ))}
      </ul>
      {asks && (
        <div className="sf-drawer-routine">
          <p>
            Worked out from {routineWords(plan.routine)}.{' '}
            <button type="button" className="sf-linkbutton" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? 'Done' : 'Change'}
            </button>
          </p>
          {open && (
            <div className="sf-drawer-routine-ask">
              <p id={trainingId}>How many days a week do you train?</p>
              <div className="sf-drawer-seg sf-drawer-seg--wrap" role="group" aria-labelledby={trainingId}>
                {TRAINING_CHOICES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={current.trainingFrequency === c.value}
                    onClick={() => onRoutine({ ...current, trainingFrequency: c.value })}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p id={weightId}>Your weight (it sizes protein; optional)</p>
              <div className="sf-drawer-seg sf-drawer-seg--wrap" role="group" aria-labelledby={weightId}>
                {WEIGHT_CHOICES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={current.weightBand === c.value}
                    onClick={() => onRoutine({ ...current, weightBand: current.weightBand === c.value ? null : c.value })}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
