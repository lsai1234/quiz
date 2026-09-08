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
    The bug behind these: "Servings per unit" writes `product.servings`, and the
    shop reads the selected SKU's own count. A founder typed 20, watched it
    save, and saw 12 on the shelf.

    The fix is NOT here — it is in `applyProductOverrides`, which now lets a
    founder's number beat the supplier's per-SKU one when the catalogue is
    composed. That is deliberate: one rule in one place, and every product
    already carrying a founder's number came right without anybody retyping it.
    This editor's job is only to send the number.
  */
  it('shows the founder’s number and sends it', async () => {
    reply({ ok: true })
    render(<ProductEditor product={product({ servings: 20 })} allProducts={[]} onClose={jest.fn()} onSaved={jest.fn()} />)
    expect(screen.getByLabelText('Servings per unit')).toHaveValue(20)

    const field = screen.getByLabelText('Servings per unit')
    await userEvent.clear(field)
    await userEvent.type(field, '25')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.patch.servings).toBe(25)
    // The variants are not rewritten from here. Composing does that, so a save
    // for some other reason cannot quietly restate every SKU's serving count.
    expect(body.patch).not.toHaveProperty('variants')
  })

  it('says what the number covers', () => {
    render(<ProductEditor product={product()} allProducts={[]} onClose={jest.fn()} onSaved={jest.fn()} />)
    expect(screen.getByText(/what the shop shows for the 2 SKUs of this size/)).toBeInTheDocument()
  })

  it('turns an emptied box into a zero, not a NaN', async () => {
    // `parseFloat('')` is NaN, which React will not render and which
    // `JSON.stringify` sends as null — so clearing a field to retype it wrote a
    // null into the catalogue.
    reply({ ok: true })
    render(<ProductEditor product={product()} allProducts={[]} onClose={jest.fn()} onSaved={jest.fn()} />)
    await userEvent.clear(screen.getByLabelText('Servings per unit'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.patch.servings).toBe(0)
  })
})
