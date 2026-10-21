import { render, screen, within } from '@testing-library/react'
import { PlanReceipt } from '../PlanReceipt'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint/mock-blueprint'
import { buildSubscriptionPlan, calculatePricing } from '@/lib/stack-blueprint/pricing'
import { TIER_META } from '@/lib/quiz-core'
import type { PlanType } from '@/lib/store'

jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }))

/**
 * The receipt's labels. Two things are pinned here: the level is named the way
 * the depth picker names it, and each line's tag is the product's type rather
 * than the slot title — a slot names a job ("Hydration"), and under a product
 * that reads as a claim.
 */

function receipt(planType: PlanType) {
  const pricing = calculatePricing(MOCK_BLUEPRINT, MOCK_CATALOGUE)
  return render(
    <PlanReceipt
      slots={MOCK_BLUEPRINT.slots}
      products={MOCK_CATALOGUE}
      subscriptionPlan={buildSubscriptionPlan(MOCK_BLUEPRINT, MOCK_CATALOGUE)}
      pricing={pricing}
      planType={planType}
      onPlanChange={() => {}}
    />,
  )
}

it('names the subscription level the way the depth picker does', () => {
  receipt('subscription')
  expect(screen.getByText(`${TIER_META.performance.label} bundle · Subscribe & Save`)).toBeInTheDocument()
  expect(screen.getByText('Balanced bundle · Subscribe & Save')).toBeInTheDocument()
  expect(screen.queryByText(/Performance bundle/)).not.toBeInTheDocument()
})

it('tags each line with the product type, not the slot title', () => {
  receipt('oneoff')
  const order = screen.getByText(/your order · 5 items/i).nextElementSibling as HTMLElement

  // "CHRGD Electrolyte Mix" is tagged with its type …
  const electrolytes = within(order).getByText('CHRGD Electrolyte Mix').parentElement as HTMLElement
  expect(within(electrolytes).getByText('Electrolytes')).toBeInTheDocument()

  // … and no slot title is shown as a tag.
  for (const slot of MOCK_BLUEPRINT.slots) {
    expect(within(order).queryByText(slot.title)).not.toBeInTheDocument()
  }

  // A type the title already says is not repeated under it.
  const creatine = within(order).getByText('CHRGD Creatine Monohydrate').parentElement as HTMLElement
  expect(creatine.textContent).toBe('CHRGD Creatine Monohydrate')
})
