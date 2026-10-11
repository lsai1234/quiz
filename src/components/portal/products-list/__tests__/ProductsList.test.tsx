import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductsList } from '../ProductsList'
import type { ListEntry } from '../model'
import { FAIL_COST, INFO_WEIGHT, WARN_COST, makeEntry } from './fixtures'

const search = { value: '' }
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search.value),
}))

function serve(body: unknown, { status = 200 } = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  search.value = ''
  window.history.replaceState(null, '', '/')
})

const CATALOGUE: ListEntry[] = [
  makeEntry({
    id: 'whey',
    title: 'Whey Isolate',
    brand: 'Optimum',
    category: 'Protein',
    basePrice: 49.99,
    compareAtPrice: 59.99,
    variants: [
      { id: 'a', title: 'Chocolate / 2kg', flavour: 'Chocolate', size: '2kg', price: 49.99, compareAtPrice: null, available: true, sku: 'ON-ISO-CHOC-2KG', servings: 66 },
      { id: 'b', title: 'Vanilla / 2kg', flavour: 'Vanilla', size: '2kg', price: 49.99, compareAtPrice: null, available: false, sku: 'ON-ISO-VAN-2KG', supplierProductId: '20044' },
    ],
    defaultVariantId: 'a',
  }, { checks: [INFO_WEIGHT] }),
  makeEntry({ id: 'creatine', title: 'Creatine Monohydrate', category: 'Performance', subscriptionEligible: false }, { checks: [WARN_COST] }),
  makeEntry({ id: 'preworkout', title: 'Pre-Workout Blast', category: 'Energy' }, { checks: [WARN_COST, FAIL_COST] }),
  makeEntry({ id: 'bcaa', title: 'BCAA Fresh', category: 'Recovery' }, { state: 'pending', remaining: 4, checks: [FAIL_COST] }),
  makeEntry({ id: 'old', title: 'Old Bar', category: 'Snacks' }, { state: 'removed' }),
]

/** The titles of the rows on screen, in order — each row's link is named by its title. */
function titles(): string[] {
  return screen
    .queryAllByRole('link')
    .filter((link) => link.hasAttribute('aria-labelledby'))
    .map((link) => document.getElementById(link.getAttribute('aria-labelledby')!)?.textContent ?? '')
}

