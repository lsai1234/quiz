import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductWorkspace } from '../ProductWorkspace'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ProductPayload } from '@/lib/portal/product-edit'

const push = jest.fn()
let query = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
  useSearchParams: () => query,
}))

function product(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  const base = MOCK_CATALOGUE[0] as CatalogueProduct
  return {
    ...base,
    id: 'whey',
    handle: 'whey',
    title: 'Whey Isolate',
    defaultVariantId: 'whey-choc',
    variants: [
      { id: 'whey-choc', title: 'Chocolate', flavour: 'Chocolate', size: '1kg', price: 29.99, compareAtPrice: null, available: true, sku: 'P1', servings: 33 },
      { id: 'whey-van', title: 'Vanilla', flavour: 'Vanilla', size: '1kg', price: 29.99, compareAtPrice: null, available: true, sku: 'P2' },
    ],
    ...over,
  }
}

function payload(over: Partial<ProductPayload> = {}, productOver: Partial<CatalogueProduct> = {}): ProductPayload {
  return {
    product: product(productOver),
    state: 'live',
    storage: 'imported',
    readiness: { productId: 'whey', overall: 'ok', checks: [] },
    remaining: [],
    priceRows: [],
    markupOnCost: 2,
    usage: { topRank: null, bundles: [], stacks: [] },
    usageWarning: null,
    source: 'real',
    ...over,
  }
}

const originalFetch = global.fetch
let calls: Array<{ url: string; body: Record<string, unknown> }>
let answer: (url: string, body: Record<string, unknown>) => unknown

beforeEach(() => {
  calls = []
  push.mockClear()
  query = new URLSearchParams()
  answer = () => ({ ok: true, ...payload() })
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ url, body })
    const data = answer(url, body)
    return { ok: true, status: 200, json: async () => data, headers: new Headers() } as Response
  }) as unknown as typeof fetch
})
afterEach(() => {
  global.fetch = originalFetch
})

