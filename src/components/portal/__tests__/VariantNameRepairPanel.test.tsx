import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VariantNameRepairPanel } from '../VariantNameRepairPanel'
import { pendingProduct } from '../review/__tests__/fixtures'

const invalidateCatalogue = jest.fn()
jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: () => invalidateCatalogue() }))

const affected = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ productId: `p${i}`, title: `Product ${i}`, skus: [`P${100 + i}`] }))

const CSV = 'sku;manufacturer_name;name;flavour\nP100;Applied;Whey;Chocolate\n'

function serve(
  scan: { products: ReturnType<typeof affected>; total: number; variants: number; misnamed?: number },
  post: (body: { csv?: string; force?: boolean } | null) => { status: number; body: unknown },
) {
  const posts: Array<{ csv?: string; force?: boolean } | null> = []
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const reply = (status: number, json: unknown) => ({ ok: status < 400, status, json: async () => json }) as Response
    if (url === '/api/portal/products?all=1') {
      return reply(200, {
        source: 'real',
        products: [
          { product: pendingProduct({ id: 'p0', title: 'Product 0', review: undefined }), state: 'live' },
          { product: pendingProduct({ id: 'p1', title: 'Product 1' }), state: 'pending' },
        ],
      })
    }
    if (url === '/api/portal/products/repair-variants' && init?.method === 'POST') {
      const body = init.body ? (JSON.parse(init.body as string) as { csv?: string; force?: boolean }) : null
      posts.push(body)
      const r = post(body)
      return reply(r.status, r.body)
    }
    if (url === '/api/portal/products/repair-variants') return reply(200, scan)
    throw new Error(`unexpected ${url}`)
  }) as unknown as typeof fetch
  return posts
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  invalidateCatalogue.mockClear()
})

describe('VariantNameRepairPanel', () => {
  it('counts what it would fix, links each product, and marks the ones waiting for review', async () => {
    serve({ products: affected(14), total: 14, variants: 14 }, () => ({ status: 200, body: {} }))
    const onSummary = jest.fn()
    render(<VariantNameRepairPanel onSummary={onSummary} />)

    const first = await screen.findByRole('link', { name: 'Product 0' })
    expect(first).toHaveAttribute('href', '/founderhub/products/item/p0#variants')
    expect(within(screen.getByRole('link', { name: 'Product 1' }).closest('li')!).getByText('Waiting for review')).toBeInTheDocument()
    expect(onSummary).toHaveBeenLastCalledWith({ count: 14, line: expect.stringMatching(/14 flavours showing a code instead of a name/) })

    // Every product it counts can be opened, not only the first dozen.
    expect(screen.queryByRole('link', { name: 'Product 13' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show all 14' }))
    expect(screen.getByRole('link', { name: 'Product 13' })).toBeInTheDocument()
  })

  it('sends the chosen catalogue file and reports what it named', async () => {
    const posts = serve({ products: affected(1), total: 1, variants: 1 }, () => ({
      status: 200,
      body: {
        ok: true,
        total: 1,
        variants: 1,
        renamed: 0,
        unresolved: 0,
        source: 'csv',
        repaired: [{ productId: 'p0', title: 'Product 0', fixed: { P100: 'Chocolate' }, unresolved: [] }],
      },
    }))
    const { container } = render(<VariantNameRepairPanel />)
    await screen.findByRole('button', { name: 'Use catalogue CSV' })

    // The Button opens the picker; the hidden input behind it takes the file.
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]')
    await userEvent.upload(inputs[0], new File([CSV], 'catalogue.csv', { type: 'text/csv' }))

    expect(await screen.findByText(/1 flavour named across 1 product, from the catalogue file/)).toBeInTheDocument()
    expect(posts[0]).toEqual({ csv: CSV, force: false })
    expect(screen.getByText('P100 → Chocolate')).toBeInTheDocument()
    expect(invalidateCatalogue).toHaveBeenCalled()
  })

  it('re-labels everything only from its own button', async () => {
    const posts = serve({ products: affected(1), total: 1, variants: 1 }, () => ({
      status: 200,
      body: { ok: true, total: 0, variants: 0, renamed: 0, repaired: [], message: 'Nothing needed changing.' },
    }))
    const { container } = render(<VariantNameRepairPanel />)
    await screen.findByRole('button', { name: 'Re-label all from CSV' })
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]')
    await userEvent.upload(inputs[1], new File([CSV], 'catalogue.csv', { type: 'text/csv' }))
    await waitFor(() => expect(posts[0]).toEqual({ csv: CSV, force: true }))
  })

  it('when PowerBody have no names, says so and points to the file', async () => {
    serve({ products: affected(1), total: 1, variants: 1 }, () => ({
      status: 502,
      body: { error: 'No names could be found for any of those SKUs.' },
    }))
    render(<VariantNameRepairPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Try PowerBody API' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nothing was renamed: No names could be found for any of those SKUs. Use the catalogue CSV instead',
    )
    expect(invalidateCatalogue).not.toHaveBeenCalled()
  })
})
