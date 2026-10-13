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

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/**
 * The panel also reads the product list (to leave products waiting for review
 * to Review). Every fetch double below goes through this, which answers that
 * request itself — every product on sale unless the test lists it in
 * `pendingIds` — and hands the rest (the scan and the batches) to the test's
 * own double.
 */
let pendingIds: string[] = []
function withProducts(inner: jest.Mock | Fetcher) {
  return jest.fn((url: string, init?: RequestInit) => {
    if (url === '/api/portal/products?all=1') {
      const products = Array.from({ length: 30 }, (_, i) => ({
        product: { id: `p${i}`, title: `Product ${i}` },
        state: pendingIds.includes(`p${i}`) ? 'pending' : 'live',
      }))
      return reply({ source: 'real', products })
    }
    return (inner as Fetcher)(url, init)
  }) as unknown as typeof global.fetch
}

/** The scan for a GET, `post` for every batch. */
function scanThen(scanBody: unknown, post: jest.Mock) {
  return withProducts((url: string, init?: RequestInit) =>
    init?.method === 'POST' ? post(url, init) : reply(scanBody),
  )
}

const originalFetch = global.fetch
afterEach(() => {
  pendingIds = []
  global.fetch = originalFetch
  invalidateCatalogue.mockClear()
  jest.restoreAllMocks()
})

