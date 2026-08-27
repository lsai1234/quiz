import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DescriptionCleanupPanel } from '../DescriptionCleanupPanel'

const invalidateCatalogue = jest.fn()
jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: () => invalidateCatalogue() }))

function reply(body: unknown, { ok = true, status = 200 } = {}) {
  return Promise.resolve({ ok, status, json: async () => body } as Response)
}

function candidates(count: number, hasMarkup = true) {
  return Array.from({ length: count }, (_, i) => ({ id: `p${i}`, title: `Product ${i}`, hasMarkup }))
}

function scan(over: Partial<Record<string, unknown>> = {}) {
  return {
    ok: true,
    total: 3,
    withDescription: 3,
    withMarkup: 3,
    candidates: candidates(3),
    ...over,
  }
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  invalidateCatalogue.mockClear()
  jest.restoreAllMocks()
})

describe('DescriptionCleanupPanel', () => {
  it('says how many products are still showing raw markup', async () => {
    global.fetch = jest.fn().mockReturnValue(reply(scan()))
    render(<DescriptionCleanupPanel />)
    expect(await screen.findByText(/3 of 3 still show the supplier's raw HTML/i)).toBeInTheDocument()
  })

  it('renders nothing when there are no imported descriptions to work on', async () => {
    global.fetch = jest
      .fn()
      .mockReturnValue(reply({ ok: true, total: 0, withDescription: 0, withMarkup: 0, candidates: [] }))
    const { container } = render(<DescriptionCleanupPanel />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('hides the markup button but keeps the rewrite once markup is clean', async () => {
    global.fetch = jest
      .fn()
      .mockReturnValue(reply(scan({ withMarkup: 0, candidates: candidates(3, false) })))
    render(<DescriptionCleanupPanel />)

    expect(await screen.findByText(/none are showing raw markup/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clean markup/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /rewrite with ai/i })).toBeInTheDocument()
  })

  it('cleans the markup and reports what changed', async () => {
    global.fetch = jest
      .fn()
      .mockReturnValueOnce(reply(scan({ total: 1, withDescription: 1, withMarkup: 1, candidates: candidates(1) })))
      .mockReturnValueOnce(
        reply({
          ok: true,
          scanned: 1,
          unchanged: 0,
          aiUsed: 0,
          fellBack: 0,
          written: true,
          changes: [{ id: 'p0', title: 'Product 0', before: '<div>Blue shaker.</div>', after: 'Blue shaker.', source: 'cleaned' }],
        }),
      )
      .mockReturnValue(reply(scan({ total: 1, withDescription: 1, withMarkup: 0, candidates: candidates(1, false) })))

    render(<DescriptionCleanupPanel />)
    await userEvent.click(await screen.findByRole('button', { name: /clean markup/i }))

    expect(await screen.findByText(/1 description cleaned/i)).toBeInTheDocument()
    expect(screen.getByText('Product 0')).toBeInTheDocument()
    expect(screen.getByText(/→ Blue shaker\./)).toBeInTheDocument()
    // The shop and quiz read descriptions — they have to re-fetch.
    expect(invalidateCatalogue).toHaveBeenCalled()
  })

  it('sends the work in batches rather than one huge request', async () => {
    const post = jest.fn().mockReturnValue(
      reply({ ok: true, scanned: 10, unchanged: 10, aiUsed: 0, fellBack: 0, written: false, changes: [] }),
    )
    global.fetch = jest.fn((_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? post(_url, init) : reply(scan({ total: 25, withDescription: 25, withMarkup: 25, candidates: candidates(25) })),
    ) as unknown as typeof global.fetch

    render(<DescriptionCleanupPanel />)
    await userEvent.click(await screen.findByRole('button', { name: /clean markup/i }))

    // 25 candidates at a batch of 10 → three requests, none of them oversized.
    await waitFor(() => expect(post).toHaveBeenCalledTimes(3))
    const sizes = post.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).ids.length)
    expect(sizes).toEqual([10, 10, 5])
  })

  it('asks for the rewrite only when the AI button is pressed', async () => {
    const post = jest.fn().mockReturnValue(
      reply({ ok: true, scanned: 3, unchanged: 0, aiUsed: 3, fellBack: 0, written: true, changes: [] }),
    )
    global.fetch = jest.fn((_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? post(_url, init) : reply(scan()),
    ) as unknown as typeof global.fetch

    render(<DescriptionCleanupPanel />)
    await userEvent.click(await screen.findByRole('button', { name: /rewrite with ai/i }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(JSON.parse((post.mock.calls[0][1] as RequestInit).body as string).ai).toBe(true)
    expect(await screen.findByText(/3 rewritten, 0 kept as the supplier wrote them/i)).toBeInTheDocument()
  })

  it('surfaces the server error instead of claiming success', async () => {
    global.fetch = jest.fn((_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? reply({ ok: false, error: 'No OPENAI_API_KEY is set, so the rewrite has nothing to call.' }, { ok: false, status: 400 })
        : reply(scan()),
    ) as unknown as typeof global.fetch

    render(<DescriptionCleanupPanel />)
    await userEvent.click(await screen.findByRole('button', { name: /rewrite with ai/i }))

    expect(await screen.findByText(/No OPENAI_API_KEY is set/i)).toBeInTheDocument()
    expect(screen.queryByText(/rewritten/i)).not.toBeInTheDocument()
    expect(invalidateCatalogue).not.toHaveBeenCalled()
  })

  it('stops after a failed batch rather than carrying on through the rest', async () => {
    const post = jest
      .fn()
      .mockReturnValueOnce(reply({ ok: true, scanned: 10, unchanged: 10, aiUsed: 0, fellBack: 0, written: false, changes: [] }))
      .mockReturnValueOnce(reply({ ok: false, error: 'Cleanup failed.' }, { ok: false, status: 500 }))
    global.fetch = jest.fn((_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? post(_url, init) : reply(scan({ total: 25, withDescription: 25, withMarkup: 25, candidates: candidates(25) })),
    ) as unknown as typeof global.fetch

    render(<DescriptionCleanupPanel />)
    await userEvent.click(await screen.findByRole('button', { name: /clean markup/i }))

    expect(await screen.findByText(/Cleanup failed/i)).toBeInTheDocument()
    // The third batch is never sent.
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('shows why a rewrite was rejected rather than hiding the fallback', async () => {
    global.fetch = jest.fn((_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? reply({
            ok: true,
            scanned: 1,
            unchanged: 0,
            aiUsed: 0,
            fellBack: 1,
            written: true,
            changes: [
              {
                id: 'p0',
                title: 'Product 0',
                before: '<div>Blue shaker.</div>',
                after: 'Blue shaker.',
                source: 'cleaned',
                reason: 'claim-flagged',
                flags: [{ match: 'proven', why: 'implies a proven/guaranteed effect' }],
              },
            ],
          })
        : reply(scan({ total: 1, withDescription: 1, withMarkup: 1, candidates: candidates(1) })),
    ) as unknown as typeof global.fetch

    render(<DescriptionCleanupPanel />)
    await userEvent.click(await screen.findByRole('button', { name: /rewrite with ai/i }))

    expect(await screen.findByText(/made a health claim/i)).toBeInTheDocument()
    expect(screen.getByText(/“proven”/)).toBeInTheDocument()
  })
})
