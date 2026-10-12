import {
  clause,
  freshCard,
  isAddable,
  notOnAccountNext,
  rateLimitWait,
  readNdjson,
  splitCodes,
  withAnswer,
} from '../lookup'
import { addCards, ADD_BATCH } from '../addProducts'
import { json, ndjson, result, row } from './helpers'

describe('splitCodes', () => {
  it('takes any separator a pasted list arrives with, and drops repeats after normalising', () => {
    expect(splitCodes('p100, P200;P300\tP400\n\n • P500 | p100')).toEqual(['P100', 'P200', 'P300', 'P400', 'P500'])
  })

  it('keeps a slash, which some brands’ codes carry, and trims list punctuation', () => {
    expect(splitCodes('- ON/GOLD-2KG.\n* 44338')).toEqual(['ON/GOLD-2KG', '44338'])
  })

  it('finds nothing in a blank box', () => {
    expect(splitCodes(' ,; \n')).toEqual([])
  })
})

describe('withAnswer', () => {
  it('ticks a found product we do not sell yet', () => {
    const card = withAnswer(freshCard('c1', 'P1'), result('P1', { card: row({ sku: 'P1' }) }))
    expect(card).toMatchObject({ status: 'found', sku: 'P1', ticked: true })
    expect(isAddable(card)).toBe(true)
  })

  it('does not tick one we already sell — it becomes a link, not a candidate', () => {
    const stored = { id: 'whey', title: 'Whey', state: 'live' as const, skus: ['P1'] }
    const card = withAnswer(freshCard('c1', 'P1'), result('P1', { card: row({ sku: 'P1' }), stored }))
    expect(card.ticked).toBe(false)
    expect(isAddable(card)).toBe(false)
  })

  it('records whose problem a refusal is, defaulting to PowerBody’s own error', () => {
    const card = withAnswer(freshCard('c1', 'P1'), result('P1', { status: 'refused', message: 'Boom', next: ['run-checks'] }))
    expect(card).toMatchObject({ status: 'refused', refusal: 'supplier-error', next: ['run-checks'], row: null })
  })

  it('keeps an all-digit code’s SKU unknown until the answer names it', () => {
    expect(freshCard('c1', '44338').sku).toBeNull()
    expect(withAnswer(freshCard('c1', '44338'), result('44338', { kind: 'id', card: row({ sku: 'P777' }) })).sku).toBe('P777')
  })
})

describe('the rest', () => {
  it('waits 45 seconds after a rate limit, then twice as long each time, five minutes at most', () => {
    expect([1, 2, 3, 4, 5].map(rateLimitWait)).toEqual([45_000, 90_000, 180_000, 300_000, 300_000])
  })

  it('offers no list to refresh on the sample catalogue', () => {
    expect(notOnAccountNext('mock')).toEqual(['check-code', 'open-settings'])
    expect(notOnAccountNext('powerbody')).toEqual(['check-code', 'refresh-index', 'search-anyway', 'paste-id'])
  })

  it('takes the full stop off a server’s sentence so ours can follow it', () => {
    expect(clause(' PowerBody refused. ')).toBe('PowerBody refused')
  })
})

describe('readNdjson', () => {
  it('reads lines as they stream, across chunk boundaries, skipping a torn one', async () => {
    const encoder = new TextEncoder()
    const parts = ['{"type":"step","message":"one"}\n{"type":"st', 'ep","message":"two"}\nnot json\n', '{"type":"result","status":"found"}']
    let i = 0
    const res = { body: { getReader: () => ({ read: async () => (i < parts.length ? { done: false, value: encoder.encode(parts[i++]) } : { done: true }) }) } }
    const lines: unknown[] = []
    await readNdjson(res as unknown as Response, (l) => lines.push(l))
    expect(lines).toEqual([
      { type: 'step', message: 'one' },
      { type: 'step', message: 'two' },
      { type: 'result', status: 'found' },
    ])
  })

  it('falls back to the whole body when the response cannot be streamed', async () => {
    const lines: unknown[] = []
    await readNdjson({ body: null, text: async () => '{"a":1}\n{"b":2}\n' } as unknown as Response, (l) => lines.push(l))
    expect(lines).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('reads the helper’s stand-in the same way', async () => {
    const lines: unknown[] = []
    await readNdjson(ndjson([[{ x: 1 }], [{ y: 2 }]]), (l) => lines.push(l))
    expect(lines).toEqual([{ x: 1 }, { y: 2 }])
  })
})

describe('addCards', () => {
  const originalFetch = global.fetch
  afterEach(() => {
    global.fetch = originalFetch
  })

  const found = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      withAnswer(freshCard(`c${i + 1}`, `P${i + 1}`), result(`P${i + 1}`, { card: row({ sku: `P${i + 1}`, productId: `${i + 1}`, name: `Product ${i + 1}`, mappedId: `product-${i + 1}` }) })),
    )

  it('makes one product from the first four flavours, and joins the rest to it four at a time', async () => {
    const bodies: Array<Record<string, unknown>> = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      bodies.push(body)
      return body.combine
        ? json({ ok: true, outcomes: [{ status: 'added', id: 'whey', title: 'Whey' }], notFound: [] })
        : json({ ok: true, into: 'whey', flavoursAdded: 4, outcomes: [], notFound: [] })
    }) as unknown as typeof fetch

    const progress: number[] = []
    const report = await addCards(found(9), { mode: 'combine', title: 'Whey' }, (r) => progress.push(r.done))

    expect(ADD_BATCH).toBe(4)
    expect(bodies).toEqual([
      { productIds: ['1', '2', '3', '4'], skus: [], combine: true, title: 'Whey' },
      { productIds: ['5', '6', '7', '8'], skus: [], into: 'whey' },
      { productIds: ['9'], skus: [], into: 'whey' },
    ])
    expect(progress).toEqual([4, 8, 9])
    expect(report.target).toEqual({ id: 'whey', title: 'Whey', state: 'pending' })
    expect(report.placed.size).toBe(9)
  })

  it('matches an added product to its card by the id it was stored under when the names differ', async () => {
    global.fetch = jest.fn(async () =>
      json({ ok: true, outcomes: [{ status: 'added', id: 'product-2-p2', title: 'Renamed' }, { status: 'added', id: 'product-1', title: 'Also renamed' }], notFound: [] }),
    ) as unknown as typeof fetch
    const report = await addCards(found(2), { mode: 'separate' })
    expect(report.placed.get('c1')).toEqual({ id: 'product-1', title: 'Also renamed' })
    expect(report.placed.get('c2')).toEqual({ id: 'product-2-p2', title: 'Renamed' })
  })

  it('stops at a refusal and sends nothing after it', async () => {
    const fetchMock = jest.fn(async () => json({ error: 'These are different sizes (1kg, 2kg).' }, 400))
    global.fetch = fetchMock as unknown as typeof fetch
    const report = await addCards(found(6), { mode: 'combine' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(report.refused).toEqual({ message: 'These are different sizes (1kg, 2kg).', holder: undefined, sizes: true })
    expect(report.done).toBe(0)
  })

  it('does not count a code PowerBody did not return as added', async () => {
    global.fetch = jest.fn(async () =>
      json({ ok: true, outcomes: [{ status: 'added', id: 'product-1', title: 'Product 1' }], notFound: ['2'] }),
    ) as unknown as typeof fetch
    const report = await addCards(found(2), { mode: 'separate' })
    expect([...report.placed.keys()]).toEqual(['c1'])
    expect(report.notFound).toEqual(['2'])
  })
})