describe('DescriptionCleanupPanel', () => {
  it('says how many products are still showing raw markup', async () => {
    global.fetch = withProducts(jest.fn().mockReturnValue(reply(scan())))
    render(<DescriptionCleanupPanel />)
    expect(await screen.findByText(/3 of 3 still show the supplier's raw HTML/i)).toBeInTheDocument()
  })

  it('says there is nothing to tidy when no product on sale has an imported description', async () => {
    global.fetch = withProducts(
      jest.fn().mockReturnValue(reply({ ok: true, total: 0, withDescription: 0, withMarkup: 0, candidates: [] })),
    )
    render(<DescriptionCleanupPanel />)
    expect(await screen.findByText(/nothing for this to tidy/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('leaves products waiting for review out of the count and the run', async () => {
    pendingIds = ['p1']
    const post = jest.fn().mockReturnValue(
      reply({ ok: true, scanned: 2, unchanged: 2, aiUsed: 0, fellBack: 0, written: false, changes: [] }),
    )
    global.fetch = scanThen(scan(), post)
    const onSummary = jest.fn()
    render(<DescriptionCleanupPanel onSummary={onSummary} />)

    expect(await screen.findByText(/2 of 2 still show the supplier's raw HTML/i)).toBeInTheDocument()
    expect(onSummary).toHaveBeenLastCalledWith(expect.objectContaining({ count: 2 }))

    await userEvent.click(screen.getByRole('button', { name: /clean markup/i }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(JSON.parse((post.mock.calls[0][1] as RequestInit).body as string).ids).toEqual(['p0', 'p2'])
  })

  it('hides the markup button but keeps the rewrite once markup is clean', async () => {
    global.fetch = withProducts(jest.fn().mockReturnValue(reply(scan({ withMarkup: 0, candidates: candidates(3, false) }))))
    render(<DescriptionCleanupPanel />)

    expect(await screen.findByText(/none are showing raw markup/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clean markup/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /rewrite with ai/i })).toBeInTheDocument()
  })

  it('cleans the markup and reports what changed, each product linking to its page', async () => {
    global.fetch = withProducts(
      jest
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
        .mockReturnValue(reply(scan({ total: 1, withDescription: 1, withMarkup: 0, candidates: candidates(1, false) }))),
    )

    render(<DescriptionCleanupPanel />)
    await userEvent.click(await screen.findByRole('button', { name: /clean markup/i }))

    expect(await screen.findByText(/1 description cleaned/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Product 0' })).toHaveAttribute('href', '/founderhub/products/item/p0#listing')
    expect(screen.getByText(/→ Blue shaker\./)).toBeInTheDocument()
    // The shop and quiz read descriptions — they have to re-fetch.
    expect(invalidateCatalogue).toHaveBeenCalled()
  })

  it('sends the work in batches rather than one huge request', async () => {
    const post = jest.fn().mockReturnValue(
      reply({ ok: true, scanned: 10, unchanged: 10, aiUsed: 0, fellBack: 0, written: false, changes: [] }),
    )
    global.fetch = scanThen(scan({ total: 25, withDescription: 25, withMarkup: 25, candidates: candidates(25) }), post)

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
    global.fetch = scanThen(scan(), post)

    render(<DescriptionCleanupPanel />)
    await userEvent.click(await screen.findByRole('button', { name: /rewrite with ai/i }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(JSON.parse((post.mock.calls[0][1] as RequestInit).body as string).ai).toBe(true)
    expect(await screen.findByText(/3 rewritten, 0 kept as the supplier wrote them/i)).toBeInTheDocument()
  })

  it('leaves descriptions the founder wrote out of the AI rewrite, and says what it left alone', async () => {
    const post = jest.fn().mockReturnValue(
      reply({ ok: true, scanned: 2, unchanged: 0, aiUsed: 1, fellBack: 0, editedMeanwhile: 1, written: true, changes: [] }),
    )
    const mixed = [
      { id: 'p0', title: 'Product 0', hasMarkup: true, founderWritten: true },
      { id: 'p1', title: 'Product 1', hasMarkup: true },
      { id: 'p2', title: 'Product 2', hasMarkup: true },
    ]
    global.fetch = scanThen(scan({ candidates: mixed }), post)

    render(<DescriptionCleanupPanel />)
    await userEvent.click(await screen.findByRole('button', { name: /rewrite with ai/i }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(JSON.parse((post.mock.calls[0][1] as RequestInit).body as string).ids).toEqual(['p1', 'p2'])
    expect(await screen.findByText(/1 you wrote yourself was left as it is/)).toBeInTheDocument()
    expect(screen.getByText(/1 was changed on its product page while this ran, so it was left alone/)).toBeInTheDocument()
  })

  it('reports its count and that it is running to the card around it', async () => {
    let release: () => void = () => {}
    const post = jest.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = () =>
            resolve({ ok: true, status: 200, json: async () => ({ ok: true, aiUsed: 0, fellBack: 0, changes: [] }) } as Response)
        }),
    )
    global.fetch = scanThen(scan(), post)
    const onSummary = jest.fn()
    const onRunningChange = jest.fn()
    render(<DescriptionCleanupPanel onSummary={onSummary} onRunningChange={onRunningChange} />)

    await screen.findByText(/3 of 3 still show/)
    expect(onSummary).toHaveBeenLastCalledWith({ count: 3, line: expect.stringMatching(/3 of 3 on sale still show/) })

    await userEvent.click(screen.getByRole('button', { name: /clean markup/i }))
    await waitFor(() => expect(onRunningChange).toHaveBeenLastCalledWith(true))
    release()
    await waitFor(() => expect(onRunningChange).toHaveBeenLastCalledWith(false))
  })

  it('surfaces the server error instead of claiming success', async () => {
    const post = jest
      .fn()
      .mockReturnValue(reply({ ok: false, error: 'No OPENAI_API_KEY is set, so the rewrite has nothing to call.' }, { ok: false, status: 400 }))
    global.fetch = scanThen(scan(), post)

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
    global.fetch = scanThen(scan({ total: 25, withDescription: 25, withMarkup: 25, candidates: candidates(25) }), post)

    render(<DescriptionCleanupPanel />)
    await userEvent.click(await screen.findByRole('button', { name: /clean markup/i }))

    expect(await screen.findByText(/Cleanup failed/i)).toBeInTheDocument()
    // The third batch is never sent.
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('shows why a rewrite was rejected rather than hiding the fallback', async () => {
    const post = jest.fn().mockReturnValue(
      reply({
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
      }),
    )
    global.fetch = scanThen(scan({ total: 1, withDescription: 1, withMarkup: 1, candidates: candidates(1) }), post)

    render(<DescriptionCleanupPanel />)
    await userEvent.click(await screen.findByRole('button', { name: /rewrite with ai/i }))

    expect(await screen.findByText(/made a health claim/i)).toBeInTheDocument()
    expect(screen.getByText(/“proven”/)).toBeInTheDocument()
  })
})
