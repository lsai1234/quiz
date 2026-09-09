import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PriceRow } from '@/lib/catalogue/price'
import { ProductPricing } from '../ProductPricing'

jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: jest.fn() }))
// The page is server-rendered; the panel asks the router to re-read it after a
// write, and what that does is not what these assert.
const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: jest.fn() }) }))

function row(over: Partial<PriceRow> = {}): PriceRow {
  return {
    variantId: 'caps',
    label: 'P100',
    title: '100 vcaps',
    sku: 'P100',
    price: 21.99,
    cost: 11.12,
    rrp: 15.5,
    wasPrice: null,
    rulePrice: 21.99,
    manual: false,
    isMaster: true,
    belowCost: false,
    ...over,
  }
}

function reply(body: unknown, { ok = true, status = 200 } = {}) {
  global.fetch = jest.fn().mockResolvedValue({ ok, status, json: async () => body }) as unknown as typeof fetch
}

function panel(rows: PriceRow[] = [row()], props: Partial<React.ComponentProps<typeof ProductPricing>> = {}) {
  return (
    <ProductPricing productId="glycine" basePrice={21.99} rows={rows} markupOnCost={2} {...props} />
  )
}

/** What the last POST carried. */
function lastBody() {
  const call = (global.fetch as jest.Mock).mock.calls.at(-1)
  return JSON.parse(call[1].body)
}

describe('the prices on one product', () => {
  it('puts what they charge us, their RRP and the rule price beside each other', () => {
    render(panel())

    expect(
      screen.getByText(/PowerBody charge us £11\.12 · their RRP £15\.50 · the rule says £21\.99/),
    ).toBeInTheDocument()
    expect(screen.getByText(/The shop shows £21\.99 for this product/)).toBeInTheDocument()
  })

  it('states the rule it is running by rather than asserting one', () => {
    // The markup is a founder-editable setting, so the sentence takes it from
    // the server rather than repeating a number that may have moved.
    render(panel([row()], { markupOnCost: 2.2 }))
    expect(screen.getByText(/2\.2× what PowerBody charge us, rounded down to \.99/)).toBeInTheDocument()
  })

  it('says the rule cannot price a SKU nothing knows the cost of, and what to press', () => {
    render(panel([row({ cost: null, rulePrice: null, rrp: null })]))

    expect(screen.getByText(/No supplier price on file · so the rule cannot price it/)).toBeInTheDocument()
    expect(screen.getByText(/Press “Pull from PowerBody” above/)).toBeInTheDocument()
    // Nothing to go back to, so the way back is not offered as a button that
    // could only fail.
    expect(screen.queryByRole('button', { name: /back on the rule price/i })).not.toBeInTheDocument()
  })

  it('does not send somebody to PowerBody about a product with no supplier code', () => {
    render(panel([row({ sku: null, label: 'Unflavoured / 500g', cost: null, rulePrice: null, rrp: null })]))
    expect(screen.getByText(/No supplier code on this product/)).toBeInTheDocument()
  })

  it('names the “was” price the card is drawing, which our price has to make sense against', () => {
    render(panel([row({ price: 21.99, wasPrice: 29.99 })]))
    expect(screen.getByText(/the card shows “was £29\.99”/)).toBeInTheDocument()
  })

  it('says so when the shelf price does not cover what we pay', () => {
    render(panel([row({ price: 9.99, belowCost: true })]))

    expect(screen.getByText('Below cost')).toBeInTheDocument()
    expect(screen.getByText(/£9\.99 does not cover the £11\.12 we pay for it/)).toBeInTheDocument()
  })

  it('has nothing to offer on a product with no SKUs, and says that', () => {
    render(panel([]))
    expect(screen.getByText(/no SKUs, so there is nothing to price/)).toBeInTheDocument()
  })
})

describe('setting our own price', () => {
  it('sends the typed price for that one SKU', async () => {
    reply({ ok: true, basePrice: 18.5, rows: [row({ price: 18.5, manual: true })] })
    render(panel())

    const box = screen.getByLabelText('Our price for P100')
    await userEvent.clear(box)
    await userEvent.type(box, '18.50')
    await userEvent.click(screen.getByRole('button', { name: 'Set our price for P100' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/api/portal/products/price')
    expect(lastBody()).toEqual({ productId: 'glycine', variantId: 'caps', price: 18.5 })
    // And says what it means, including that the product moved with its master.
    expect(await screen.findByText(/P100 is £18\.50 until you change it — and so is the product/)).toBeInTheDocument()
  })

  it('does not offer to save a price nobody has changed', async () => {
    render(panel())
    expect(screen.getByRole('button', { name: 'Set our price for P100' })).toBeDisabled()

    const box = screen.getByLabelText('Our price for P100')
    await userEvent.clear(box)
    await userEvent.type(box, '18.50')
    expect(screen.getByRole('button', { name: 'Set our price for P100' })).toBeEnabled()
  })

  it('refuses an empty or nonsense price without asking the server', async () => {
    reply({ ok: true })
    render(panel())

    const box = screen.getByLabelText('Our price for P100')
    await userEvent.clear(box)
    await userEvent.type(box, '0')
    await userEvent.click(screen.getByRole('button', { name: 'Set our price for P100' }))

    expect(await screen.findByText(/Give P100 a price above £0/)).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('puts a SKU back on the rule', async () => {
    reply({ ok: true, basePrice: 21.99, rows: [row({ price: 21.99, manual: false })] })
    render(panel([row({ price: 18.5, manual: true })]))

    expect(screen.getByText('Your price')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /back on the rule price of £21\.99/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(lastBody()).toEqual({ productId: 'glycine', variantId: 'caps', price: null })
    expect(await screen.findByText(/P100 is back on the rule at £21\.99/)).toBeInTheDocument()
  })

  it('shows the server\'s own words when it refuses', async () => {
    reply({ error: 'No supplier price on file for that SKU.' }, { ok: false, status: 400 })
    render(panel([row({ price: 18.5, manual: true })]))

    await userEvent.click(screen.getByRole('button', { name: /back on the rule price/i }))
    expect(await screen.findByText('No supplier price on file for that SKU.')).toBeInTheDocument()
  })
})
