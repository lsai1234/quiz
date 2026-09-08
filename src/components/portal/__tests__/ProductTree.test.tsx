import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { ProductTree } from '../ProductTree'

jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: jest.fn() }))
// The page is server-rendered; the tree asks the router to re-read it after a
// write. There is no router in jsdom, and what it does is not what these assert.
const refresh = jest.fn()
const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))

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
      <ProductTree
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
    expect(screen.getByText(/P100 · no size · 33 servings · own picture · cost £11\.12/)).toBeInTheDocument()
    expect(screen.getByText(/P200 · no size · no servings · product picture · no cost/)).toBeInTheDocument()
  })

  it('marks a serving count that was scaled from the size rather than told to us', () => {
    // A star, because it is our inference from "1kg vs 2kg" and not PowerBody's
    // number — and it is the one the pull replaces with a real figure.
    render(
      <ProductTree
        product={product({
          servings: 30,
          variants: [
            variant({ id: 'a', title: '1kg', sku: 'P1', size: '1kg' }),
            variant({ id: 'b', title: '2kg', sku: 'P2', size: '2kg' }),
          ],
        })}
      />,
    )
    expect(screen.getByText(/P2 · 2kg · 60 servings\*/)).toBeInTheDocument()
  })

  it('pulls this product alone, and reports what changed per SKU', async () => {
    reply({
      ok: true,
      repaired: [{ productId: 'glycine', changed: { P200: '£14.99 → £39.99, 33 → 454 servings, picture' } }],
      report: { asked: 2, answered: 2, unindexed: [], pricesFound: 2, servingsFound: 2, picturesFound: 2, slow: false, elapsedMs: 900, error: null },
    })

    render(<ProductTree product={product()} />)
    await userEvent.click(screen.getByRole('button', { name: /Pull 2 SKUs/ }))

    await waitFor(() => expect(screen.getByText(/1 SKU updated/)).toBeInTheDocument())
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

    render(<ProductTree product={product()} />)
    await userEvent.click(screen.getByRole('button', { name: /Pull 2 SKUs/ }))
    await waitFor(() => expect(screen.getByText(/Nothing changed/)).toBeInTheDocument())
  })

  it('names the SKUs the crawled index cannot resolve, and where to fix that', async () => {
    reply({
      ok: true,
      repaired: [],
      report: { asked: 2, answered: 1, unindexed: ['P200'], pricesFound: 1, servingsFound: 1, picturesFound: 1, slow: false, elapsedMs: 800, error: null },
    })

    render(<ProductTree product={product()} />)
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

    render(<ProductTree product={product()} />)
    await userEvent.click(screen.getByRole('button', { name: /Pull 2 SKUs/ }))
    await waitFor(() => expect(screen.getByText(/ran out of time \(HTTP 504\)/)).toBeInTheDocument())
  })

  it('offers nothing to press when no variant carries a supplier code', () => {
    render(
      <ProductTree
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
    render(<ProductTree product={MUDDLED} />)

    // The row wearing the product's name gets the swap rather than the plain
    // copy — see "the two ends the wrong way round" below.
    await userEvent.click(screen.getByRole('button', { name: /^Make “Hydration\+” the product name/ }))
    expect(screen.getByLabelText('Product name')).toHaveValue('Hydration+')
  })

  it('saves the product name and the flavour labels together', async () => {
    reply({ ok: true })
    render(<ProductTree product={MUDDLED} />)

    await userEvent.clear(screen.getByLabelText('Product name'))
    await userEvent.type(screen.getByLabelText('Product name'), 'Hydration+')
    await userEvent.clear(screen.getByLabelText('Name for P48633'))
    await userEvent.type(screen.getByLabelText('Name for P48633'), 'Blue Raspberry')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.getByText(/will not overwrite those names/)).toBeInTheDocument())
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
    const { unmount } = render(<ProductTree product={MUDDLED} />)
    expect(screen.getByRole('button', { name: 'Use “Hydration+”' })).toBeInTheDocument()
    unmount()

    const unrelated = product({
      title: 'CHRGD Hydration',
      variants: [
        variant({ id: 'a', sku: 'P1', title: 'Blue Raspberry' }),
        variant({ id: 'b', sku: 'P2', title: 'Lemon & Lime' }),
      ],
    })
    render(<ProductTree product={unrelated} />)
    // The suggestion chip only — the per-row "…as the product name" buttons
    // are a different control and are always there.
    expect(screen.queryByRole('button', { name: /^Use “[^”]+”$/ })).not.toBeInTheDocument()
  })

  it('has nothing to save until something is edited', () => {
    render(<ProductTree product={MUDDLED} />)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('offers to promote only the rows that would change something', async () => {
    render(<ProductTree product={MUDDLED} />)
    // One row is wearing the product's name and is offered the swap; the other
    // is a flavour like any other and is offered the plain copy.
    expect(screen.getAllByRole('button', { name: /^Make “.+” the product name/ })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /as the product name$/ })).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: /^Make “Hydration\+” the product name/ }))
    // …and with the two ends the right way round there is nothing left to swap.
    // Both rows are now flavours differing from the title, so both offer the
    // ordinary copy — which is what a row that is merely a flavour should get.
    expect(screen.queryAllByRole('button', { name: /^Make “.+” the product name/ })).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: /as the product name$/ })).toHaveLength(2)
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
    render(<ProductTree product={SEVEN} />)
    expect(screen.getByText('Master SKU')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make P200 the master SKU' })).toBeInTheDocument()
    // The master's own row does not offer to become what it already is.
    expect(screen.queryByRole('button', { name: 'Make P100 the master SKU' })).not.toBeInTheDocument()
  })

  it('badges the variant actually on the shelf when the stored master is sold out', () => {
    // A stored master that is sold out is not what the shop is showing, and a
    // badge on it would describe something that is not happening.
    render(
      <ProductTree
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
    render(<ProductTree product={SEVEN} />)

    await userEvent.click(screen.getByRole('button', { name: 'Make P200 the master SKU' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.getByText(/now takes this product/)).toBeInTheDocument())
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
    render(<ProductTree product={SEVEN} />)
    await userEvent.clear(screen.getByLabelText('Name for P100'))
    await userEvent.type(screen.getByLabelText('Name for P100'), 'Capsules')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.getByText(/will not overwrite those names/)).toBeInTheDocument())
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.patch).not.toHaveProperty('basePrice')
    expect(body.patch).not.toHaveProperty('defaultVariantId')
  })

  it('has something to save the moment a different SKU is chosen', async () => {
    render(<ProductTree product={SEVEN} />)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Make P200 the master SKU' }))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })
})

