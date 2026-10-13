import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VariantsSection } from '../VariantsSection'
import { SupplierSection } from '../SupplierSection'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { ProductPayload } from '@/lib/portal/product-edit'
import type { PriceRow } from '@/lib/catalogue/price'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: jest.fn() }) }))

const v = (over: Partial<CatalogueVariant> & { id: string }): CatalogueVariant => ({
  title: over.id,
  flavour: over.id,
  size: null,
  price: 19.99,
  compareAtPrice: null,
  available: true,
  sku: `P-${over.id}`,
  ...over,
})

function payload(product: Partial<CatalogueProduct>, rows: PriceRow[] = []): ProductPayload {
  return {
    product: { ...(MOCK_CATALOGUE[0] as CatalogueProduct), id: 'glycine', handle: 'glycine', title: 'Glycine', ...product },
    state: 'live',
    storage: 'imported',
    readiness: { productId: 'glycine', overall: 'ok', checks: [] },
    remaining: [],
    priceRows: rows,
    markupOnCost: 2,
    usage: { topRank: null, bundles: [], stacks: [] },
    usageWarning: null,
    source: 'real',
  }
}

const originalFetch = global.fetch
let calls: Array<{ url: string; body: Record<string, unknown> }>
beforeEach(() => {
  calls = []
  push.mockClear()
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ url, body })
    const data = url.includes('/split') ? { ok: true, moved: { id: 'glycine-454g' } } : { ok: true, ...payload({}) }
    return { ok: true, status: 200, json: async () => data, headers: new Headers() } as Response
  }) as unknown as typeof fetch
})
afterEach(() => {
  global.fetch = originalFetch
})

const noop = () => {}

/** A streamed reply, the way the pull answers — jsdom has no Response streams. */
function streamed(lines: unknown[]) {
  const chunks = lines.map((l) => new TextEncoder().encode(`${JSON.stringify(l)}\n`))
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/x-ndjson' },
    body: {
      getReader: () => ({
        read: async () => (chunks.length > 0 ? { value: chunks.shift(), done: false } : { value: undefined, done: true }),
      }),
    },
  } as unknown as Response
}

