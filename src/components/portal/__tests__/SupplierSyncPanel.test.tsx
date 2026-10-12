import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SupplierSyncPanel } from '../SupplierSyncPanel'
import { pendingProduct } from '../review/__tests__/fixtures'

const invalidateCatalogue = jest.fn()
jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: () => invalidateCatalogue() }))

const REPORT = {
  at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  source: 'powerbody',
  scanned: 40,
  updated: 2,
  missing: ['far-product'],
  changes: [
    { productId: 'whey', title: 'Impact Whey', sku: 'P100', costWas: 10, costNow: 12, costDeltaPct: 0.2, marginPctWas: 0.5, marginPctNow: 0.1, belowFloor: true },
    { productId: 'bar', title: 'Protein Bar', sku: 'P200', wasInStock: true, nowInStock: false },
  ],
}

function serve(report: unknown, { post }: { post?: () => { status: number; body: unknown } } = {}) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const reply = (status: number, json: unknown) => ({ ok: status < 400, status, json: async () => json }) as Response
    if (url === '/api/portal/products?all=1') {
      return reply(200, { source: 'real', products: [{ product: pendingProduct({ id: 'far-product', title: 'Rare Ashwagandha', review: undefined }), state: 'live' }] })
    }
    if (url === '/api/portal/supplier-sync' && init?.method === 'POST') {
      const r = post?.() ?? { status: 200, body: { ok: true, ...(report as object) } }
      return reply(r.status, r.body)
    }
    if (url === '/api/portal/supplier-sync') return reply(200, { ok: true, report })
    throw new Error(`unexpected ${url}`)
  }) as unknown as typeof fetch
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  invalidateCatalogue.mockClear()
})

describe('SupplierSyncPanel', () => {
  it('says a product was not reached this time — not that it was delisted — and links to it', async () => {
    serve(REPORT)
    render(<SupplierSyncPanel />)

    expect(await screen.findByText(/1 product was not reached this time/)).toBeInTheDocument()
    expect(screen.queryByText(/no longer in the feed/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/delisted —/i)).not.toBeInTheDocument()
    // Named by its title (the report only holds the id), linking to its page.
    expect(await screen.findByRole('link', { name: 'Rare Ashwagandha' })).toHaveAttribute(
      'href',
      '/founderhub/products/item/far-product#supplier',
    )
  })

  it('links every product it names to its page', async () => {
    serve(REPORT)
    render(<SupplierSyncPanel />)
    expect(await screen.findByText(/1 product now below the margin floor/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Impact Whey' })).toHaveAttribute('href', '/founderhub/products/item/whey#variants')
    const stock = screen.getByText('Stock changes (1)').parentElement!
    expect(within(stock).getByRole('link', { name: 'Protein Bar' })).toBeInTheDocument()
    expect(within(stock).getByText('went out of stock')).toBeInTheDocument()
  })

  it('reports its count and that it is running to the card around it', async () => {
    serve(REPORT)
    const onSummary = jest.fn()
    const onRunningChange = jest.fn()
    render(<SupplierSyncPanel onSummary={onSummary} onRunningChange={onRunningChange} />)
    await screen.findByText(/not reached this time/)
    expect(onSummary).toHaveBeenLastCalledWith(expect.objectContaining({ count: 2, line: expect.stringMatching(/1 not reached/) }))

    await userEvent.click(screen.getByRole('button', { name: 'Check now' }))
    expect(onRunningChange).toHaveBeenCalledWith(true)
    expect(onRunningChange).toHaveBeenLastCalledWith(false)
    expect(invalidateCatalogue).toHaveBeenCalled()
  })

  it('says what to do when the check fails, with a link to the checks', async () => {
    serve(null, { post: () => ({ status: 502, body: { ok: false, error: 'PowerBody timed out.' } }) })
    render(<SupplierSyncPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Check now' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/PowerBody timed out\. Nothing was changed by it\. Run the checks/)
    expect(within(alert).getByRole('link', { name: 'Run the checks' })).toHaveAttribute('href', '/founderhub/settings/supplier')
    expect(invalidateCatalogue).not.toHaveBeenCalled()
  })

  it('names every product it did not reach, not just the first dozen', async () => {
    const missing = Array.from({ length: 15 }, (_, i) => `far-${i}`)
    serve({ ...REPORT, changes: [], missing })
    render(<SupplierSyncPanel />)

    const list = await screen.findByRole('list', { name: 'Not reached this time' })
    expect(within(list).getAllByRole('link')).toHaveLength(12)
    await userEvent.click(screen.getByRole('button', { name: 'Show all 15' }))
    expect(within(list).getAllByRole('link')).toHaveLength(15)
    // Not in the product list (the test's index holds one product): named by id, still a link.
    expect(within(list).getByRole('link', { name: 'far-14' })).toHaveAttribute('href', '/founderhub/products/item/far-14#supplier')
  })
})
