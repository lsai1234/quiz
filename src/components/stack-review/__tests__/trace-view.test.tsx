import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { useQuizStore } from '@/lib/store'
import { saveTraces, type Trace } from '@/lib/consult/trace'
import { StatCard } from '../StatCard'

/** Trace it back (plan Phase 8): "Why this?" in a product's detail sheet. */
const MAGNESIUM = MOCK_CATALOGUE.find((p) => p.swapGroup === 'magnesium')!

function slotFor(product: CatalogueProduct): StackSlotEntry {
  return { slotId: `slot-consult-${product.id}`, slotType: 'sleep', title: 'Sleep', description: '', recommendedProductId: product.id, selectedProductId: product.id, selectedVariantId: null, required: false, canRemove: true, canSwap: true, swapGroup: product.swapGroup, reason: '', confidenceScore: 80, displayOrder: 0 }
}

const TRACE: Trace = {
  productId: MAGNESIUM.id,
  steps: [
    { kind: 'answers', label: 'From your answers', claim: null, weight: 1, answers: [{ text: '4 caffeinated drinks a day', weight: 1 }, { text: 'Your sleep is restless', weight: 0.4 }] },
    { kind: 'goal', label: 'Energy', claim: 'Magnesium contributes to a reduction of tiredness and fatigue', weight: 0.3, answers: [{ text: 'Energy is your top goal', weight: 0.3 }] },
  ],
}

function open() {
  render(<StatCard slot={slotFor(MAGNESIUM)} product={MAGNESIUM} planType="subscription" />)
  fireEvent.click(screen.getByText('Tap for details ›'))
}

beforeEach(() => {
  sessionStorage.clear()
  act(() => useQuizStore.setState({ consultExclusions: { consultId: 'c_whythis0001', excluded: [], pharmacistNote: false } }))
})

it('draws the path back to the answers, the heaviest thickest, each named step with its claim', () => {
  saveTraces('c_whythis0001', { [MAGNESIUM.id]: TRACE })
  open()
  fireEvent.click(screen.getByRole('button', { name: 'Why this?' }))
  const tree = screen.getByRole('list', { name: 'How this got into your stack' })
  const steps = within(tree).getAllByRole('listitem').filter((li) => li.hasAttribute('data-step'))
  expect(steps.map((s) => s.getAttribute('data-step'))).toEqual(['answers', 'goal'])
  expect(within(steps[1]).getByText('“Magnesium contributes to a reduction of tiredness and fatigue”')).toBeInTheDocument()
  expect(within(steps[0]).getByText('“4 caffeinated drinks a day”')).toBeInTheDocument()
  // Thicker lines counted for more.
  const answers = steps[0].querySelectorAll('[data-answer]')
  expect([...answers].map((a) => a.getAttribute('data-answer'))).toEqual(['100', '40'])
  fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
  expect(screen.queryByRole('list', { name: 'How this got into your stack' })).toBeNull()
})

it('offers nothing for a product the consult didn’t pick, or another consult’s trail', () => {
  saveTraces('c_someone_else', { [MAGNESIUM.id]: TRACE })
  open()
  expect(screen.queryByRole('button', { name: 'Why this?' })).toBeNull()
})