describe('the two ends the wrong way round', () => {
  /*
    The shape a real import left behind, and the one the supplier-driven repair
    cannot touch: the siblings share no opening word ("Vegan Protein, …" beside
    "Protein, …"), so there is nothing for `commonProductName` to find.

      Vegan Protein, Banana - 500 grams        ← the product
        ├ Vegan Protein                        ← the product's name, on a row
        ├ Vegan Protein, Chocolate-Cinnamon - 500 grams
        └ Protein, Forest Fruit - 500 grams
  */
  const SWAPPED = product({
    title: 'Vegan Protein, Banana - 500 grams',
    variants: [
      variant({ id: 'a', sku: 'P37828', title: 'Vegan Protein', size: '500 grams' }),
      variant({ id: 'b', sku: 'P36120', title: 'Vegan Protein, Chocolate-Cinnamon - 500 grams', size: '500 grams' }),
      variant({ id: 'c', sku: 'P36122', title: 'Protein, Forest Fruit - 500 grams', size: '500 grams' }),
    ],
  })

  it('puts both ends back in one press', async () => {
    render(<ProductTree product={SWAPPED} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Make “Vegan Protein” the product name and call this row “Banana”' }),
    )
    expect(screen.getByLabelText('Product name')).toHaveValue('Vegan Protein')
    // …and the row stops wearing the product's name, which is the half a plain
    // copy leaves behind: a picker offering a flavour called "Vegan Protein".
    expect(screen.getByLabelText('Name for P37828')).toHaveValue('Banana')
  })

  it('offers the swap only on the row the title is carrying', () => {
    render(<ProductTree product={SWAPPED} />)
    expect(screen.getAllByRole('button', { name: /^Make “.+” the product name/ })).toHaveLength(1)
    // The others still offer the plain copy.
    expect(screen.getByRole('button', { name: /Use “Protein, Forest Fruit - 500 grams” as the product name/ })).toBeInTheDocument()
  })

  it('takes the product name off the flavours that are wearing it', async () => {
    render(<ProductTree product={SWAPPED} />)
    await userEvent.click(screen.getByRole('button', { name: /the product name and call this row/ }))

    // Two rows now start with "Vegan Protein": the chocolate one, and nothing
    // else — the forest fruit row is missing the "Vegan" and is left alone.
    await userEvent.click(screen.getByRole('button', { name: 'Take “Vegan Protein” off 1 flavour name' }))
    expect(screen.getByLabelText('Name for P36120')).toHaveValue('Chocolate-Cinnamon')
    expect(screen.getByLabelText('Name for P36122')).toHaveValue('Protein, Forest Fruit - 500 grams')
  })

  it('saves the flavour and the title together, and never the handle', async () => {
    reply({ ok: true })
    render(<ProductTree product={SWAPPED} />)
    await userEvent.click(screen.getByRole('button', { name: /the product name and call this row/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.getByText(/will not overwrite those names/)).toBeInTheDocument())
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.patch.title).toBe('Vegan Protein')
    // The shop's picker reads `flavour` and falls back to `title` — a row whose
    // flavour is still the old full name reads as it always did.
    expect(body.patch.variants[0]).toMatchObject({ title: 'Banana', flavour: 'Banana' })
    expect(body.patch).not.toHaveProperty('handle')
  })
})

