import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LastChance } from '../LastChance'
import type { StackSlotEntry } from '@/lib/stack-blueprint/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { offerProductFor, quoteOffer } from '@/lib/last-chance/economics'

jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }))

/**
 * The last-chance card at the foot of the results page. What it shows has to
 * be the quote the server will honour, and what it sends has to be a variant
 * and the price it showed — never a price to charge.
 */

function product(id: string, price: number, cost: number, over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id, title: `CHRGD ${id}`, cost, basePrice: price, swapGroup: 'pre-workout-stim', stackSlots: ['energy'],
    recommendationPriority: 5, shortReason: '', imageUrl: null, category: 'Energy',
    variants: [{ id: `v-${id}`, price, available: true, cost }],
    ...over,
  } as unknown as CatalogueProduct
}
function slot(id: string, confidenceScore: number): StackSlotEntry {
  return {
    slotId: `slot-${id}`, slotType: 'energy', title: id, description: '', recommendedProductId: id,
    selectedProductId: id, selectedVariantId: null, required: false, canRemove: true, canSwap: true,
    swapGroup: 'pre-workout-stim', reason: `Picked for your evening sessions (${id})`, confidenceScore, displayOrder: 0,
  } as StackSlotEntry
}

const PRE = product('pre', 29.99, 11)
const OTHER = product('other', 24.99, 10)
const quote = quoteOffer(offerProductFor(PRE, PRE.variants[0]))

afterEach(() => jest.restoreAllMocks())

it('shows the quote for the stack’s best product, in approved words', () => {
  render(<LastChance slots={[slot('pre', 90), slot('other', 40)]} products={[PRE, OTHER]} subscriptionPlan={[]} onBackToStack={() => {}} />)
  expect(screen.getByRole('heading', { name: /start with the one that matters most/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'CHRGD pre' })).toBeInTheDocument()
  expect(screen.getByText(/picked for your evening sessions \(pre\)/i)).toBeInTheDocument()
  expect(screen.getByText(/caffeine contributes to increased alertness and concentration/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: new RegExp(`get it for £${quote.offerPrice.toFixed(2)}`, 'i') })).toBeInTheDocument()
  expect(quote.discountPct).toBeGreaterThan(0)
  // Said plainly for screen readers while the big figure counts down to it.
  expect(screen.getByText(`£${quote.offerPrice.toFixed(2)}, down from £${quote.listPrice.toFixed(2)}`)).toBeInTheDocument()
})

it('sends the variant and the price it showed, nothing to charge', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ checkoutUrl: 'https://checkout.stripe.test/x', orderId: 'o1' }) })
  global.fetch = fetchMock as unknown as typeof fetch
  render(<LastChance slots={[slot('pre', 90), slot('other', 40)]} products={[PRE, OTHER]} subscriptionPlan={[]} onBackToStack={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /get it for/i }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/cart')
  const body = JSON.parse(init.body)
  expect(body.lastChance).toEqual({ variantId: 'v-pre', expectedPrice: quote.offerPrice })
  expect(body.lines).toEqual([expect.objectContaining({ variantId: 'v-pre', quantity: 1 })])
  expect(body.lines[0].attributes).toContainEqual({ key: 'source', value: 'quiz-last-chance' })
  expect(body).not.toHaveProperty('partnerCode')
})

it('shows the server’s new price when it moved, and says so', async () => {
  const moved = { ...quote, offerPrice: quote.offerPrice + 1, total: quote.total + 1 }
  global.fetch = jest.fn().mockResolvedValue({
    ok: false, status: 409, json: async () => ({ error: `The price has changed to £${moved.offerPrice.toFixed(2)}.`, offerChanged: true, quote: moved }),
  }) as unknown as typeof fetch
  render(<LastChance slots={[slot('pre', 90), slot('other', 40)]} products={[PRE, OTHER]} subscriptionPlan={[]} onBackToStack={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /get it for/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/price has changed/i)
  expect(screen.getByRole('button', { name: new RegExp(`get it for £${moved.offerPrice.toFixed(2)}`, 'i') })).toBeInTheDocument()
})

it('renders nothing when no product in the stack pays on its own', () => {
  const cheap = (id: string) => product(id, 11.99, 6)
  const { container } = render(
    <LastChance slots={[slot('a', 90), slot('b', 80)]} products={[cheap('a'), cheap('b')]} subscriptionPlan={[]} onBackToStack={() => {}} />,
  )
  expect(container).toBeEmptyDOMElement()
})
