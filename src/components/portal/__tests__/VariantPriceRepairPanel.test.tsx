import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VariantPriceRepairPanel } from '../VariantPriceRepairPanel'
import { pendingProduct } from '../review/__tests__/fixtures'

const invalidateCatalogue = jest.fn()
jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: () => invalidateCatalogue() }))

const candidates = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    productId: `p${i}`,
    title: `Product ${i}`,
    variants: 2,
    onePrice: true,
    servingsKnown: 0,
    picturesKnown: 0,
  }))

const report = (o: Record<string, unknown> = {}) => ({
  asked: 4,
  answered: 4,
  unindexed: [],
  pricesFound: 4,
  servingsFound: 4,
  picturesFound: 2,
  slow: false,
  elapsedMs: 1200,
  error: null,
  ...o,
})

function serve(total: number, batches: Array<{ status?: number; body: unknown }>) {
  const offsets: number[] = []
  let n = 0
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const reply = (status: number, json: unknown) => ({ ok: status < 400, status, json: async () => json }) as Response
    if (url === '/api/portal/products?all=1') {
      return reply(200, { source: 'real', products: [{ product: pendingProduct({ id: 'p0', title: 'Product 0' }), state: 'pending' }] })
    }
    if (url === '/api/portal/products/repair-variant-pricing' && init?.method === 'POST') {
      offsets.push(JSON.parse(init.body as string).offset)
      const b = batches[Math.min(n++, batches.length - 1)]
      return reply(b.status ?? 200, b.body)
    }
    if (url === '/api/portal/products/repair-variant-pricing') return reply(200, { products: candidates(total), total })
    throw new Error(`unexpected ${url}`)
  }) as unknown as typeof fetch
  return offsets
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  invalidateCatalogue.mockClear()
})

describe('VariantPriceRepairPanel', () => {
  it('lists the one-price products by link, marking the ones waiting for review', async () => {
    serve(13, [])
    const onSummary = jest.fn()
    render(<VariantPriceRepairPanel onSummary={onSummary} />)

    const link = await screen.findByRole('link', { name: 'Product 0' })
    expect(link).toHaveAttribute('href', '/founderhub/products/item/p0#variants')
    expect(within(link.closest('li')!).getByText('Waiting for review')).toBeInTheDocument()
    expect(onSummary).toHaveBeenLastCalledWith({ count: 13, line: expect.stringMatching(/13 products with more than one SKU/) })
    await userEvent.click(screen.getByRole('button', { name: 'Show all 13' }))
    expect(screen.getByRole('link', { name: 'Product 12' })).toBeInTheDocument()
  })

  it('walks the batches from where each left off, and reports what it corrected', async () => {
    const offsets = serve(2, [
      {
        body: {
          ok: true,
          products: 1,
          totalProducts: 2,
          nextOffset: 1,
          report: report(),
          repaired: [{ productId: 'p0', title: 'Product 0', changed: { P1: 'price £20 → £24' } }],
        },
      },
      { body: { ok: true, products: 1, totalProducts: 2, nextOffset: null, report: report(), repaired: [] } },
    ])
    render(<VariantPriceRepairPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Fix mispriced variants' }))

    expect(await screen.findByText(/1 variant corrected across 1 product/)).toBeInTheDocument()
    expect(offsets).toEqual([0, 1])
    expect(screen.getByText('P1: price £20 → £24')).toBeInTheDocument()
    expect(invalidateCatalogue).toHaveBeenCalled()
  })

  it('stops when PowerBody answer for nothing, in their words, with the checks', async () => {
    const offsets = serve(3, [
      {
        body: {
          ok: true,
          products: 1,
          totalProducts: 3,
          nextOffset: 1,
          report: report({ answered: 0, pricesFound: 0, servingsFound: 0, picturesFound: 0, error: 'Too many requests (429).' }),
          repaired: [],
        },
      },
    ])
    render(<VariantPriceRepairPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Fix mispriced variants' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/stopped at 1 of 3 products.*They said: Too many requests \(429\)\./)
    expect(within(alert).getByRole('link', { name: 'Run the checks' })).toHaveAttribute('href', '/founderhub/settings/supplier')
    // The other two batches were never asked for.
    await waitFor(() => expect(offsets).toEqual([0]))
  })
})
