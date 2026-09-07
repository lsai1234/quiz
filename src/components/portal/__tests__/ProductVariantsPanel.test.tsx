import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { ProductVariantsPanel } from '../ProductVariantsPanel'

jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: jest.fn() }))

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 14.99, compareAtPrice: null, available: true, ...over }
}

function product(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'glycine', title: 'Glycine', handle: 'glycine', description: '', imageUrl: null,
    category: 'Amino Acids', stackSlots: ['recovery'], goals: ['recovery'], dietaryTags: [],
    formats: ['capsule'],
    variants: [
      variant({ id: 'caps', title: '100 vcaps', sku: 'P100' }),
      variant({ id: 'powder', title: 'Pure Powder', sku: 'P200' }),
    ],
    basePrice: 14.99, compareAtPrice: null, servings: 33, subscriptionEligible: true,
    swapGroup: 'aminos', recommendationPriority: 5, marginPriority: 5, isCoreEligible: true,
    isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [], ...over,
  }
}

function reply(body: unknown, { ok = true, status = 200 } = {}) {
  global.fetch = jest.fn().mockResolvedValue({ ok, status, json: async () => body }) as unknown as typeof fetch
}

describe('one product’s variants', () => {
  it('says what is held for each variant, and what is still borrowed from the product', () => {
    render(
      <ProductVariantsPanel
        product={product({
          variants: [
            variant({ id: 'caps', title: '100 vcaps', sku: 'P100', servings: 33, imageUrl: 'https://pb/caps.jpg', cost: 11.12 }),
            variant({ id: 'powder', title: 'Pure Powder', sku: 'P200' }),
          ],
        })}
      />,
    )

    // The one with its own facts, and the one with none of them: no serving
    // count of its own, no size to scale one from, and no picture but the
    // product's. That row is precisely what the pull is for.
    expect(screen.getByText(/P100 · 33 servings · own picture · cost £11\.12/)).toBeInTheDocument()
    expect(screen.getByText(/P200 · no servings · product picture · no cost/)).toBeInTheDocument()
  })

  it('marks a serving count that was scaled from the size rather than told to us', () => {
    // A star, because it is our inference from "1kg vs 2kg" and not PowerBody's
    // number — and it is the one the pull replaces with a real figure.
    render(
      <ProductVariantsPanel
        product={product({
          servings: 30,
          variants: [
            variant({ id: 'a', title: '1kg', sku: 'P1', size: '1kg' }),
            variant({ id: 'b', title: '2kg', sku: 'P2', size: '2kg' }),
          ],
        })}
      />,
    )
    expect(screen.getByText(/P2 · 60 servings\*/)).toBeInTheDocument()
  })

  it('pulls this product alone, and reports what changed per SKU', async () => {
    reply({
      ok: true,
      repaired: [{ productId: 'glycine', changed: { P200: '£14.99 → £39.99, 33 → 454 servings, picture' } }],
      report: { asked: 2, answered: 2, unindexed: [], pricesFound: 2, servingsFound: 2, picturesFound: 2, slow: false, elapsedMs: 900, error: null },
    })

    render(<ProductVariantsPanel product={product()} />)
    await userEvent.click(screen.getByRole('button', { name: /Pull 2 SKUs/ }))

    await waitFor(() => expect(screen.getByText('1 variant updated.')).toBeInTheDocument())
    // Scoped to the product on screen — not the whole catalogue sweep.
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body).toEqual({ productId: 'glycine' })
    expect(screen.getByText(/just now: £14\.99 → £39\.99, 33 → 454 servings, picture/)).toBeInTheDocument()
  })

  it('says plainly when PowerBody agreed with everything we hold', async () => {
    reply({
      ok: true,
      repaired: [],
      report: { asked: 2, answered: 2, unindexed: [], pricesFound: 2, servingsFound: 2, picturesFound: 2, slow: false, elapsedMs: 800, error: null },
    })

    render(<ProductVariantsPanel product={product()} />)
    await userEvent.click(screen.getByRole('button', { name: /Pull 2 SKUs/ }))
    await waitFor(() => expect(screen.getByText(/Nothing changed/)).toBeInTheDocument())
  })

  it('names the SKUs the crawled index cannot resolve, and where to fix that', async () => {
    reply({
      ok: true,
      repaired: [],
      report: { asked: 2, answered: 1, unindexed: ['P200'], pricesFound: 1, servingsFound: 1, picturesFound: 1, slow: false, elapsedMs: 800, error: null },
    })

    render(<ProductVariantsPanel product={product()} />)
    await userEvent.click(screen.getByRole('button', { name: /Pull 2 SKUs/ }))
    await waitFor(() => expect(screen.getByText(/answered for 1 of 2 SKUs/)).toBeInTheDocument())
    expect(screen.getByText(/P200 is not in the crawled product list/)).toBeInTheDocument()
  })

  it('reports our own timeout as ours, not as the supplier being unreachable', async () => {
    // A gateway timeout has no JSON body. Blaming PowerBody for it sends
    // somebody to check the wrong thing.
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 504, json: async () => { throw new Error('not json') },
    }) as unknown as typeof fetch

    render(<ProductVariantsPanel product={product()} />)
    await userEvent.click(screen.getByRole('button', { name: /Pull 2 SKUs/ }))
    await waitFor(() => expect(screen.getByText(/ran out of time \(HTTP 504\)/)).toBeInTheDocument())
  })

  it('offers nothing to press when no variant carries a supplier code', () => {
    render(
      <ProductVariantsPanel
        product={product({ variants: [variant({ id: 'a', sku: null }), variant({ id: 'b', sku: null })] })}
      />,
    )
    expect(screen.getByRole('button', { name: /Pull 0 SKUs/ })).toBeDisabled()
    expect(screen.getByText(/No supplier codes on this product/)).toBeInTheDocument()
  })
})