describe('flavours, sizes & prices', () => {
  const glycine = {
    defaultVariantId: 'powder',
    servings: 33,
    variants: [
      v({ id: 'caps', title: '100 vcaps', flavour: null, size: '100 caps', servings: 33 }),
      v({ id: 'powder', title: 'Pure Powder', flavour: null, size: '454 grams' }),
    ],
  }

  it('draws the master first, whatever order the SKUs are stored in', () => {
    render(<VariantsSection payload={payload(glycine)} onPayload={noop} onDirty={noop} />)
    const titles = screen.getAllByText(/100 vcaps|Pure Powder/).map((n) => n.textContent ?? '')
    expect(titles[0]).toMatch(/Pure Powder/)
    expect(screen.getByText(/P-caps · 100 caps/)).toHaveTextContent('33 servings')
  })

  it('marks a serving count scaled from the master rather than told to us', () => {
    const whey = {
      defaultVariantId: 'kg',
      servings: 33,
      variants: [v({ id: 'kg', size: '1kg', servings: 33 }), v({ id: 'two', size: '2kg' })],
    }
    render(<VariantsSection payload={payload(whey)} onPayload={noop} onDirty={noop} />)
    expect(screen.getByText(/P-two · 2kg/)).toHaveTextContent(/servings\*/)
  })

  it('says which sizes it holds, ticks the odd one out, and lands on the new product after a split', async () => {
    render(<VariantsSection payload={payload(glycine)} onPayload={noop} onDirty={noop} />)
    expect(screen.getByText(/2 different sizes/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tick the 1 × 100 caps' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move 1 into their own product' }))
    expect(calls.at(-1)).toEqual({ url: '/api/portal/products/split', body: { id: 'glycine', variantIds: ['caps'] } })
    expect(push).toHaveBeenCalledWith('/founderhub/products/item/glycine-454g')
  })

  it('will not move every SKU out, which is not a split', async () => {
    render(<VariantsSection payload={payload(glycine)} onPayload={noop} onDirty={noop} />)
    for (const box of screen.getAllByRole('checkbox', { name: /Move .* to its own product/ })) await userEvent.click(box)
    expect(screen.getByRole('button', { name: 'Move 2 into their own product' })).toBeDisabled()
  })

  it('takes the product name off the flavours wearing it, in one press', async () => {
    const whey = {
      title: 'Vegan Protein',
      defaultVariantId: 'a',
      variants: [v({ id: 'a', title: 'Vegan Protein, Chocolate' }), v({ id: 'b', title: 'Vegan Protein, Vanilla' })],
    }
    render(<VariantsSection payload={payload(whey)} onPayload={noop} onDirty={noop} />)
    await userEvent.click(screen.getByRole('button', { name: 'Take “Vegan Protein” off them' }))
    expect(calls.at(-1)?.body).toEqual({
      id: 'glycine',
      variants: [
        { id: 'a', title: 'Chocolate' },
        { id: 'b', title: 'Vanilla' },
      ],
    })
  })

  it('sets our own price for one SKU through the price route, and can put it back on the rule', async () => {
    const rows: PriceRow[] = [
      { variantId: 'caps', label: 'P-caps', title: '100 vcaps', sku: 'P-caps', price: 19.99, cost: 11.12, rrp: 26, wasPrice: null, rulePrice: 21.99, manual: true, isMaster: false, belowCost: false },
    ]
    const p = { ...glycine, variants: [{ ...glycine.variants[0], priceSource: 'founder' as const }, glycine.variants[1]] }
    render(<VariantsSection payload={payload(p, rows)} onPayload={noop} onDirty={noop} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1])
    const box = screen.getByLabelText('Our price for 100 vcaps')
    await userEvent.clear(box)
    await userEvent.type(box, '17.5')
    await userEvent.click(screen.getByRole('button', { name: 'Set our price' }))
    expect(calls.at(-1)).toEqual({ url: '/api/portal/products/price', body: { productId: 'glycine', variantId: 'caps', price: 17.5 } })

    await userEvent.click(screen.getByRole('button', { name: 'Use the rule price (£21.99)' }))
    expect(calls.at(-1)?.body).toEqual({ productId: 'glycine', variantId: 'caps', price: null })
  })

  it('does not offer to save a price nobody changed', async () => {
    render(<VariantsSection payload={payload(glycine)} onPayload={noop} onDirty={noop} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(screen.getByRole('button', { name: 'Set our price' })).toBeDisabled()
  })

  it('says so when a shelf price does not cover what we pay', () => {
    const rows: PriceRow[] = [
      { variantId: 'powder', label: 'P-powder', title: 'Pure Powder', sku: 'P-powder', price: 9.99, cost: 20.04, rrp: null, wasPrice: null, rulePrice: 39.99, manual: true, isMaster: true, belowCost: true },
    ]
    render(<VariantsSection payload={payload(glycine, rows)} onPayload={noop} onDirty={noop} />)
    expect(screen.getByText(/P-powder sells at £9.99 but costs us £20.04/)).toBeInTheDocument()
  })

  it('sets one serving count for every SKU of a size, and says whose counts it replaces', async () => {
    const whey = {
      defaultVariantId: 'a',
      variants: [v({ id: 'a', size: '1kg', servings: 33 }), v({ id: 'b', size: '1kg' })],
    }
    render(<VariantsSection payload={payload(whey)} onPayload={noop} onDirty={noop} />)
    expect(screen.getByText(/1 know their own count \(33\), 1 scaled/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Servings for every 1kg SKU'), '30')
    await userEvent.click(screen.getByRole('button', { name: 'Set for all 2' }))
    expect(calls.at(-1)?.body).toEqual({ id: 'glycine', variants: [{ id: 'a', servings: 30 }, { id: 'b', servings: 30 }] })
  })
})

describe('merging another product in', () => {
  /** The picker's list: one product on sale, one still waiting for review. */
  const others = [
    { state: 'live', product: { id: 'whey-choc', title: 'Whey Chocolate', variants: [v({ id: 'choc' })] } },
    { state: 'pending', product: { id: 'whey-straw', title: 'Whey Strawberry', variants: [v({ id: 'straw' })] } },
  ]

  /** Answers like the products route; `merge` can be told to refuse. */
  function serve(refuse?: { error: string; link: { label: string; href: string } }) {
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      calls.push({ url, body })
      if (url.includes('all=1')) return { ok: true, status: 200, json: async () => ({ products: others }) } as Response
      if (refuse && body.action === 'merge') return { ok: false, status: 409, json: async () => ({ error: refuse.error, link: refuse.link }) } as Response
      return { ok: true, status: 200, json: async () => ({ ok: true, ...payload({}) }) } as Response
    }) as unknown as typeof fetch
  }

  async function choose(p: ProductPayload, title: string) {
    const onPayload = jest.fn()
    render(<VariantsSection payload={p} onPayload={onPayload} onDirty={noop} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.type(screen.getByLabelText('Find the product to bring in'), 'whey')
    const row = (await screen.findByText(title)).closest('div')!
    await userEvent.click(within(row).getByRole('button', { name: 'Choose' }))
    return onPayload
  }

  const waiting = () => ({ ...payload({ id: 'whey-van', title: 'Whey Vanilla' }), state: 'pending' as const })

  it('on a product waiting for review, offers to add it to the one on sale instead — and goes there', async () => {
    serve()
    const onPayload = await choose(waiting(), 'Whey Chocolate')

    expect(screen.queryByRole('button', { name: 'Merge it in' })).not.toBeInTheDocument()
    expect(screen.getByText(/would come off the shop/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add this one’s flavours to “Whey Chocolate”' }))

    expect(calls.at(-1)).toEqual({ url: '/api/portal/products', body: { id: 'whey-choc', action: 'merge', from: ['whey-van'] } })
    expect(push).toHaveBeenCalledWith('/founderhub/products/item/whey-choc#variants')
    // The answer is the other product; this page's copy is not replaced by it.
    expect(onPayload).not.toHaveBeenCalled()
  })

  it('says why and links on when the server still refuses the hand-over', async () => {
    serve({ error: 'These are different sizes (2kg, 1kg).', link: { label: 'Open Whey Chocolate', href: '/founderhub/products/item/whey-choc' } })
    await choose(waiting(), 'Whey Chocolate')
    await userEvent.click(screen.getByRole('button', { name: 'Add this one’s flavours to “Whey Chocolate”' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('These are different sizes (2kg, 1kg).')
    expect(screen.getByRole('link', { name: 'Open Whey Chocolate' })).toHaveAttribute('href', '/founderhub/products/item/whey-choc')
    expect(push).not.toHaveBeenCalled()
  })

  it('on a product waiting for review, still merges in another that is waiting too', async () => {
    serve()
    await choose(waiting(), 'Whey Strawberry')
    await userEvent.click(screen.getByRole('button', { name: 'Merge it in' }))
    expect(calls.at(-1)).toEqual({ url: '/api/portal/products', body: { id: 'whey-van', action: 'merge', from: ['whey-straw'] } })
    expect(push).not.toHaveBeenCalled()
  })

  it('on a product on sale, merges the other in here and offers Undo', async () => {
    serve()
    const onPayload = await choose(payload({}), 'Whey Chocolate')
    await userEvent.click(screen.getByRole('button', { name: 'Merge it in' }))
    expect(calls.at(-1)?.body).toEqual({ id: 'glycine', action: 'merge', from: ['whey-choc'] })
    expect(onPayload).toHaveBeenCalled()

    await userEvent.click(await screen.findByRole('button', { name: 'Undo — put “Whey Chocolate” back on its own' }))
    expect(calls.at(-1)?.body).toEqual({ id: 'whey-choc', action: 'undo-merge', view: 'glycine' })
  })

  it('shows the link a refusal names, beside the reason', async () => {
    serve({ error: '“Whey Chocolate” is on sale and this product is still waiting for review…', link: { label: 'Open Whey Chocolate', href: '/founderhub/products/item/whey-choc' } })
    // A stale list said "waiting for review"; by the time of the merge it was on sale.
    others[0].state = 'pending'
    try {
      await choose(waiting(), 'Whey Chocolate')
      await userEvent.click(screen.getByRole('button', { name: 'Merge it in' }))
    } finally {
      others[0].state = 'live'
    }
    expect(await screen.findByRole('alert')).toHaveTextContent(/is on sale and this product is still waiting for review/)
    expect(screen.getByRole('link', { name: 'Open Whey Chocolate' })).toHaveAttribute('href', '/founderhub/products/item/whey-choc')
  })
})

describe('a removed product', () => {
  const glycine = {
    defaultVariantId: 'powder',
    variants: [
      v({ id: 'caps', title: '100 vcaps', flavour: null, size: '100 caps' }),
      v({ id: 'powder', title: 'Pure Powder', flavour: null, size: '454 grams' }),
    ],
  }

  it('offers no split — the SKUs moved out would go on sale on their own — and says to restore it first', () => {
    render(<VariantsSection payload={{ ...payload(glycine), state: 'removed' }} onPayload={noop} onDirty={noop} />)
    expect(screen.getByText(/2 different sizes/)).toHaveTextContent(/Restore this product before splitting them/)
    expect(screen.queryByRole('button', { name: /^Tick the/ })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox', { name: /Move .* to its own product/ })).toHaveLength(0)
  })

  it('a product on sale keeps both ways to tick SKUs out', () => {
    render(<VariantsSection payload={payload(glycine)} onPayload={noop} onDirty={noop} />)
    expect(screen.getByRole('button', { name: 'Tick the 1 × 100 caps' })).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox', { name: /Move .* to its own product/ })).toHaveLength(2)
  })
})

describe('small print on tinted cards', () => {
  /*
    tokens.css: --ink-3 at --text-micro/--text-meta only on --surface-1 or
    --surface-2. A tone card is neither, and nested in the section card the
    merge warning measured about 3.9:1.
  */
  it('the split warning is set in --ink-2', async () => {
    render(<VariantsSection payload={payload({ variants: [v({ id: 'a' }), v({ id: 'b' })] })} onPayload={noop} onDirty={noop} />)
    await userEvent.click(screen.getAllByRole('checkbox', { name: /Move .* to its own product/ })[0])
    expect(screen.getByText(/They become a product of their own/)).toHaveStyle({ color: 'var(--ink-2)' })
  })

  it('the merge warning is set in --ink-2', async () => {
    global.fetch = jest.fn(async (url: string) => {
      const data = url.includes('all=1')
        ? { products: [{ state: 'live', product: { id: 'whey-choc', title: 'Whey Chocolate', variants: [v({ id: 'choc' })] } }] }
        : { ...payload({}), usageWarning: 'It is in 2 pre-built bundles.' }
      return { ok: true, status: 200, json: async () => data } as Response
    }) as unknown as typeof fetch
    render(<VariantsSection payload={payload({})} onPayload={noop} onDirty={noop} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.type(screen.getByLabelText('Find the product to bring in'), 'whey')
    await userEvent.click(await screen.findByRole('button', { name: 'Choose' }))
    expect(await screen.findByText(/It is in 2 pre-built bundles\. Those keep pointing at/)).toHaveStyle({ color: 'var(--ink-2)' })
  })

  it('the master SKU row stays a solid row, not a tint over the section', () => {
    render(<VariantsSection payload={payload({ defaultVariantId: 'a', variants: [v({ id: 'a' }), v({ id: 'b' })] })} onPayload={noop} onDirty={noop} />)
    const row = screen.getByText('Master').closest('.system-glass') as HTMLElement
    expect(row.style.background).toBe('var(--surface-solid)')
  })
})

describe('the supplier section', () => {
  it('offers nothing to pull when no SKU carries a PowerBody code', () => {
    const p = payload({ variants: [v({ id: 'a', sku: null })] })
    render(<SupplierSection payload={p} onPayload={noop} onDirty={noop} />)
    expect(screen.getByRole('button', { name: 'No PowerBody SKUs to ask about' })).toBeDisabled()
  })

  it('reports our own time limit as ours, not as PowerBody being unreachable', async () => {
    global.fetch = jest.fn(async () => streamed([{ type: 'step', message: 'Asking PowerBody' }])) as unknown as typeof fetch
    render(<SupplierSection payload={payload({ variants: [v({ id: 'a' })] })} onPayload={noop} onDirty={noop} />)
    await userEvent.click(screen.getByRole('button', { name: 'Pull 1 SKU from PowerBody' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/ran out of time before finishing/)
  })

  it('shows what changed per SKU after a pull, and what could not be found', async () => {
    const result = { type: 'result', ok: true, ...payload({}), answered: 1, filled: ['cost'], changed: { 'P-a': '30 → 33 servings' }, unresolved: [{ sku: 'P-b', message: 'Not reached this time.' }] }
    global.fetch = jest.fn(async () => streamed([result])) as unknown as typeof fetch
    const onPayload = jest.fn()
    render(<SupplierSection payload={payload({ variants: [v({ id: 'a' }), v({ id: 'b' })] })} onPayload={onPayload} onDirty={noop} />)
    await userEvent.click(screen.getByRole('button', { name: 'Pull 2 SKUs from PowerBody' }))
    expect(await screen.findByText('P-a: 30 → 33 servings')).toBeInTheDocument()
    expect(screen.getByText(/P-b: Not reached this time/)).toBeInTheDocument()
    expect(onPayload).toHaveBeenCalled()
    void within
  })
})
