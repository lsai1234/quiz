import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewQueue } from '../ReviewQueue'
import type { QueueEntry } from '../queue-model'
import { entry } from './fixtures'

const invalidateCatalogue = jest.fn()
jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: () => invalidateCatalogue() }))

type Handler = (body: Record<string, unknown> | null) => { status?: number; body: unknown }

/**
 * A fetch that answers by address. The queue is re-read after every action, so
 * GET /review answers from `queue`, which a test changes to say what the server
 * now holds.
 */
function serve(queue: { current: QueueEntry[] }, posts: Record<string, Handler> = {}, { queueStatus = 200 } = {}) {
  const calls: Array<{ url: string; body: Record<string, unknown> | null }> = []
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null
    calls.push({ url, body })
    if (!init?.method || init.method === 'GET') {
      if (url === '/api/portal/products/review') {
        return { ok: queueStatus === 200, status: queueStatus, json: async () => (queueStatus === 200 ? { products: queue.current, count: queue.current.length } : { error: 'Unauthorized' }) } as Response
      }
    }
    const handler = posts[url]
    if (!handler) throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`)
    const { status = 200, body: reply } = handler(body)
    return { ok: status < 400, status, json: async () => reply } as Response
  }) as unknown as typeof fetch
  return calls
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  invalidateCatalogue.mockClear()
  try {
    window.sessionStorage.clear()
  } catch {
    /* ignore */
  }
})

const WHEY = entry({ id: 'whey-choc', title: 'Impact Whey Chocolate', review: { status: 'pending', sources: {}, confirmed: [], importedAt: 'x', notes: ['Split by size: 1kg and 2.5kg kept apart.', 'Swap group not recognised — set to general.', 'Flavour P45757 still shows its code.'] } }, ['stackSlots', 'goals', 'shortReason'])
const VANILLA = entry({ id: 'whey-van', title: 'Impact Whey Vanilla', imageUrl: null, description: '' }, [])
const BAR = entry({ id: 'bar', title: 'Protein Bar' }, [])

describe('ReviewQueue', () => {
  it('lists what is waiting, with what is left on each and what PowerBody could still fill', async () => {
    serve({ current: [WHEY, VANILLA] })
    render(<ReviewQueue />)

    const title = await screen.findByRole('link', { name: 'Impact Whey Chocolate' })
    // Opens the product page in queue mode — that page shows "x of N · Skip".
    expect(title).toHaveAttribute('href', '/founderhub/products/item/whey-choc?queue=review')
    const row = title.closest('li')!
    expect(within(row).getByText('3 to check')).toBeInTheDocument()
    expect(within(row).getByText(/Still to check: Stack slots, Goals, Card copy/)).toBeInTheDocument()
    // The import's own notes, the first two shown and the rest a press away.
    expect(within(row).getByText(/Split by size/)).toBeInTheDocument()
    expect(within(row).queryByText(/still shows its code/)).not.toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: /1 more note/ }))
    expect(within(row).getByText(/still shows its code/)).toBeInTheDocument()

    const vanilla = screen.getByRole('link', { name: 'Impact Whey Vanilla' }).closest('li')!
    expect(within(vanilla).getByText('Ready to approve')).toBeInTheDocument()
    expect(within(vanilla).getAllByText('No picture').length).toBeGreaterThan(0)
    expect(within(vanilla).getByText('No description')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Review all 2, one at a time' })).toHaveAttribute(
      'href',
      '/founderhub/products/item/whey-choc?queue=review',
    )
  })

  it('points to Add products when nothing is waiting', async () => {
    serve({ current: [] })
    render(<ReviewQueue />)
    expect(await screen.findByText('Nothing waiting for review')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add products' })).toHaveAttribute('href', '/founderhub/products/add')
  })

  it('says the session expired, with a way to sign in, rather than an empty queue', async () => {
    serve({ current: [] }, {}, { queueStatus: 401 })
    render(<ReviewQueue />)
    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in again' })).toBeInTheDocument()
    expect(screen.queryByText('Nothing waiting for review')).not.toBeInTheDocument()
  })

  it('combines the ticked ones under the name given, and links to the result', async () => {
    const queue = { current: [WHEY, VANILLA, BAR] }
    const calls = serve(queue, {
      '/api/portal/products/review': () => {
        queue.current = [BAR]
        return { body: { ok: true, id: 'impact-whey', variants: 2 } }
      },
    })
    render(<ReviewQueue />)

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Impact Whey Chocolate' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Impact Whey Vanilla' }))
    await userEvent.click(screen.getByRole('button', { name: 'Combine as flavours of one product' }))
    await userEvent.type(screen.getByLabelText(/Name for the combined product/), 'Impact Whey')
    await userEvent.click(screen.getByRole('button', { name: 'Combine 2' }))

    expect(await screen.findByText(/Combined 2 into one product with 2 flavours or sizes/)).toBeInTheDocument()
    expect(calls.find((c) => c.body?.action === 'combine')?.body).toEqual({ action: 'combine', ids: ['whey-choc', 'whey-van'], title: 'Impact Whey' })
    expect(screen.getByRole('link', { name: 'Open the combined product' })).toHaveAttribute(
      'href',
      '/founderhub/products/item/impact-whey?queue=review#variants',
    )
  })

  it('shows the server’s reason when they cannot be combined', async () => {
    serve({ current: [WHEY, BAR] }, {
      '/api/portal/products/review': () => ({
        status: 400,
        body: { error: 'These are different sizes (1kg and 2.5kg) — sizes must stay separate products.' },
      }),
    })
    render(<ReviewQueue />)

    await userEvent.click(await screen.findByRole('checkbox', { name: /Tick all 2/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Combine as flavours of one product' }))
    await userEvent.click(screen.getByRole('button', { name: 'Combine 2' }))

    expect(await screen.findByText(/Not combined — These are different sizes/)).toBeInTheDocument()
    expect(screen.getByText(/Untick the ones that are not flavours/)).toBeInTheDocument()
  })

  it('discards only on the second press', async () => {
    const queue = { current: [WHEY, BAR] }
    const calls = serve(queue, {
      '/api/portal/products/review': () => {
        queue.current = [WHEY]
        return { body: { ok: true, discarded: 1 } }
      },
    })
    render(<ReviewQueue />)

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Protein Bar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Discard 1' }))
    expect(calls.some((c) => c.body?.action === 'discard')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: /Tap again to discard 1/ }))

    expect(await screen.findByText(/1 product discarded/)).toBeInTheDocument()
    expect(calls.find((c) => c.body?.action === 'discard')?.body).toEqual({ action: 'discard', ids: ['bar'] })
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Protein Bar' })).not.toBeInTheDocument())
  })

  it('approves the fully checked ones and says what is left on the rest', async () => {
    const queue = { current: [WHEY, VANILLA, BAR] }
    const calls = serve(queue, {
      '/api/portal/products': () => {
        queue.current = [WHEY]
        return { body: { ok: true, approved: ['whey-van', 'bar'], notReady: [{ id: 'whey-choc', remaining: ['stackSlots', 'goals'] }] } }
      },
    })
    render(<ReviewQueue />)

    await userEvent.click(await screen.findByRole('checkbox', { name: /Tick all 3/ }))
    await userEvent.click(screen.getByRole('button', { name: /Approve the 2 ticked that are fully checked/ }))

    expect(await screen.findByText(/2 products approved and on sale: Impact Whey Vanilla, Protein Bar/)).toBeInTheDocument()
    expect(calls.find((c) => c.url === '/api/portal/products')?.body).toEqual({
      action: 'approve-ready',
      ids: ['whey-choc', 'whey-van', 'bar'],
    })
    const notice = screen.getByText(/approved and on sale/).closest<HTMLElement>('[role="status"]')!
    expect(within(notice).getByRole('link', { name: 'Impact Whey Chocolate' })).toHaveAttribute(
      'href',
      '/founderhub/products/item/whey-choc?queue=review#checks',
    )
    expect(within(notice).getByText(/2 fields still to check: Stack slots, Goals/)).toBeInTheDocument()
    expect(invalidateCatalogue).toHaveBeenCalled()
  })

  it('says which were approved when the batch stopped part-way, and every one that was not', async () => {
    // One had been discarded in another tab; then the store stopped saving.
    // What was approved is on sale and must be said first — never "Nothing
    // was approved" — and each of the rest says why.
    const queue = { current: [VANILLA, BAR, WHEY] }
    serve(queue, {
      '/api/portal/products': () => {
        queue.current = [BAR, WHEY]
        return {
          body: {
            ok: true,
            approved: ['whey-van'],
            notReady: [],
            gone: ['gone-one'],
            failed: { id: 'bar', error: 'Not saved — the database is not answering.', notTried: ['whey-choc'] },
          },
        }
      },
    })
    render(<ReviewQueue />)
    await userEvent.click(await screen.findByRole('checkbox', { name: /Tick all 3/ }))
    await userEvent.click(screen.getByRole('button', { name: /Approve the 2 ticked/ }))

    const notice = (await screen.findByText(/1 product approved and on sale: Impact Whey Vanilla\./)).closest<HTMLElement>('[role="alert"]')!
    expect(notice).toHaveTextContent('3 not approved — saving stopped part-way. Why for each is below; try the rest again in a moment:')
    expect(within(notice).getByText(/no longer in the store/)).toBeInTheDocument()
    expect(within(notice).getByRole('link', { name: 'Protein Bar' })).toBeInTheDocument()
    expect(within(notice).getByText(/the database is not answering/)).toBeInTheDocument()
    expect(within(notice).getByText(/not tried, because the one before it could not be saved/)).toBeInTheDocument()
    expect(invalidateCatalogue).toHaveBeenCalled()
  })

  it('with nothing ticked, approves only the ones that look ready', async () => {
    const calls = serve({ current: [WHEY, VANILLA] }, {
      '/api/portal/products': () => ({ body: { ok: true, approved: ['whey-van'], notReady: [] } }),
    })
    render(<ReviewQueue />)
    await userEvent.click(await screen.findByRole('button', { name: 'Approve the 1 fully checked' }))
    await screen.findByText(/1 product approved/)
    expect(calls.find((c) => c.url === '/api/portal/products')?.body).toEqual({ action: 'approve-ready', ids: ['whey-van'] })
  })
})