describe('ProductsList', () => {
  it('lists every product, each linking to its own page, with the honest price and stock', async () => {
    serve({ source: 'real', products: CATALOGUE })
    render(<ProductsList />)

    const row = await screen.findByRole('link', { name: 'Whey Isolate' })
    expect(row).toHaveAttribute('href', '/founderhub/products/item/whey')
    expect(screen.getByText('£49.99 (was £59.99)')).toBeInTheDocument()
    // The master SKU's servings, and one of the two flavours sold out.
    expect(row).toHaveAccessibleDescription(/2 flavours\/sizes · 66 servings · 1 sold out/)
    expect(screen.getByText('Optimum · Protein')).toBeInTheDocument()

    // Removed products are in All, at the bottom.
    expect(titles()).toEqual(['BCAA Fresh', 'Creatine Monohydrate', 'Pre-Workout Blast', 'Whey Isolate', 'Old Bar'])
    expect(screen.getByRole('button', { name: 'All (5)' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('counts each view on its pill and switches between them', async () => {
    serve({ source: 'real', products: CATALOGUE })
    render(<ProductsList />)
    const user = userEvent.setup()

    await screen.findByRole('link', { name: 'Whey Isolate' })
    expect(screen.getByRole('button', { name: 'On sale (3)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Waiting for review (1)' })).toBeInTheDocument()
    // The pending product's failing check does not count: attention is about what is on sale.
    expect(screen.getByRole('button', { name: 'Blocking (1)' })).toBeInTheDocument()
    // The whey's `info` check never counts as a warning.
    expect(screen.getByRole('button', { name: 'Warnings (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Removed (1)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Waiting for review (1)' }))
    expect(titles()).toEqual(['BCAA Fresh'])
    expect(screen.getByText('4 things to check before it can go on sale')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Work through them in Review' })).toHaveAttribute('href', '/founderhub/products/review')
    // The address follows, so Back from a product lands on the same view.
    expect(window.location.search).toBe('?show=pending')

    await user.click(screen.getByRole('button', { name: 'Removed (1)' }))
    expect(titles()).toEqual(['Old Bar'])
  })

  it('finds a product by a SKU or a PowerBody id', async () => {
    serve({ source: 'real', products: CATALOGUE })
    render(<ProductsList />)
    const user = userEvent.setup()
    await screen.findByRole('link', { name: 'Whey Isolate' })

    await user.type(screen.getByLabelText('Search products'), 'ON-ISO-VAN')
    expect(titles()).toEqual(['Whey Isolate'])

    await user.clear(screen.getByLabelText('Search products'))
    await user.type(screen.getByLabelText('Search products'), '20044')
    expect(titles()).toEqual(['Whey Isolate'])

    await user.clear(screen.getByLabelText('Search products'))
    await user.type(screen.getByLabelText('Search products'), 'nothing like this')
    expect(titles()).toEqual([])
    expect(screen.getByText('Nothing matches')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear the search and filters' }))
    expect(titles()).toHaveLength(5)
  })

  it('narrows by category, by shape and by subscription', async () => {
    serve({ source: 'real', products: CATALOGUE })
    render(<ProductsList />)
    const user = userEvent.setup()
    await screen.findByRole('link', { name: 'Whey Isolate' })

    await user.selectOptions(screen.getByLabelText('Category'), 'Performance')
    expect(titles()).toEqual(['Creatine Monohydrate'])
    await user.selectOptions(screen.getByLabelText('Category'), '')

    await user.click(screen.getByRole('button', { name: /^Several flavours\/sizes/ }))
    expect(titles()).toEqual(['Whey Isolate'])
    await user.click(screen.getByRole('button', { name: /^Several flavours\/sizes/ }))

    await user.click(screen.getByRole('button', { name: /^Subscription/ }))
    expect(titles()).not.toContain('Creatine Monohydrate')
  })

  it('opens on ?show=attention with blocking first and every check linking to where it is fixed', async () => {
    search.value = 'show=attention'
    serve({ source: 'real', products: CATALOGUE })
    render(<ProductsList />)

    await screen.findByRole('link', { name: 'Pre-Workout Blast' })
    expect(titles()).toEqual(['Pre-Workout Blast', 'Creatine Monohydrate'])
    // That view IS Blocking and Warnings together, so both say they are on.
    expect(screen.getByRole('button', { name: 'Blocking (1)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Warnings (1)' })).toHaveAttribute('aria-pressed', 'true')

    const fixes = within(screen.getByRole('list', { name: 'What to fix on Pre-Workout Blast' })).getAllByRole('link')
    // Failing check first, each straight to its section of the product page.
    expect(fixes[0]).toHaveTextContent(/Blocking.*Subscription-ready — No servings set/)
    expect(fixes[0]).toHaveAttribute('href', '/founderhub/products/item/preworkout#quiz')
    expect(fixes[1]).toHaveTextContent(/Warning.*Cost set for margins/)
    expect(fixes[1]).toHaveAttribute('href', '/founderhub/products/item/preworkout#supplier')
  })

  it('says a view with nothing in it is good news, not an error', async () => {
    search.value = 'show=blocking'
    serve({ source: 'real', products: [makeEntry({ id: 'fine', title: 'Fine' })] })
    render(<ProductsList />)
    expect(await screen.findByText('Nothing is blocked')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show every product' })).toBeInTheDocument()
  })

  it('offers Add products when the real catalogue is empty', async () => {
    serve({ source: 'real', products: [] })
    render(<ProductsList />)
    expect(await screen.findByText('No products yet')).toBeInTheDocument()
    const adds = screen.getAllByRole('link', { name: 'Add products' })
    expect(adds.length).toBeGreaterThan(0)
    for (const link of adds) expect(link).toHaveAttribute('href', '/founderhub/products/add')
    expect(screen.queryByText(/sample catalogue/)).not.toBeInTheDocument()
  })

  it('says when it is showing the sample catalogue, with the way to switch', async () => {
    serve({ source: 'mock', products: CATALOGUE })
    render(<ProductsList />)
    expect(await screen.findByText('sample catalogue')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings → Catalogue' })).toHaveAttribute('href', '/founderhub/settings/catalogue')
  })

  it('says the session has expired, with a way to sign in, rather than an empty list', async () => {
    serve({ error: 'Unauthorized' }, { status: 401 })
    render(<ProductsList />)
    expect(await screen.findByText(/Your session has expired/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/founderhub/products')
    expect(screen.queryByText('No products yet')).not.toBeInTheDocument()
  })

  it('says what failed and offers to try again', async () => {
    serve({ error: 'Not saved — database unavailable' }, { status: 503 })
    render(<ProductsList />)
    expect(await screen.findByText('The products could not be loaded')).toBeInTheDocument()
    expect(screen.getByText(/database unavailable/)).toBeInTheDocument()

    serve({ source: 'real', products: CATALOGUE })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Whey Isolate' })).toBeInTheDocument()
  })
})
