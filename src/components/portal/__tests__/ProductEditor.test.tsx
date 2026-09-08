import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { ProductEditor } from '../ProductEditor'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 42.99, compareAtPrice: null, available: true, ...over }
}

/** The Chunky Protein Bar: four flavours of one box, every SKU the same size. */
function product(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'chunky', title: 'Chunky Protein Bar', handle: 'chunky', description: '', imageUrl: null,
    category: 'Protein Bars', stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['bar'],
    variants: [
      variant({ id: 'a', sku: 'P1', title: 'Black Biscuit', size: '60 g', servings: 12 }),
      variant({ id: 'b', sku: 'P2', title: 'Coconut Dream', size: '60 g', servings: 12 }),
    ],
    basePrice: 42.99, compareAtPrice: null, servings: 12, subscriptionEligible: true,
    swapGroup: 'protein-bar', recommendationPriority: 5, marginPriority: 5, isCoreEligible: true,
    isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [],
    defaultVariantId: 'a', ...over,
  }
}

function reply(body: unknown, { ok = true, status = 200 } = {}) {
  global.fetch = jest.fn().mockResolvedValue({ ok, status, json: async () => body }) as unknown as typeof fetch
}

describe('editing a product’s serving count', () => {
  /*
    The bug this covers: "Servings per unit" wrote `product.servings`, and the
    shop reads the selected SKU's own count. A founder typed 20, watched it
    save, and saw 12 on the shelf for ever — an edit that appears to work.
  */
  it('carries the number onto the SKUs the shop reads', async () => {
    reply({ ok: true })
    render(<ProductEditor product={product()} allProducts={[]} onClose={jest.fn()} onSaved={jest.fn()} />)

    const field = screen.getByLabelText('Servings per unit')
    await userEvent.clear(field)
    await userEvent.type(field, '20')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.patch.servings).toBe(20)
    expect(body.patch.variants.map((v: { servings: number }) => v.servings)).toEqual([20, 20])
  })

  it('says how many SKUs it will apply to', () => {
    render(<ProductEditor product={product()} allProducts={[]} onClose={jest.fn()} onSaved={jest.fn()} />)
    expect(screen.getByText(/Applies to the 2 SKUs of this size/)).toBeInTheDocument()
  })

  it('leaves the SKUs alone when the number was not touched', async () => {
    // Every save posts `servings`, so "did it change" is the only honest test —
    // otherwise opening a product and pressing Save rewrites its variants.
    reply({ ok: true })
    render(<ProductEditor product={product()} allProducts={[]} onClose={jest.fn()} onSaved={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.patch).not.toHaveProperty('variants')
  })
})