describe('the shape on screen', () => {
  /*
    The point of the page. A flat list can SAY which SKU is the master, in a
    badge, and that is not the same as showing which one the product is and
    what hangs off it — the founder's question is about a hierarchy.
  */
  const SEVEN_ISH = product({
    defaultVariantId: 'c',
    variants: [
      variant({ id: 'a', sku: 'P1', title: 'Banana' }),
      variant({ id: 'b', sku: 'P2', title: 'Chocolate' }),
      variant({ id: 'c', sku: 'P3', title: 'Vanilla' }),
    ],
  })

  it('draws the master first, whatever order the SKUs are stored in', () => {
    render(<ProductTree product={SEVEN_ISH} />)
    const names = screen.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value)
    // The product's own name field, then the master, then the rest in order.
    expect(names).toEqual(['Glycine', 'Vanilla', 'Banana', 'Chocolate'])
  })

  it('says how many hang off it, and calls them what they are', () => {
    render(<ProductTree product={SEVEN_ISH} />)
    expect(screen.getByText('The master SKU')).toBeInTheDocument()
    expect(screen.getByText('2 flavours')).toBeInTheDocument()
  })

  it('re-draws the tree the moment a different SKU is made the master', async () => {
    render(<ProductTree product={SEVEN_ISH} />)
    await userEvent.click(screen.getByRole('button', { name: 'Make P1 the master SKU' }))

    const names = screen.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value)
    expect(names).toEqual(['Glycine', 'Banana', 'Chocolate', 'Vanilla'])
    // …and the SKU that WAS the master is now offered as one of the flavours.
    expect(screen.getByRole('button', { name: 'Make P3 the master SKU' })).toBeInTheDocument()
  })

  it('asks the server to re-read the product once a write lands', async () => {
    // The page is server-rendered, so a save is only finished when the server
    // has re-read it — that is what turns Save back off and what puts a pull's
    // new figures into the tree without anybody reloading.
    reply({ ok: true })
    render(<ProductTree product={SEVEN_ISH} />)
    await userEvent.click(screen.getByRole('button', { name: 'Make P1 the master SKU' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('leads back to the dashboard', () => {
    render(<ProductTree product={SEVEN_ISH} />)
    expect(screen.getByRole('link', { name: /Back to the dashboard/ })).toHaveAttribute(
      'href',
      '/founderhub/products/dashboard',
    )
  })

  it('says a sold-out SKU is sold out, without moving it off the master', () => {
    // The stored master is still the stored master; the tree draws what the
    // shop is showing, which is the first buyable one.
    render(
      <ProductTree
        product={product({
          defaultVariantId: 'a',
          variants: [
            variant({ id: 'a', sku: 'P1', title: 'Banana', available: false }),
            variant({ id: 'b', sku: 'P2', title: 'Chocolate' }),
          ],
        })}
      />,
    )
    expect(screen.getByText(/P1 · .* · sold out/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make P1 the master SKU' })).toBeInTheDocument()
  })
})

describe('two products sharing a page', () => {
  /*
    The case that started all this: one PowerBody master SKU hanging a tub of
    capsules and a bag of powder off it. Merged, they shared a page, a
    photograph and whichever of the two prices the master happened to have.
  */
  const GLYCINE = product({
    title: 'Glycine',
    defaultVariantId: 'caps',
    variants: [
      variant({ id: 'caps', sku: 'P100', title: '100 vcaps', size: '100 caps', price: 14.99 }),
      variant({ id: 'powder', sku: 'P200', title: 'Pure Powder', size: '454 grams', price: 39.99 }),
    ],
  })

  const FLAVOURS = product({
    title: 'Vegan Protein',
    variants: [
      variant({ id: 'a', sku: 'P1', title: 'Banana', size: '500 grams' }),
      variant({ id: 'b', sku: 'P2', title: 'Chocolate', size: '500 grams' }),
    ],
  })

  it('says which sizes it holds, with the figures', () => {
    render(<ProductTree product={GLYCINE} />)
    expect(screen.getByText(/2 SKUs are 2 different sizes: 1 × 100 caps, 1 × 454 grams/)).toBeInTheDocument()
  })

  it('says nothing at all about a product that is only flavours', () => {
    render(<ProductTree product={FLAVOURS} />)
    expect(screen.queryByText(/different sizes/)).not.toBeInTheDocument()
  })

  it('ticks the odd size for you', async () => {
    render(<ProductTree product={GLYCINE} />)
    await userEvent.click(screen.getByRole('button', { name: 'Tick the 1 × 454 grams' }))
    expect(screen.getByRole('checkbox', { name: 'Move P200 to its own product' })).toBeChecked()
    expect(screen.getByText('1 SKU ticked to move out.')).toBeInTheDocument()
  })

  it('moves the ticked SKUs out and lands on the new product', async () => {
    reply({ ok: true, moved: { id: 'glycine-p200', title: 'Glycine — 454 grams', skus: 1 }, kept: { id: 'glycine', skus: 1 } })
    render(<ProductTree product={GLYCINE} />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Move P200 to its own product' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move 1 SKU into their own product' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/founderhub/products/dashboard/glycine-p200'))
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/portal/products/split')
    expect(JSON.parse(init.body)).toEqual({ id: 'glycine', variantIds: ['powder'] })
  })

  it('will not move every SKU out, which is not a split', async () => {
    render(<ProductTree product={GLYCINE} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Move P100 to its own product' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Move P200 to its own product' }))

    expect(screen.getByText(/leave at least one behind/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Move 2 SKUs into their own product/ })).toBeDisabled()
  })
})
