import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LastChance } from '../LastChance'
import type { StackSlotEntry } from '@/lib/stack-blueprint/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { offerProductFor, publicQuote, quoteOffer } from '@/lib/last-chance/economics'
import { LAST_CHANCE_USED_KEY } from '@/lib/last-chance/source'

jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }))

/**
 * The last-chance card at the foot of the results page. What it shows has to
 * be the deal the server will honour, and what it sends has to be a variant and
 * the price and delivery it showed — never a price to charge.
 */

function product(id: string, price: number, cost: number, over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id, title: `CHRGD ${id}`, cost, basePrice: price, swapGroup: 'pre-workout-stim', stackSlots: ['energy'], goals: ['energy'],
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

it('shows the quote for the stack’s best product, and says only what is allowed', () => {
  render(<LastChance slots={[slot('pre', 90), slot('other', 40)]} products={[PRE, OTHER]} primaryGoal="energy" onBackToStack={() => {}} />)
  expect(screen.getByRole('heading', { name: /one-time deal on your top pick/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'CHRGD pre' })).toBeInTheDocument()
  expect(screen.getByText(/you told us your top goal is “more energy”/i)).toBeInTheDocument()
  // A pre-workout has no authorised claim: no "what it does", and none of the engine's free text.
  expect(screen.queryByText(/what it does/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/picked for your evening sessions/i)).not.toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/notice it|right away|within a few weeks/i)
  // The price on the button is the delivered price — what they will actually pay.
  expect(screen.getByRole('button', { name: new RegExp(`get it for £${quote.total.toFixed(2)}`, 'i') })).toBeInTheDocument()
  // Said plainly for screen readers while the big figure counts down to it.
  expect(screen.getByText(`£${quote.total.toFixed(2)} delivered, down from £${quote.normalTotal.toFixed(2)}`)).toBeInTheDocument()
})

it('leads with free delivery, then the percentage, and says the deal is only here', () => {
  expect(quote.deliveryDeal).toBe('free')
  render(<LastChance slots={[slot('pre', 90), slot('other', 40)]} products={[PRE, OTHER]} onBackToStack={() => {}} />)
  expect(screen.getByText(`Free delivery to the UK mainland, instead of £${quote.standardDelivery.toFixed(2)}.`)).toBeInTheDocument()
  if (quote.discountPct > 0) {
    expect(screen.getByText(`${quote.discountPct}% off: £${quote.offerPrice.toFixed(2)} instead of £${quote.listPrice.toFixed(2)}.`)).toBeInTheDocument()
  }
  expect(screen.getByText(/only on this page/i)).toBeInTheDocument()
  expect(screen.getByText(/isn’t in the shop, and no code unlocks it/i)).toBeInTheDocument()
  // No invented deadline.
  expect(document.body.textContent).not.toMatch(/ends|tonight|hurry|left to|expires/i)
})

it('sends the variant and the price it showed, nothing to charge', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ checkoutUrl: 'https://checkout.stripe.test/x', orderId: 'o1' }) })
  global.fetch = fetchMock as unknown as typeof fetch
  render(<LastChance slots={[slot('pre', 90), slot('other', 40)]} products={[PRE, OTHER]} onBackToStack={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /get it for/i }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/cart')
  const body = JSON.parse(init.body)
  expect(body.lastChance).toEqual({ variantId: 'v-pre', expectedPrice: quote.offerPrice, expectedDelivery: quote.deliveryCharge })
  expect(body.lines).toEqual([expect.objectContaining({ variantId: 'v-pre', quantity: 1 })])
  expect(body.lines[0].attributes).toContainEqual({ key: 'source', value: 'quiz-last-chance' })
  expect(body).not.toHaveProperty('partnerCode')
})

it('shows the server’s new deal when it moved, and says so', async () => {
  const r2 = (n: number) => Math.round(n * 100) / 100
  const moved = { ...publicQuote(quote), offerPrice: r2(quote.offerPrice + 1), total: r2(quote.total + 1) }
  global.fetch = jest.fn().mockResolvedValue({
    ok: false, status: 409, json: async () => ({ error: `This deal has changed: it’s now £${moved.total.toFixed(2)} delivered.`, offerChanged: true, quote: moved }),
  }) as unknown as typeof fetch
  render(<LastChance slots={[slot('pre', 90), slot('other', 40)]} products={[PRE, OTHER]} onBackToStack={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /get it for/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/deal has changed/i)
  expect(screen.getByRole('button', { name: new RegExp(`get it for £${moved.total.toFixed(2)}`, 'i') })).toBeInTheDocument()
})

it('stands down when the server says the deal is gone, rather than offering it again', async () => {
  const gone = { ...publicQuote(quote), viable: false }
  global.fetch = jest.fn().mockResolvedValue({
    ok: false, status: 409, json: async () => ({ error: 'This deal isn’t available any more.', offerChanged: true, quote: gone }),
  }) as unknown as typeof fetch
  render(<LastChance slots={[slot('pre', 90), slot('other', 40)]} products={[PRE, OTHER]} onBackToStack={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /get it for/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/isn’t available any more/i)
  expect(screen.getByRole('button', { name: /get it for/i })).toBeDisabled()
})

it('comes back to a card that can be tapped after Back from the payment page', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ checkoutUrl: 'https://checkout.stripe.test/x', orderId: 'o1' }) }) as unknown as typeof fetch
  render(<LastChance slots={[slot('pre', 90), slot('other', 40)]} products={[PRE, OTHER]} onBackToStack={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /get it for/i }))
  expect(await screen.findByRole('button', { name: /taking you to checkout/i })).toBeDisabled()
  // The browser restores the page from its back/forward cache.
  act(() => { window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })) })
  expect(screen.getByRole('button', { name: /get it for/i })).toBeEnabled()
})

it('is not offered again to a browser that has already had it', () => {
  window.localStorage.setItem(LAST_CHANCE_USED_KEY, '1')
  try {
    const { container } = render(<LastChance slots={[slot('pre', 90), slot('other', 40)]} products={[PRE, OTHER]} onBackToStack={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  } finally {
    window.localStorage.removeItem(LAST_CHANCE_USED_KEY)
  }
})

it('renders nothing when no product in the stack has a deal it can afford', () => {
  const cheap = (id: string) => product(id, 11.99, 6)
  const { container } = render(
    <LastChance slots={[slot('a', 90), slot('b', 80)]} products={[cheap('a'), cheap('b')]} onBackToStack={() => {}} />,
  )
  expect(container).toBeEmptyDOMElement()
})
