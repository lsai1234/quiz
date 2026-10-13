import { render, screen, waitFor, within } from '@testing-library/react'
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

  it('reads Saved after a SKU save the server tidied (12.50 comes back as 12.5)', async () => {
    const tidied = product()
    tidied.variants = tidied.variants.map((v) => (v.id === 'whey-van' ? { ...v, cost: 12.5 } : v))
    answer = () => ({ ok: true, ...payload({}, { variants: tidied.variants }) })
    render(<ProductWorkspace initial={payload()} />)
    const variants = screen.getByRole('region', { name: 'Flavours, sizes & prices' })
    await userEvent.click(within(variants).getAllByRole('button', { name: 'Edit' })[1])
    await userEvent.type(within(variants).getByLabelText(/What PowerBody charge|Cost/), '12.50')
    await userEvent.click(within(variants).getByRole('button', { name: 'Save 1 change' }))
    expect(calls.at(-1)?.body).toEqual({ id: 'whey', variants: [{ id: 'whey-van', cost: 12.5 }] })
    expect(await within(variants).findByRole('button', { name: 'Saved' })).toBeDisabled()
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

// ── Saved means saved ────────────────────────────────────────────────────────

describe('after a save the server tidied', () => {
  it('clears the section once the server answers, though it stored the value in another form', async () => {
    // "12.50" is stored as 12.5 and comes back as "12.5"; "powder,capsule"
    // comes back as "powder, capsule". Neither may stay "Save 1 change".
    const master = (cost: number) =>
      product({ cost }).variants.map((v) => (v.id === 'whey-choc' ? { ...v, cost } : v))
    answer = (_url, body) => {
      const set = (body.set ?? {}) as Record<string, unknown>
      if ('cost' in set) return { ok: true, ...payload({}, { cost: 12.5, variants: master(12.5) }) }
      return { ok: true, ...payload({}, { formats: ['powder', 'capsule'] }) }
    }
    render(<ProductWorkspace initial={payload()} />)

    const supplier = screen.getByRole('region', { name: 'Supplier' })
    await userEvent.type(within(supplier).getByLabelText('What PowerBody charge us (£)'), '12.50')
    await userEvent.click(within(supplier).getByRole('button', { name: 'Save 1 change' }))
    expect(await within(supplier).findByRole('button', { name: 'Saved' })).toBeDisabled()
    expect(within(supplier).getByLabelText('What PowerBody charge us (£)')).toHaveValue('12.5')

    const listing = screen.getByRole('region', { name: 'Shop listing' })
    const formats = within(listing).getByLabelText('Formats')
    await userEvent.clear(formats)
    await userEvent.type(formats, 'powder,capsule')
    await userEvent.click(within(listing).getByRole('button', { name: 'Save 1 change' }))
    expect(await within(listing).findByRole('button', { name: 'Saved' })).toBeDisabled()
    expect(formats).toHaveValue('powder, capsule')
    await waitFor(() => expect(screen.queryByText(/Not saved yet/)).not.toBeInTheDocument())
  })

  it('clears when the server tidied the value back to what it already was', async () => {
    // A trailing space on the brand: trimmed, so the product does not change
    // at all — and the field must still stop reading as unsaved.
    answer = () => ({ ok: true, ...payload({}, { brand: 'Acme' }) })
    render(<ProductWorkspace initial={payload({}, { brand: 'Acme' })} />)
    const listing = screen.getByRole('region', { name: 'Shop listing' })
    await userEvent.type(within(listing).getByLabelText('Brand'), ' ')
    await userEvent.click(within(listing).getByRole('button', { name: 'Save 1 change' }))
    expect(await within(listing).findByRole('button', { name: 'Saved' })).toBeDisabled()
    expect(within(listing).getByLabelText('Brand')).toHaveValue('Acme')
  })
})

// ── Leaving with unsaved edits ──────────────────────────────────────────────

describe('leaving the page by a link inside the hub', () => {
  /** Click a link, and report whether its navigation was stopped. */
  function click(link: HTMLElement): boolean {
    let stopped = false
    // Runs after every other listener; then stops jsdom's own navigation.
    const record = (e: Event) => {
      stopped = e.defaultPrevented
      e.preventDefault()
    }
    window.addEventListener('click', record)
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    window.removeEventListener('click', record)
    return stopped
  }

  let confirmSpy: jest.SpyInstance
  beforeEach(() => {
    confirmSpy = jest.spyOn(window, 'confirm')
  })
  afterEach(() => confirmSpy.mockRestore())

  const withProblem = payload({
    readiness: {
      productId: 'whey',
      overall: 'fail',
      checks: [{ id: 'picture', label: 'No picture', status: 'fail', section: 'listing' } as never],
    },
  })

  it('asks before a link drops unsaved edits, and stays when told to', async () => {
    confirmSpy.mockReturnValue(false)
    render(<ProductWorkspace initial={withProblem} />)
    const listing = screen.getByRole('region', { name: 'Shop listing' })
    await userEvent.type(within(listing).getByLabelText('Brand'), 'Acme')

    expect(click(screen.getByRole('link', { name: /All products/ }))).toBe(true)
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/^Not saved yet: Shop listing\. Leave this page and lose that change\?/))
    expect(within(listing).getByLabelText('Brand')).toHaveValue('CHRGDAcme')

    // A link to a part of this page goes nowhere, so it is not asked about.
    confirmSpy.mockClear()
    expect(click(screen.getByRole('link', { name: 'Fix in Shop listing' }))).toBe(false)
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('lets the link go when the founder says leave, and never asks when nothing is unsaved', async () => {
    confirmSpy.mockReturnValue(true)
    render(<ProductWorkspace initial={payload()} />)
    expect(click(screen.getByRole('link', { name: /All products/ }))).toBe(false)
    expect(confirmSpy).not.toHaveBeenCalled()

    const listing = screen.getByRole('region', { name: 'Shop listing' })
    await userEvent.type(within(listing).getByLabelText('Brand'), 'Acme')
    expect(click(screen.getByRole('link', { name: /All products/ }))).toBe(false)
    expect(confirmSpy).toHaveBeenCalledTimes(1)
  })

  it('covers links outside the page too — the products sub-nav', async () => {
    confirmSpy.mockReturnValue(false)
    render(
      <>
        <nav>
          <a href="/founderhub/products/review">Review</a>
        </nav>
        <ProductWorkspace initial={payload()} />
      </>,
    )
    const supplier = screen.getByRole('region', { name: 'Supplier' })
    await userEvent.type(within(supplier).getByLabelText('Shipped weight (g)'), '900')
    expect(click(screen.getByRole('link', { name: 'Review' }))).toBe(true)
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Not saved yet: Supplier.'))
  })

  it('asks before Approve in the queue moves on and drops an unsaved edit — the one way out that is not a link', async () => {
    // In the queue, Approve goes straight on to the next product (router.push),
    // which no click guard sees: the typed brand went with no word, and the
    // product went on sale without it.
    query = new URLSearchParams('queue=review')
    const ready = payload({ state: 'pending', remaining: [] }, { review: { status: 'pending', sources: {}, confirmed: [], importedAt: '2026-10-01' } })
    render(<ProductWorkspace initial={ready} />)
    const listing = screen.getByRole('region', { name: 'Shop listing' })
    await userEvent.type(within(listing).getByLabelText('Brand'), 'Acme')

    confirmSpy.mockReturnValue(false)
    await userEvent.click(screen.getByRole('button', { name: 'Approve and put on sale' }))
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/^Not saved yet: Shop listing\. Approving moves on to the next product/))
    expect(calls.some((c) => c.body.action === 'approve')).toBe(false)
    expect(push).not.toHaveBeenCalled()
    expect(within(listing).getByLabelText('Brand')).toHaveValue('CHRGDAcme')

    confirmSpy.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Approve and put on sale' }))
    await waitFor(() => expect(push).toHaveBeenCalled())
    expect(calls.some((c) => c.body.action === 'approve')).toBe(true)
  })

  it('does not ask before Approve when nothing is unsaved, or when the page stays put', async () => {
    confirmSpy.mockReturnValue(false)
    const ready = payload({ state: 'pending', remaining: [] }, { review: { status: 'pending', sources: {}, confirmed: [], importedAt: '2026-10-01' } })
    // Outside the queue Approve keeps the page, and the edit, where they are.
    const { unmount } = render(<ProductWorkspace initial={ready} />)
    await userEvent.type(within(screen.getByRole('region', { name: 'Shop listing' })).getByLabelText('Brand'), 'Acme')
    await userEvent.click(screen.getByRole('button', { name: 'Approve and put on sale' }))
    expect(calls.some((c) => c.body.action === 'approve')).toBe(true)
    unmount()

    calls = []
    query = new URLSearchParams('queue=review')
    render(<ProductWorkspace initial={ready} />)
    await userEvent.click(screen.getByRole('button', { name: 'Approve and put on sale' }))
    await waitFor(() => expect(push).toHaveBeenCalled())
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})

// ── Supplier: the master SKU's cost and id ───────────────────────────────────

describe('the supplier section', () => {
  const onMaster = (over: Record<string, unknown>) =>
    product().variants.map((v) => (v.id === 'whey-choc' ? { ...v, ...over } : v))

  it('shows the master SKU’s own cost and id, and saves them to the master as well as the product', async () => {
    render(<ProductWorkspace initial={payload({}, { cost: undefined, supplierProductId: undefined, variants: onMaster({ cost: 12, supplierProductId: '111' }) })} />)
    const supplier = screen.getByRole('region', { name: 'Supplier' })
    const cost = within(supplier).getByLabelText('What PowerBody charge us (£)')
    const id = within(supplier).getByLabelText('PowerBody product id')
    expect(cost).toHaveValue('12')
    expect(id).toHaveValue('111')

    await userEvent.clear(cost)
    await userEvent.type(cost, '14')
    await userEvent.clear(id)
    await userEvent.type(id, '999')
    await userEvent.click(within(supplier).getByRole('button', { name: 'Save 2 changes' }))
    expect(calls.at(-1)?.body).toEqual({
      id: 'whey',
      set: { cost: 14, supplierProductId: '999' },
      variants: [{ id: 'whey-choc', cost: 14, supplierProductId: '999' }],
    })
  })

  it('leaves the SKUs alone when only the weight or VAT changes', async () => {
    render(<ProductWorkspace initial={payload()} />)
    const supplier = screen.getByRole('region', { name: 'Supplier' })
    await userEvent.type(within(supplier).getByLabelText('VAT rate (%)'), '0')
    await userEvent.click(within(supplier).getByRole('button', { name: 'Save 1 change' }))
    expect(calls.at(-1)?.body).toEqual({ id: 'whey', set: { vatRate: 0 } })
  })

  it('says what is wrong with a refused cost or id once, not once for the product and again for the master', async () => {
    // The server's real checks, on the edit the section really sends: the
    // product's copy and the master SKU's each fail the same check.
    const { validateEdit, EditRejected } = jest.requireActual('@/lib/portal/product-edit') as typeof import('@/lib/portal/product-edit')
    answer = (_url, body) => {
      try {
        validateEdit(product(), body as never)
        return { ok: true, ...payload() }
      } catch (err) {
        if (!(err instanceof EditRejected)) throw err
        return { ok: false, error: err.message, problems: err.problems }
      }
    }
    render(<ProductWorkspace initial={payload()} />)
    const supplier = screen.getByRole('region', { name: 'Supplier' })
    await userEvent.type(within(supplier).getByLabelText('PowerBody product id'), 'abc')
    await userEvent.click(within(supplier).getByRole('button', { name: 'Save 1 change' }))
    expect(calls.at(-1)?.body).toEqual({ id: 'whey', set: { supplierProductId: 'abc' }, variants: [{ id: 'whey-choc', supplierProductId: 'abc' }] })
    const alert = await within(supplier).findByRole('alert')
    expect(alert).toHaveTextContent(/^PowerBody product id must be PowerBody’s numeric product id\.$/)
  })
})

// ── Supplier: a refused pull ─────────────────────────────────────────────────

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

describe('pulling from PowerBody on the product page', () => {
  function pullAnswers(result: Record<string, unknown>) {
    global.fetch = jest.fn(async () =>
      streamed([{ type: 'step', message: 'Asking PowerBody about 2 SKUs.' }, { type: 'result', ok: true, ...payload(), ...result }]),
    ) as unknown as typeof fetch
  }
  const skus = { variants: product().variants }

  it('shows a refusal in PowerBody’s words with the way to the checks — never “nothing had changed”', async () => {
    const refusal = 'PowerBody did not accept our login (“Access denied”). Check the API user and key in Settings → Supplier.'
    pullAnswers({
      answered: 0,
      changed: {},
      filled: [],
      unresolved: [
        { sku: 'P1', message: refusal, refusal: 'credentials' },
        { sku: 'P2', message: refusal, refusal: 'credentials' },
      ],
      refused: { kind: 'credentials', message: refusal },
    })
    render(<ProductWorkspace initial={payload({}, skus)} />)
    const supplier = screen.getByRole('region', { name: 'Supplier' })
    await userEvent.click(within(supplier).getByRole('button', { name: 'Pull 2 SKUs from PowerBody' }))

    const alert = await within(supplier).findByRole('alert')
    expect(alert).toHaveTextContent(`Nothing was pulled, so nothing changed. ${refusal}`)
    expect(within(alert).getByRole('link', { name: 'Run the checks' })).toHaveAttribute('href', '/founderhub/settings/supplier')
    expect(within(supplier).queryByText(/nothing had changed/)).not.toBeInTheDocument()
    expect(within(supplier).queryByRole('status')).not.toBeInTheDocument()
    // Said once, not once more per SKU.
    expect(within(supplier).getAllByText(/did not accept our login/)).toHaveLength(1)
  })

  it('says what did arrive before PowerBody refused the rest', async () => {
    const limit = 'PowerBody are limiting how fast we can ask (“TOO_MANY_REQUESTS”). It passes on its own — wait a minute, then carry on.'
    pullAnswers({
      answered: 1,
      changed: { P1: 'cost £12.00' },
      filled: [],
      unresolved: [{ sku: 'P2', message: limit, refusal: 'rate-limited' }],
      refused: { kind: 'rate-limited', message: limit },
    })
    render(<ProductWorkspace initial={payload({}, skus)} />)
    const supplier = screen.getByRole('region', { name: 'Supplier' })
    await userEvent.click(within(supplier).getByRole('button', { name: 'Pull 2 SKUs from PowerBody' }))

    const alert = await within(supplier).findByRole('alert')
    expect(alert).toHaveTextContent(`PowerBody answered for 1 of 2 SKUs (1 SKU updated, and saved) but not for the rest. ${limit}`)
    expect(within(alert).getByRole('link', { name: 'Run the checks' })).toBeInTheDocument()
    expect(within(supplier).getByText('P1: cost £12.00')).toBeInTheDocument()
  })

  it('is good news when PowerBody refused once but every SKU was then found — there is no “rest”', async () => {
    // Their error on the batch of held ids does not stop the pull: each SKU is
    // then looked up on its own, and here every one answered. `refused` still
    // says what happened on the way; it must not turn a full answer red.
    const theirs = 'PowerBody would not answer: Internal error.'
    pullAnswers({
      answered: 2,
      changed: { P1: 'cost £12.00' },
      filled: [],
      unresolved: [],
      refused: { kind: 'supplier-error', message: theirs },
    })
    render(<ProductWorkspace initial={payload({}, skus)} />)
    const supplier = screen.getByRole('region', { name: 'Supplier' })
    await userEvent.click(within(supplier).getByRole('button', { name: 'Pull 2 SKUs from PowerBody' }))
    expect(await within(supplier).findByRole('status')).toHaveTextContent('PowerBody answered for 2 SKUs. 1 SKU updated.')
    expect(within(supplier).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('still says so plainly when PowerBody answered and nothing had changed', async () => {
    pullAnswers({ answered: 2, changed: {}, filled: [], unresolved: [] })
    render(<ProductWorkspace initial={payload({}, skus)} />)
    const supplier = screen.getByRole('region', { name: 'Supplier' })
    await userEvent.click(within(supplier).getByRole('button', { name: 'Pull 2 SKUs from PowerBody' }))
    expect(await within(supplier).findByRole('status')).toHaveTextContent('PowerBody answered for 2 SKUs — nothing had changed.')
  })
})

// ── Quiz: the plan's own serving count ──────────────────────────────────────

describe('the plan’s own serving count', () => {
  it('cannot be typed while Taken is Auto, which would throw it away, and says why', async () => {
    render(<ProductWorkspace initial={payload()} />)
    const quiz = screen.getByRole('region', { name: 'Quiz & subscription' })
    await userEvent.click(within(quiz).getByRole('button', { name: 'Show the finer settings' }))
    const own = within(quiz).getByLabelText('Servings a plan is sized on')
    expect(own).toBeDisabled()
    expect(within(quiz).getByText(/To set your own number, first choose how it is taken/)).toBeInTheDocument()

    await userEvent.selectOptions(within(quiz).getByLabelText('Taken'), 'daily')
    expect(own).toBeEnabled()
    await userEvent.type(own, '15')
    expect(within(quiz).getByText(/sized on 15 servings, your own number below/)).toBeInTheDocument()
    await userEvent.click(within(quiz).getByRole('button', { name: 'Save 2 changes' }))
    expect(calls.at(-1)?.body).toEqual({ id: 'whey', set: { consumption: { cadence: 'daily', servingsPerUnit: 15 } } })
  })

  it('is emptied with the plan when Taken goes back to Auto, so nothing unsaved is left behind', async () => {
    render(<ProductWorkspace initial={payload()} />)
    const quiz = screen.getByRole('region', { name: 'Quiz & subscription' })
    await userEvent.click(within(quiz).getByRole('button', { name: 'Show the finer settings' }))
    await userEvent.selectOptions(within(quiz).getByLabelText('Taken'), 'daily')
    await userEvent.type(within(quiz).getByLabelText('Servings a plan is sized on'), '15')
    await userEvent.selectOptions(within(quiz).getByLabelText('Taken'), '')
    expect(within(quiz).getByLabelText('Servings a plan is sized on')).toHaveValue('')
    expect(within(quiz).getByRole('button', { name: 'Saved' })).toBeDisabled()
    expect(within(quiz).getByText(/following the master/)).toBeInTheDocument()
  })
})

// ── Fill the blanks: what it really did ─────────────────────────────────────

describe('fill the blanks', () => {
  const pending = payload({ state: 'pending', remaining: [] }, { shortReason: '', dietaryTags: [], review: { status: 'pending', sources: {}, confirmed: [], importedAt: '2026-10-01' } })

  it('says when nothing was filled', async () => {
    answer = () => ({ ok: true, fill: { filled: [], source: 'ai' }, ...pending })
    render(<ProductWorkspace initial={pending} />)
    const listing = screen.getByRole('region', { name: 'Shop listing' })
    await userEvent.click(within(listing).getByRole('button', { name: 'Fill the blanks with AI' }))
    expect(await within(listing).findByRole('status')).toHaveTextContent(/^Nothing was filled/)
    expect(calls.at(-1)?.body).toEqual({ id: 'whey', action: 'fill-blanks' })
  })

  it('says which fields were keyword guesses when the AI was not available', async () => {
    answer = () => ({ ok: true, fill: { filled: ['shortReason', 'dietaryTags'], source: 'heuristic' }, ...pending })
    render(<ProductWorkspace initial={pending} />)
    const quiz = screen.getByRole('region', { name: 'Quiz & subscription' })
    await userEvent.click(within(quiz).getByRole('button', { name: 'Fill the blanks with AI' }))
    const status = await within(quiz).findByRole('status')
    expect(status).toHaveTextContent(/with keyword guesses — the AI was not available/)
    expect(status).toHaveTextContent(/“Keyword guess”/)
    expect(status).not.toHaveTextContent(/Written by AI/)
  })

  it('names fields outside the review in words too, never by their code name', async () => {
    // The fill also writes "when it is felt" and the keep-or-change advice when
    // they are blank; neither is a review field, so neither has a review label.
    answer = () => ({ ok: true, fill: { filled: ['goals', 'recommendationBasis', 'effectOnset'], source: 'ai' }, ...pending })
    render(<ProductWorkspace initial={pending} />)
    const quiz = screen.getByRole('region', { name: 'Quiz & subscription' })
    await userEvent.click(within(quiz).getByRole('button', { name: 'Fill the blanks with AI' }))
    const status = await within(quiz).findByRole('status')
    expect(status).toHaveTextContent(/^Filled Goals, Keep-or-change advice, When it is felt\./)
    expect(status).not.toHaveTextContent(/effectOnset|recommendationBasis/)
  })

  it('names what the model filled', async () => {
    answer = () => ({ ok: true, fill: { filled: ['goals'], source: 'ai' }, ...pending })
    render(<ProductWorkspace initial={pending} />)
    const quiz = screen.getByRole('region', { name: 'Quiz & subscription' })
    await userEvent.click(within(quiz).getByRole('button', { name: 'Fill the blanks with AI' }))
    expect(await within(quiz).findByRole('status')).toHaveTextContent(/^Filled Goals\. Each is marked “Written by AI”/)
  })
})
