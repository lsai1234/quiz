import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShortNamePanel } from '../ShortNamePanel'
import { pendingProduct } from '../review/__tests__/fixtures'

const invalidateCatalogue = jest.fn()
jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: () => invalidateCatalogue() }))

/**
 * A tiny server: the products on sale, and the short-names scan worked out
 * from them the way the route does — no stored name, or one that is just the
 * title, needs work.
 */
function serve(products: Array<{ id: string; title: string; shortName?: string | null }>, { hasKey = true } = {}) {
  const state = products.map((p) => ({ ...p }))
  const posts: Array<{ ids: string[]; ai: boolean }> = []
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const reply = (status: number, json: unknown) => ({ ok: status < 400, status, json: async () => json }) as Response
    if (url === '/api/portal/products?all=1') {
      return reply(200, {
        source: 'real',
        products: state.map((p) => ({ product: pendingProduct({ id: p.id, title: p.title, shortName: p.shortName ?? null, review: undefined }), state: 'live' })),
      })
    }
    if (url === '/api/portal/product-short-names' && init?.method === 'POST') {
      const body = JSON.parse(init.body as string) as { ids: string[]; ai: boolean }
      posts.push(body)
      const changes = body.ids.map((id) => {
        const p = state.find((x) => x.id === id)!
        const after = body.ai ? `AI ${p.title.split(' ')[0]}` : p.title.split(' - ')[0]
        p.shortName = after
        return { id, title: p.title, before: null, after, source: body.ai ? 'ai' : 'derived' }
      })
      return reply(200, { ok: true, count: changes.length, changes })
    }
    if (url === '/api/portal/product-short-names') {
      const candidates = state.filter((p) => !p.shortName).map((p) => ({ id: p.id, title: p.title, current: null, derived: p.title.split(' - ')[0] }))
      return reply(200, { ok: true, total: state.length, withShortName: state.length - candidates.length, hasKey, candidates })
    }
    throw new Error(`unexpected ${url}`)
  }) as unknown as typeof fetch
  return posts
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  invalidateCatalogue.mockClear()
})

describe('ShortNamePanel', () => {
  it('keeps Write with AI available after Fill from titles, for the names that were derived', async () => {
    const posts = serve([
      { id: 'zma', title: 'ZMA - Sports Recovery - 90 vcaps' },
      { id: 'collagen', title: 'Collagen Peptides - Joints & Bones - 153g' },
    ])
    render(<ShortNamePanel />)

    await userEvent.click(await screen.findByRole('button', { name: 'Fill 2 from titles' }))
    expect(await screen.findByText(/Named 2 from their titles/)).toBeInTheDocument()

    // Every product now has a stored name — and the AI pass is still offered
    // for both, because those names are only the title worked out.
    const ai = await screen.findByRole('button', { name: 'Write 2 with AI' })
    expect(ai).toBeEnabled()
    await userEvent.click(ai)
    await waitFor(() => expect(posts.at(-1)).toEqual({ ids: ['zma', 'collagen'], ai: true }))
    expect(await screen.findByText(/2 written by AI/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ZMA - Sports Recovery - 90 vcaps' })).toHaveAttribute('href', '/founderhub/products/item/zma#listing')
  })

  it('leaves a name somebody wrote out of both passes', async () => {
    serve([{ id: 'whey', title: 'Impact Whey Isolate - 1kg', shortName: 'Clear Whey' }])
    render(<ShortNamePanel />)
    expect(await screen.findByText(/Every product on sale has a name that fits/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Write with AI' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /from titles/ })).not.toBeInTheDocument()
  })

  it('says why AI is unavailable when there is no key', async () => {
    serve([{ id: 'zma', title: 'ZMA - 90 vcaps' }], { hasKey: false })
    render(<ShortNamePanel />)
    expect(await screen.findByText(/needs an OpenAI key/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Write 1 with AI' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fill 1 from titles' })).toBeEnabled()
  })
})