describe('the product page', () => {
  it('saves only what was changed in the shop listing, and shows the product the server answers with', async () => {
    answer = () => ({ ok: true, ...payload({}, { title: 'Whey Isolate 1kg' }) })
    render(<ProductWorkspace initial={payload()} />)

    const listing = screen.getByRole('region', { name: 'Shop listing' })
    const name = within(listing).getByLabelText('Product name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Whey Isolate 1kg')
    await userEvent.click(within(listing).getByRole('button', { name: 'Save 1 change' }))

    expect(calls.at(-1)).toEqual({ url: '/api/portal/products', body: { id: 'whey', set: { title: 'Whey Isolate 1kg' } } })
    expect(await screen.findByRole('heading', { level: 1, name: 'Whey Isolate 1kg' })).toBeInTheDocument()
    expect(await within(listing).findByRole('button', { name: 'Saved' })).toBeDisabled()
  })

  it('keeps a half-typed edit in one section when another section saves', async () => {
    answer = () => ({ ok: true, ...payload({}, { weightGrams: 1200 }) })
    render(<ProductWorkspace initial={payload()} />)
    const listing = screen.getByRole('region', { name: 'Shop listing' })
    await userEvent.clear(within(listing).getByLabelText('Brand'))
    await userEvent.type(within(listing).getByLabelText('Brand'), 'Acme')

    const supplier = screen.getByRole('region', { name: 'Supplier' })
    await userEvent.type(within(supplier).getByLabelText('Shipped weight (g)'), '1200')
    await userEvent.click(within(supplier).getByRole('button', { name: 'Save 1 change' }))

    expect(calls.at(-1)?.body).toEqual({ id: 'whey', set: { weightGrams: 1200 } })
    expect(await within(listing).findByLabelText('Brand')).toHaveValue('Acme')
  })

  it('lets a pending product’s machine-filled fields be checked without changing them, and only then approves', async () => {
    const pending = payload({ state: 'pending', remaining: ['stackSlots', 'goals'] }, {
      review: { status: 'pending', sources: { stackSlots: 'ai', goals: 'heuristic' }, confirmed: [], importedAt: '2026-10-01' },
    })
    answer = (_url, body) =>
      body.confirm ? { ok: true, ...payload({ state: 'pending', remaining: [] }) } : { ok: true, ...payload() }
    render(<ProductWorkspace initial={pending} />)

    expect(screen.getByRole('button', { name: /Approve — 2 fields still to check/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'All 2 look right' }))
    expect(calls.at(-1)?.body).toEqual({ id: 'whey', confirm: ['stackSlots', 'goals'] })
    expect(await screen.findByRole('button', { name: 'Approve and put on sale' })).toBeEnabled()
  })

  it('edits one SKU in one form and sends only that SKU’s changes', async () => {
    render(<ProductWorkspace initial={payload()} />)
    const variants = screen.getByRole('region', { name: 'Flavours, sizes & prices' })
    const edit = within(variants).getAllByRole('button', { name: 'Edit' })
    await userEvent.click(edit[1])
    const servings = within(variants).getByLabelText('Servings')
    await userEvent.type(servings, '30')
    await userEvent.click(within(variants).getByRole('button', { name: 'Save 1 change' }))
    expect(calls.at(-1)?.body).toEqual({ id: 'whey', variants: [{ id: 'whey-van', servings: 30 }] })
  })

  it('makes another SKU the master in one press', async () => {
    render(<ProductWorkspace initial={payload()} />)
    const variants = screen.getByRole('region', { name: 'Flavours, sizes & prices' })
    await userEvent.click(within(variants).getAllByRole('button', { name: 'Edit' })[1])
    await userEvent.click(within(variants).getByRole('button', { name: 'Make this the master' }))
    expect(calls.at(-1)?.body).toEqual({ id: 'whey', master: 'whey-van' })
  })

  it('asks before removing, and says what else sells it', async () => {
    render(<ProductWorkspace initial={payload({ usageWarning: 'Heads up: it is #3 on the Top 25.' })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove from sale' }))
    expect(screen.getByText(/it is #3 on the Top 25/)).toBeInTheDocument()
    expect(calls).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm — remove it' }))
    expect(calls.at(-1)?.body).toEqual({ id: 'whey', action: 'remove' })
  })

  it('offers Undo merge, not a Restore that would be refused, for a product merged into another', async () => {
    answer = () => ({ ok: true, ...payload({ state: 'live' }) })
    render(<ProductWorkspace initial={payload({ state: 'removed', heldBy: { id: 'whey-big', title: 'Whey Isolate (all flavours)', merged: true } })} />)
    expect(screen.queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Whey Isolate (all flavours)' })).toHaveAttribute('href', '/founderhub/products/item/whey-big')

    await userEvent.click(screen.getByRole('button', { name: 'Undo the merge' }))
    expect(calls).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm — undo the merge' }))
    expect(calls.at(-1)?.body).toEqual({ id: 'whey', action: 'undo-merge' })
    expect(await screen.findByText(/Back on sale on its own/)).toBeInTheDocument()
  })

  it('says why a save was refused instead of saying it saved', async () => {
    answer = () => ({ ok: false, error: 'Not saved — the store kept changing.', problems: ['Name can’t be empty.'] })
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) })
      return { ok: false, status: 400, json: async () => answer(url, {}), headers: new Headers() } as Response
    }) as unknown as typeof fetch
    render(<ProductWorkspace initial={payload()} />)
    const listing = screen.getByRole('region', { name: 'Shop listing' })
    await userEvent.clear(within(listing).getByLabelText('Product name'))
    await userEvent.click(within(listing).getByRole('button', { name: 'Save 1 change' }))
    expect(await within(listing).findByRole('alert')).toHaveTextContent('Name can’t be empty.')
  })
})
