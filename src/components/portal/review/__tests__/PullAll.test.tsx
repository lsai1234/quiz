import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PullAll } from '../PullAll'
import type { QueueEntry } from '../queue-model'
import { entry } from './fixtures'

/** A streamed pull reply: progress lines, then the result line (or none). */
function stream(lines: unknown[], status = 200) {
  return { ok: status < 400, status, body: null, text: async () => lines.map((l) => JSON.stringify(l)).join('\n') } as unknown as Response
}

const done = (id: string, extra: Record<string, unknown> = {}) => ({
  type: 'result',
  ok: true,
  answered: 1,
  filled: ['imageUrl'],
  changed: {},
  unresolved: [],
  product: entry({ id, title: id }).product,
  remaining: [],
  ...extra,
})

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  window.sessionStorage.clear()
})

function gappy(n: number): QueueEntry[] {
  return Array.from({ length: n }, (_, i) => entry({ id: `p${i}`, title: `Product ${i}`, imageUrl: null }))
}

describe('PullAll', () => {
  it('asks only about products PowerBody could still fill, one at a time, and says what each got', async () => {
    const asked: string[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const { id, stream: streamed } = JSON.parse(init!.body as string)
      expect(streamed).toBe(true)
      asked.push(id)
      return stream([{ type: 'step', message: 'Asking PowerBody about 1 SKU whose id we already hold.' }, done(id)])
    }) as unknown as typeof fetch
    const onPulled = jest.fn()
    const onFinished = jest.fn()

    // The middle one has its picture, description and id: nothing to pull.
    const entries = [gappy(1)[0], entry({ id: 'complete', title: 'Complete' }), entry({ id: 'nodesc', title: 'No description', description: '' })]
    render(<PullAll entries={entries} onPulled={onPulled} onFinished={onFinished} paceMs={0} />)

    await userEvent.click(screen.getByRole('button', { name: 'Fill 2 products from PowerBody' }))
    await waitFor(() => expect(onFinished).toHaveBeenCalled())

    expect(asked).toEqual(['p0', 'nodesc'])
    expect(onPulled).toHaveBeenCalledWith('p0', expect.objectContaining({ remaining: [] }))
    const log = screen.getByRole('list', { name: 'What the fill did' })
    expect(within(log).getAllByText(/Filled the picture/)).toHaveLength(2)
    expect(within(log).getByRole('link', { name: 'Product 0' })).toHaveAttribute('href', '/founderhub/products/item/p0?queue=review')
  })

  it('stops at the first refusal and shows PowerBody’s own words, with Run the checks', async () => {
    const refusal = 'PowerBody did not accept our login (“Invalid API key”). Check the API user and key in Settings → Supplier.'
    const asked: string[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const { id } = JSON.parse(init!.body as string)
      asked.push(id)
      if (id === 'p1') {
        return stream([
          { type: 'step', message: 'Asking PowerBody about P1.' },
          { type: 'result', ok: true, answered: 0, filled: [], changed: {}, unresolved: [{ sku: 'P1', message: refusal }] },
        ])
      }
      return stream([done(id)])
    }) as unknown as typeof fetch

    render(<PullAll entries={gappy(4)} onPulled={jest.fn()} onFinished={jest.fn()} paceMs={0} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fill 4 products from PowerBody' }))

    const alert = await screen.findByRole('alert')
    // Stopped at p1: p2 and p3 were never asked about.
    expect(asked).toEqual(['p0', 'p1'])
    expect(alert).toHaveTextContent('PowerBody refused at “Product 1”')
    expect(alert).toHaveTextContent('Invalid API key')
    expect(within(alert).getByRole('link', { name: 'Run the checks' })).toHaveAttribute('href', '/founderhub/settings/supplier')
    // What it tried, readable on the screen.
    expect(screen.getByRole('button', { name: /What it tried \(1 step\)/ })).toBeInTheDocument()
  })

  it('treats a rate limit as a pause, not a failure, and the next press starts with the refused one', async () => {
    let limited = true
    const asked: string[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const { id } = JSON.parse(init!.body as string)
      asked.push(id)
      if (id === 'p1' && limited) {
        limited = false
        return stream([
          {
            type: 'result',
            ok: true,
            answered: 0,
            unresolved: [{ sku: 'P1', message: 'PowerBody are limiting how fast we can ask (“429”). It passes on its own — wait a minute, then carry on.' }],
          },
        ])
      }
      return stream([done(id)])
    }) as unknown as typeof fetch
    const onFinished = jest.fn()

    render(<PullAll entries={gappy(3)} onPulled={jest.fn()} onFinished={onFinished} paceMs={0} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fill 3 products from PowerBody' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/press the fill button again/)
    expect(alert).toHaveTextContent(/limiting how fast we can ask/)
    expect(within(alert).getByRole('link', { name: 'Run the checks' })).toBeInTheDocument()

    // p0 is done; p1 was refused, so it is still to try, and goes first.
    await userEvent.click(screen.getByRole('button', { name: 'Carry on — fill 2 more' }))
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(2))
    expect(asked).toEqual(['p0', 'p1', 'p1', 'p2'])
  })

  it('caps a run, and carries on from where it stopped', async () => {
    const asked: string[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const { id } = JSON.parse(init!.body as string)
      asked.push(id)
      return stream([done(id)])
    }) as unknown as typeof fetch
    const onFinished = jest.fn()

    render(<PullAll entries={gappy(5)} onPulled={jest.fn()} onFinished={onFinished} paceMs={0} cap={2} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fill the next 2 from PowerBody' }))
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1))
    expect(asked).toEqual(['p0', 'p1'])

    await userEvent.click(screen.getByRole('button', { name: 'Carry on — fill 2 more' }))
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(2))
    expect(asked).toEqual(['p0', 'p1', 'p2', 'p3'])
  })

  it('stops after the product in hand when asked', async () => {
    const asked: string[] = []
    let release: () => void = () => {}
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const { id } = JSON.parse(init!.body as string)
      asked.push(id)
      if (id === 'p0') await new Promise<void>((r) => (release = r))
      return stream([done(id)])
    }) as unknown as typeof fetch
    const onFinished = jest.fn()

    render(<PullAll entries={gappy(3)} onPulled={jest.fn()} onFinished={onFinished} paceMs={50} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fill 3 products from PowerBody' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Stop after this one' }))
    release()

    await waitFor(() => expect(onFinished).toHaveBeenCalled())
    expect(asked).toEqual(['p0'])
    expect(screen.getByText(/Stopped after 1 product/)).toBeInTheDocument()
  })

  it('treats a stream that ends without a result as not reached, and moves on', async () => {
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const { id } = JSON.parse(init!.body as string)
      return id === 'p0' ? stream([{ type: 'step', message: 'Searching…' }]) : stream([done(id)])
    }) as unknown as typeof fetch
    const onFinished = jest.fn()

    render(<PullAll entries={gappy(2)} onPulled={jest.fn()} onFinished={onFinished} paceMs={0} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fill 2 products from PowerBody' }))
    await waitFor(() => expect(onFinished).toHaveBeenCalled())
    expect(screen.getByText(/Not reached this time/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says there is nothing to pull when every product is complete', () => {
    render(<PullAll entries={[entry({ id: 'a' })]} onPulled={jest.fn()} onFinished={jest.fn()} />)
    expect(screen.getByText(/nothing left to pull/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
