import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiSuggestPanel } from '../AiSuggestPanel'
import { pendingProduct } from '../review/__tests__/fixtures'

const invalidateCatalogue = jest.fn()
jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: () => invalidateCatalogue() }))

const live = (id: string, title: string, o = {}) => ({
  product: pendingProduct({ id, title, review: undefined, stackSlots: [], goals: [], swapGroup: 'general', ...o }),
  state: 'live',
})

const CATALOGUE = [
  live('pea', 'Pea Protein'),
  live('tagged', 'Tagged Whey', { stackSlots: ['protein'], goals: ['muscle'], swapGroup: 'protein-whey' }),
  { product: pendingProduct({ id: 'waiting', title: 'Waiting Product', stackSlots: [], goals: [] }), state: 'pending' },
]

const SUGGESTION = {
  stackSlots: ['protein', 'recovery'],
  goals: ['muscle'],
  swapGroup: 'protein-plant',
  cost: 4.2,
  servings: 30,
  hasStimulants: false,
  subscriptionEligible: true,
}

function serve({ classify, save }: { classify?: (ids: string[]) => { status?: number; body: unknown }; save?: () => { status?: number; body: unknown } } = {}) {
  const calls: Array<{ url: string; body: Record<string, unknown> | null }> = []
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : null
    calls.push({ url, body })
    const reply = (status: number, json: unknown) => ({ ok: status < 400, status, json: async () => json }) as Response
    if (url === '/api/portal/products?all=1') return reply(200, { source: 'real', products: CATALOGUE })
    if (url === '/api/portal/ai-classify') {
      const r = classify?.(body.ids) ?? {
        body: { usedAI: true, results: body.ids.map((id: string) => ({ id, title: id, suggestion: SUGGESTION })) },
      }
      return reply(r.status ?? 200, r.body)
    }
    if (url === '/api/portal/products') {
      const r = save?.() ?? { body: { ok: true } }
      return reply(r.status ?? 200, r.body)
    }
    throw new Error(`unexpected ${url}`)
  }) as unknown as typeof fetch
  return calls
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  invalidateCatalogue.mockClear()
})

describe('AiSuggestPanel', () => {
  it('asks nothing until pressed, and then only about untagged products on sale', async () => {
    const calls = serve()
    const onSummary = jest.fn()
    render(<AiSuggestPanel onSummary={onSummary} />)

    const ask = await screen.findByRole('button', { name: 'Suggest tags for 1' })
    expect(calls.some((c) => c.url === '/api/portal/ai-classify')).toBe(false)
    expect(onSummary).toHaveBeenLastCalledWith(expect.objectContaining({ count: 1 }))

    await userEvent.click(ask)
    await screen.findByRole('link', { name: 'Pea Protein' })
    // Not the tagged one, and not the one waiting for review.
    expect(calls.find((c) => c.url === '/api/portal/ai-classify')?.body).toEqual({ ids: ['pea'], apply: false })
  })

  it('shows each tag by its label as its own chip, and toggling one drops only that tag', async () => {
    const calls = serve()
    render(<AiSuggestPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest tags for 1' }))

    const card = (await screen.findByRole('link', { name: 'Pea Protein' })).closest('li')!
    const recovery = within(card).getByRole('button', { name: 'Recovery' })
    expect(within(card).getByRole('button', { name: 'Protein' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(card).getByRole('button', { name: 'Plant protein' })).toBeInTheDocument()
    // Never a cost or a serving count.
    expect(within(card).queryByText(/cost|servings/i)).not.toBeInTheDocument()

    await userEvent.click(recovery)
    expect(recovery).toHaveAttribute('aria-pressed', 'false')
    expect(within(card).getByRole('button', { name: 'Protein' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(card).getByRole('button', { name: /Apply 3 to this product/ }))
    expect(await within(card).findByText('Applied')).toBeInTheDocument()
    const saved = calls.find((c) => c.url === '/api/portal/products')!.body!
    expect(saved).toEqual({ id: 'pea', set: { stackSlots: ['protein'], goals: ['muscle'], swapGroup: 'protein-plant' } })
    expect(saved).not.toHaveProperty('patch')
    expect(invalidateCatalogue).toHaveBeenCalled()
  })

  it('shows a real failure, not "nothing to suggest", when the suggestion fails', async () => {
    serve({ classify: () => ({ status: 504, body: null }) })
    render(<AiSuggestPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest tags for 1' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/did not come back \(HTTP 504\).*Nothing was changed/)
    expect(screen.queryByText(/nothing to suggest/i)).not.toBeInTheDocument()
    // …and the way on is still there.
    expect(screen.getByRole('button', { name: 'Suggest tags for 1' })).toBeEnabled()
  })

  it('names, with a link, a product the classifier sent nothing back for', async () => {
    serve({ classify: () => ({ body: { usedAI: true, results: [] } }) })
    render(<AiSuggestPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest tags for 1' }))
    expect(await screen.findByText(/No suggestion came back for/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pea Protein' })).toHaveAttribute('href', '/founderhub/products/item/pea#quiz')
  })

  it('shows why a save was refused, keeping the suggestions to try again', async () => {
    serve({ save: () => ({ status: 400, body: { error: 'Not saved.', problems: ['Goals can’t include “flying”.'] } }) })
    render(<AiSuggestPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest tags for 1' }))
    const card = (await screen.findByRole('link', { name: 'Pea Protein' })).closest('li')!
    await userEvent.click(within(card).getByRole('button', { name: /Apply 4 to this product/ }))
    await waitFor(() => expect(within(card).getByRole('alert')).toHaveTextContent('Goals can’t include “flying”.'))
    expect(within(card).getByRole('button', { name: 'Recovery' })).toBeInTheDocument()
  })
})
