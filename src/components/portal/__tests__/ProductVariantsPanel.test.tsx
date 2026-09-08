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

describe('naming a product by hand', () => {
  /*
    The escape hatch. The supplier-driven repair works from what PowerBody call
    each SKU, which is right by default and not always enough — their names
    disagree, a SKU is missing from the feed, the diff produces something nobody
    would write. This is the founder saying which one is the product.
  */
  const MUDDLED = product({
    title: 'Hydration+, Blue Raspberry - 240 grams',
    variants: [
      variant({ id: 'a', sku: 'P48633', title: 'Hydration+' }),
      variant({ id: 'b', sku: 'P48636', title: 'Hydration+, Lemon & Lime - 240 grams' }),
    ],
  })

  it('promotes a flavour row to the product name in one press', async () => {
    render(<ProductVariantsPanel product={MUDDLED} />)

    await userEvent.click(screen.getByRole('button', { name: /Use “Hydration\+” as the product name/ }))
    expect(screen.getByLabelText('Product name')).toHaveValue('Hydration+')
  })

  it('saves the product name and the flavour labels together', async () => {
    reply({ ok: true })
    render(<ProductVariantsPanel product={MUDDLED} />)

    await userEvent.clear(screen.getByLabelText('Product name'))
    await userEvent.type(screen.getByLabelText('Product name'), 'Hydration+')
    await userEvent.clear(screen.getByLabelText('Name for P48633'))
    await userEvent.type(screen.getByLabelText('Name for P48633'), 'Blue Raspberry')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.getByText(/Names saved/)).toBeInTheDocument())
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/portal/products')
    const body = JSON.parse(init.body)
    expect(body.id).toBe('glycine')
    expect(body.patch.title).toBe('Hydration+')
    // The label and the flavour move together: the shop's picker reads
    // `flavour`, so setting one and not the other names it two different things.
    expect(body.patch.variants[0]).toMatchObject({ title: 'Blue Raspberry', flavour: 'Blue Raspberry' })
    // …and an untouched row keeps exactly what it had.
    expect(body.patch.variants[1]).toMatchObject({ title: 'Hydration+, Lemon & Lime - 240 grams' })
    // The handle is never in the patch — it is the product's URL.
    expect(body.patch).not.toHaveProperty('handle')
  })

  it('offers what the flavours share, and nothing when they share nothing', () => {
    const { unmount } = render(<ProductVariantsPanel product={MUDDLED} />)
    expect(screen.getByRole('button', { name: 'Use “Hydration+”' })).toBeInTheDocument()
    unmount()

    const unrelated = product({
      title: 'CHRGD Hydration',
      variants: [
        variant({ id: 'a', sku: 'P1', title: 'Blue Raspberry' }),
        variant({ id: 'b', sku: 'P2', title: 'Lemon & Lime' }),
      ],
    })
    render(<ProductVariantsPanel product={unrelated} />)
    // The suggestion chip only — the per-row "…as the product name" buttons
    // are a different control and are always there.
    expect(screen.queryByRole('button', { name: /^Use “[^”]+”$/ })).not.toBeInTheDocument()
  })

  it('has nothing to save until something is edited', () => {
    render(<ProductVariantsPanel product={MUDDLED} />)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('offers to promote only the rows that would change something', async () => {
    render(<ProductVariantsPanel product={MUDDLED} />)
    // Both rows differ from the title to begin with.
    expect(screen.getAllByRole('button', { name: /as the product name$/ })).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: /Use “Hydration\+” as the product name/ }))
    // …and the row that is now the product name stops offering to become it.
    expect(screen.getAllByRole('button', { name: /as the product name$/ })).toHaveLength(1)
  })
})

describe('choosing which SKU is the master', () => {
  /*
    PowerBody sell one product as several SKUs, one of which is the listing the
    others hang off. Import kept whichever the roster had in its main column, so
    a product could go live wearing the wrong flavour's photograph, price and
    serving count — and nothing could move it.
  */
  const SEVEN = product({
    defaultVariantId: 'caps',
    basePrice: 14.99,
    servings: 33,
    variants: [
      variant({ id: 'caps', sku: 'P100', title: '100 vcaps', price: 14.99, servings: 33 }),
      variant({ id: 'powder', sku: 'P200', title: 'Pure Powder', price: 39.99, servings: 454, imageUrl: 'https://pb/powder.jpg', cost: 24.5 }),
    ],
  })

  it('badges the one the shop presents, and offers the rest', () => {
    render(<ProductVariantsPanel product={SEVEN} />)
    expect(screen.getByText('Master SKU')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make P200 the master SKU' })).toBeInTheDocument()
    // The master's own row does not offer to become what it already is.
    expect(screen.queryByRole('button', { name: 'Make P100 the master SKU' })).not.toBeInTheDocument()
  })

  it('badges the variant actually on the shelf when the stored master is sold out', () => {
    // A stored master that is sold out is not what the shop is showing, and a
    // badge on it would describe something that is not happening.
    render(
      <ProductVariantsPanel
        product={product({
          defaultVariantId: 'caps',
          variants: [
            variant({ id: 'caps', sku: 'P100', title: '100 vcaps', available: false }),
            variant({ id: 'powder', sku: 'P200', title: 'Pure Powder' }),
          ],
        })}
      />,
    )
    expect(screen.getByRole('button', { name: 'Make P100 the master SKU' })).toBeInTheDocument()
  })

  it('moves the price, picture, cost and serving count onto the chosen SKU', async () => {
    reply({ ok: true })
    render(<ProductVariantsPanel product={SEVEN} />)

    await userEvent.click(screen.getByRole('button', { name: 'Make P200 the master SKU' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.getByText(/The shop now shows this product/)).toBeInTheDocument())
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.patch).toMatchObject({
      defaultVariantId: 'powder',
      basePrice: 39.99,
      servings: 454,
      cost: 24.5,
      imageUrl: 'https://pb/powder.jpg',
    })
    // The name is NOT the master's. A master SKU is still one flavour, and
    // naming the product after it is the bug this screen exists to undo.
    expect(body.patch.title).toBe('Glycine')
  })

  it('does not touch the shelf price when only a name was edited', async () => {
    // The master a product is ALREADY showing may never have been written
    // down. Saving a name is not the moment to pin it, and certainly not the
    // moment to move basePrice onto whichever variant was listed first.
    reply({ ok: true })
    render(<ProductVariantsPanel product={SEVEN} />)
    await userEvent.clear(screen.getByLabelText('Name for P100'))
    await userEvent.type(screen.getByLabelText('Name for P100'), 'Capsules')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.getByText(/Names saved/)).toBeInTheDocument())
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.patch).not.toHaveProperty('basePrice')
    expect(body.patch).not.toHaveProperty('defaultVariantId')
  })

  it('has something to save the moment a different SKU is chosen', async () => {
    render(<ProductVariantsPanel product={SEVEN} />)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Make P200 the master SKU' }))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })
})
