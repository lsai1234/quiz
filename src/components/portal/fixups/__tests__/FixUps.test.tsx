import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FixUps } from '../FixUps'
import { pendingProduct } from '../../review/__tests__/fixtures'

const invalidateCatalogue = jest.fn()
jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: () => invalidateCatalogue() }))

const REPORT = {
  at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  source: 'powerbody',
  scanned: 12,
  updated: 0,
  missing: [],
  changes: [],
}

/**
 * Every pass's scan, answered the way its route would for a small catalogue:
 * two descriptions on sale with markup and one waiting for review, nothing
 * wrong with flavour names, one multi-SKU product, one product without a
 * short name. "Check now" waits for `release`, so a test can look at the page
 * while a pass is running.
 */
function serve() {
  let release: () => void = () => {}
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const reply = (json: unknown, status = 200) => ({ ok: status < 400, status, json: async () => json }) as Response
    const live = (id: string, title: string) => ({ product: pendingProduct({ id, title, review: undefined }), state: 'live' })
    switch (url) {
      case '/api/portal/products?all=1':
        return reply({
          source: 'real',
          products: [
            live('whey', 'Impact Whey'),
            live('bar', 'Protein Bar'),
            { product: pendingProduct({ id: 'new', title: 'New Import' }), state: 'pending' },
          ],
        })
      case '/api/portal/product-descriptions':
        return reply({
          ok: true,
          total: 3,
          withDescription: 3,
          withMarkup: 3,
          candidates: [
            { id: 'whey', title: 'Impact Whey', hasMarkup: true },
            { id: 'bar', title: 'Protein Bar', hasMarkup: true },
            { id: 'new', title: 'New Import', hasMarkup: true },
          ],
        })
      case '/api/portal/products/repair-variants':
        return reply({ products: [], total: 0, variants: 0 })
      case '/api/portal/products/repair-variant-pricing':
        return reply({
          products: [{ productId: 'whey', title: 'Impact Whey', variants: 3, onePrice: true, servingsKnown: 0, picturesKnown: 0 }],
          total: 1,
        })
      case '/api/portal/product-short-names':
        return reply({ ok: true, total: 2, withShortName: 1, hasKey: true, candidates: [{ id: 'bar', title: 'Protein Bar', current: null, derived: 'Protein Bar' }] })
      case '/api/portal/supplier-sync':
        if (init?.method === 'POST') {
          await new Promise<void>((r) => (release = r))
          return reply({ ok: true, ...REPORT, at: new Date().toISOString() })
        }
        return reply({ ok: true, report: REPORT })
      default:
        throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`)
    }
  }) as unknown as typeof fetch
  return { release: () => release() }
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  invalidateCatalogue.mockClear()
  window.location.hash = ''
})

const card = (title: string) => screen.getByRole('heading', { name: title }).closest<HTMLElement>('[role="region"]')!

describe('Fix-ups', () => {
  it('shows every pass closed, each with one line saying how many products it touches', async () => {
    serve()
    render(<FixUps />)

    // Products waiting for review are left out of the description count.
    expect(await screen.findByText(/2 of 2 on sale still show PowerBody's raw HTML/)).toBeInTheDocument()
    expect(within(card('Tidy descriptions')).getByText('2 to fix')).toBeInTheDocument()
    expect(within(card('Repair flavour names')).getByText('Nothing to fix')).toBeInTheDocument()
    await waitFor(() => expect(within(card('Fill SKU prices, servings and pictures from PowerBody')).getByText('1 to fix')).toBeInTheDocument())
    expect(within(card('Short names')).getByText(/1 of 2 on sale has no short name/)).toBeInTheDocument()
    expect(within(card('Supplier check')).getByText(/Last run 2 hours ago, 12 products checked/)).toBeInTheDocument()

    // Closed: every pass's controls are mounted but hidden.
    for (const name of ['Open Tidy descriptions', 'Open Short names', 'Open Supplier check', 'Open Suggest tags']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false')
    }
    expect(screen.queryByRole('button', { name: 'Check now' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check now', hidden: true })).toBeInTheDocument()
  })

  it('cannot be folded away while a pass runs, and keeps what it did when folded after', async () => {
    const { release } = serve()
    render(<FixUps />)

    await userEvent.click(await screen.findByRole('button', { name: 'Open Supplier check' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Check now' }))

    const hide = screen.getByRole('button', { name: 'Hide Supplier check' })
    await waitFor(() => expect(hide).toBeDisabled())
    expect(within(card('Supplier check')).getByText('Running')).toBeInTheDocument()

    release()
    await waitFor(() => expect(hide).toBeEnabled())
    expect(await within(card('Supplier check')).findByText(/Nothing moved/)).toBeInTheDocument()

    // Folded: still mounted, just hidden — and opened again it is the same
    // panel, with its answer, not a fresh one.
    await userEvent.click(hide)
    expect(screen.getByText(/Nothing moved/)).not.toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Open Supplier check' }))
    expect(within(card('Supplier check')).getByText(/Nothing moved/)).toBeVisible()
    expect(invalidateCatalogue).toHaveBeenCalled()
  })

  it('opens the pass a link points at', async () => {
    serve()
    window.location.hash = '#short-names'
    render(<FixUps />)
    expect(await screen.findByRole('button', { name: 'Hide Short names' })).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByRole('button', { name: 'Fill 1 from titles' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Tidy descriptions' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('points single-product changes to Products and waiting ones to Review', async () => {
    serve()
    render(<FixUps />)
    expect(await screen.findByRole('link', { name: 'Products' })).toHaveAttribute('href', '/founderhub/products')
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/founderhub/products/review')
  })
})
