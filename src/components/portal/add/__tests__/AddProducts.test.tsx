import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddProducts } from '../AddProducts'
import { STANDING, deferred, json, ndjson, quick, result, router, row, type Call } from './helpers'

jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: jest.fn() }))

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  jest.useRealTimers()
})

const WHEY = row({ sku: 'P100', productId: '100', name: 'Whey Protein 1kg' })
const CREATINE = row({ sku: 'P200', productId: '200', name: 'Creatine 300g', category: 'Performance', wholesalePrice: 6, sellPrice: 12.99, marginPct: 31, rrp: null })
const GOLD = row({ sku: 'P400', productId: '400', name: 'Gold Standard Whey' })

/** Every streamed search the page asked for, in order, by code. */
const searchesIn = (calls: Call[]) =>
  calls.filter((c) => c.url === '/api/portal/supplier/resolve' && c.body?.stream).map((c) => c.body?.code)

const quickPass = (results: ReturnType<typeof quick>[], extra: Record<string, unknown> = {}) =>
  json({
    supplier: 'powerbody',
    source: 'powerbody',
    refusal: null,
    index: { products: 5200, complete: true, updatedAt: '2026-10-08T09:00:00.000Z' },
    results,
    ...extra,
  })

async function lookUp(user: ReturnType<typeof userEvent.setup>, codes: string) {
  await user.type(screen.getByRole('textbox', { name: 'SKUs or product ids' }), codes)
  await user.click(screen.getByRole('button', { name: 'Look up' }))
}

/**
 * The card for a code or product, found by its visible name — the first match,
 * because once added a card also links to the product under the same name.
 */
const card = (name: string | RegExp) => screen.getAllByText(name)[0].closest('li') as HTMLElement

describe('Add products — the lookup', () => {
  it('answers what it can at once, searches the rest one at a time with live progress, and adds the found ones', async () => {
    const finishCreatine = deferred<unknown[]>()
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': (body) => {
        if (body?.codes) {
          return quickPass([
            quick('P100', { status: 'found', productId: '100', via: 'index', message: 'Found Whey Protein 1kg.', card: WHEY }),
            quick('P200'),
            quick('P300'),
            quick('P400', { status: 'found', productId: '400', card: GOLD, stored: { id: 'whey-isolate', title: 'Whey Isolate', state: 'live', skus: ['P400'] } }),
          ])
        }
        if (body?.code === 'P200') {
          return ndjson([
            [
              { type: 'step', phase: 'anchors', message: 'Not in the index — searching PowerBody’s ids.', probes: 0 },
              { type: 'step', phase: 'bisect', message: 'Searching ids 1,000–2,000…', probes: 3 },
            ],
            finishCreatine.promise,
          ])
        }
        return ndjson([
          [
            result('P300', {
              status: 'not-yet',
              message: 'Searched 40 of PowerBody’s ids without finding P300 yet.',
              next: ['search-again', 'paste-id'],
            }),
          ],
        ])
      },
      'POST /api/portal/supplier': () =>
        json({
          ok: true,
          added: 2,
          outcomes: [
            { status: 'added', id: 'whey-protein-1kg', title: 'Whey Protein 1kg' },
            { status: 'added', id: 'creatine-300g', title: 'Creatine 300g' },
          ],
          notFound: [],
        }),
    })

    render(<AddProducts />)
    const user = userEvent.setup()
    // Any separator: commas, new lines, spaces.
    await lookUp(user, 'p100, P200{Shift>}{Enter}{/Shift}P300 P400')

    // ONE quick pass for every code.
    await screen.findByText('Whey Protein 1kg')
    expect(calls.filter((c) => c.body?.codes)).toHaveLength(1)
    expect(calls.find((c) => c.body?.codes)?.body).toEqual({ codes: ['P100', 'P200', 'P300', 'P400'] })

    // The found card in full: what it is, what it costs us, what we would charge.
    const whey = card('Whey Protein 1kg')
    expect(within(whey).getByText(/SKU P100 · PowerBody id 100/)).toBeInTheDocument()
    expect(within(whey).getByText(/12 in stock/)).toBeInTheDocument()
    expect(within(whey).getByText(/PowerBody charge us £10\.00 → our price £19\.99/)).toBeInTheDocument()
    expect(within(whey).getByText(/RRP £24\.99/)).toBeInTheDocument()
    expect(within(whey).getByText(/35% margin/)).toBeInTheDocument()
    expect(within(whey).getByRole('checkbox', { name: 'Add Whey Protein 1kg' })).toBeChecked()

    // Already sold: a link to it, not a tick box.
    const gold = card('Gold Standard Whey')
    expect(within(gold).getByRole('link', { name: 'Whey Isolate →' })).toHaveAttribute('href', '/founderhub/products/item/whey-isolate')
    expect(within(gold).queryByRole('checkbox')).not.toBeInTheDocument()

    // The search shows what it is doing while it does it — and P300 waits its turn.
    expect(await screen.findByText('Searching ids 1,000–2,000…')).toBeInTheDocument()
    expect(searchesIn(calls)).toEqual(['P200'])

    await act(async () => finishCreatine.resolve([result('P200', { card: CREATINE, productId: '200', via: 'search' })]))
    await screen.findByText('Creatine 300g')
    expect(within(card('Creatine 300g')).getByRole('checkbox', { name: 'Add Creatine 300g' })).toBeChecked()

    // Not found yet is not a dead end: search again, or paste its id.
    const p300 = await waitFor(() => {
      const el = card('P300')
      expect(within(el).getByText('Not found yet')).toBeInTheDocument()
      return el
    })
    expect(searchesIn(calls)).toEqual(['P200', 'P300'])
    expect(within(p300).getByRole('button', { name: 'Search again' })).toBeInTheDocument()
    expect(within(p300).getByRole('textbox', { name: 'PowerBody product id for P300' })).toBeInTheDocument()

    // Add the two ticked — by the ids the lookup resolved, so nothing is searched twice.
    await user.click(screen.getByRole('button', { name: 'Add 2 as separate products' }))
    const add = calls.find((c) => c.url === '/api/portal/supplier')
    expect(add?.body).toEqual({ productIds: ['100', '200'], skus: [] })

    expect(await screen.findByText(/2 products added, waiting for review\. Nothing is on sale until you approve it\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Next: review them' })).toHaveAttribute('href', '/founderhub/products/review')
    // Each card now says where it went, and cannot be added again.
    expect(within(card('Whey Protein 1kg')).getByRole('link', { name: 'Whey Protein 1kg' })).toHaveAttribute(
      'href',
      '/founderhub/products/item/whey-protein-1kg',
    )
    expect(within(card('Whey Protein 1kg')).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('adds at most four products a request, counting up as it goes', async () => {
    const codes = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']
    const secondBatch = deferred<Response>()
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': () =>
        quickPass(codes.map((c) => quick(c, { status: 'found', productId: c.slice(1), card: row({ sku: c, productId: c.slice(1), name: `Product ${c}` }) }))),
      'POST /api/portal/supplier': [
        () => json({ ok: true, outcomes: codes.slice(0, 4).map((c) => ({ status: 'added', id: `p-${c}`, title: `Product ${c}` })), notFound: [] }),
        () => secondBatch.promise,
      ],
    })

    render(<AddProducts />)
    const user = userEvent.setup()
    await lookUp(user, codes.join(' '))
    await screen.findByText('Product P6')

    await user.click(screen.getByRole('button', { name: 'Add 6 as separate products' }))
    expect(await screen.findByText('4 of 6 added…')).toBeInTheDocument()

    const adds = calls.filter((c) => c.url === '/api/portal/supplier')
    expect(adds.map((c) => c.body?.productIds)).toEqual([['1', '2', '3', '4'], ['5', '6']])

    await act(async () =>
      secondBatch.resolve(json({ ok: true, outcomes: codes.slice(4).map((c) => ({ status: 'added', id: `p-${c}`, title: `Product ${c}` })), notFound: [] })),
    )
    expect(await screen.findByText(/6 products added, waiting for review/)).toBeInTheDocument()
  })

  it('pauses the whole batch when PowerBody rate-limits us — 45 seconds, then twice as long — and carries on', async () => {
    jest.useFakeTimers()
    const limited = result('P1', {
      status: 'refused',
      refusal: 'rate-limited',
      message: 'PowerBody asked us to slow down (HTTP 429).',
      next: ['wait', 'search-again'],
    })
    let p1 = 0
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': (body) => {
        if (body?.codes) return quickPass([quick('P1'), quick('P2')])
        if (body?.code === 'P1') {
          p1 += 1
          return ndjson([[p1 < 3 ? limited : result('P1', { card: row({ sku: 'P1', productId: '1', name: 'First Product' }) })]])
        }
        return ndjson([[result('P2', { card: row({ sku: 'P2', productId: '2', name: 'Second Product' }) })]])
      },
    })

    render(<AddProducts />)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await lookUp(user, 'P1 P2')

    expect(await screen.findByText(/the lookup is paused\. Carrying on in 4\ds\./)).toBeInTheDocument()
    expect(screen.getByText('PowerBody asked us to slow down (HTTP 429).')).toBeInTheDocument()
    // The WHOLE batch waits: P2 is not asked while PowerBody is refusing.
    expect(searchesIn(calls)).toEqual(['P1'])

    await act(async () => {
      jest.advanceTimersByTime(45_000)
    })
    // Refused again: the second pause is twice as long.
    expect(await screen.findByText(/Carrying on in (9\d|8\d)s \(pause 2 — each one twice as long\)/)).toBeInTheDocument()
    expect(searchesIn(calls)).toEqual(['P1', 'P1'])

    await act(async () => {
      jest.advanceTimersByTime(90_000)
    })
    expect(await screen.findByText('First Product')).toBeInTheDocument()
    expect(await screen.findByText('Second Product')).toBeInTheDocument()
    // Carried on from the code that was refused, then the rest — nothing lost.
    expect(searchesIn(calls)).toEqual(['P1', 'P1', 'P1', 'P2'])
    expect(screen.queryByText(/the lookup is paused/)).not.toBeInTheDocument()
  })

  it('looking codes up again mid-search replaces their cards without losing the codes still waiting', async () => {
    const firstP1 = deferred<unknown[]>()
    let p1 = 0
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': (body) => {
        if (body?.codes) return quickPass((body.codes as string[]).map((c) => quick(c)))
        const code = String(body?.code)
        if (code === 'P1' && (p1 += 1) === 1) return ndjson([firstP1.promise])
        return ndjson([[result(code, { card: row({ sku: code, productId: code.slice(1), name: `Product ${code}` }) })]])
      },
    })
    render(<AddProducts />)
    const user = userEvent.setup()
    await lookUp(user, 'P1 P2')
    await waitFor(() => expect(searchesIn(calls)).toEqual(['P1']))

    // P1 again while its first search is still running.
    await user.clear(screen.getByRole('textbox', { name: 'SKUs or product ids' }))
    await lookUp(user, 'P1')
    await waitFor(() => expect(calls.filter((c) => c.body?.codes)).toHaveLength(2))
    await act(async () => firstP1.resolve([result('P1', { card: row({ sku: 'P1', name: 'Stale answer' }) })]))

    // P2 was not dropped in the shuffle, and P1 got its fresh search.
    expect(await screen.findByText('Product P2')).toBeInTheDocument()
    expect(await screen.findByText('Product P1')).toBeInTheDocument()
    expect(searchesIn(calls)).toEqual(['P1', 'P2', 'P1'])
    expect(screen.queryByText('Stale answer')).not.toBeInTheDocument()
  })

  it('stops the rest of the batch at a DEMO-account refusal, says why, and keeps them for later', async () => {
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': (body) => {
        if (body?.codes) return quickPass([quick('P1'), quick('P2'), quick('P3')])
        if (body?.code === 'P1') {
          return ndjson([
            [
              result('P1', {
                status: 'refused',
                refusal: 'sandbox',
                message: 'PowerBody answered “DEMO account: method not available”.',
                next: ['run-checks', 'ask-powerbody'],
              }),
            ],
          ])
        }
        return ndjson([[result(String(body?.code), { card: row({ sku: String(body?.code), name: `Product ${body?.code}` }) })]])
      },
    })

    render(<AddProducts />)
    const user = userEvent.setup()
    await lookUp(user, 'P1 P2 P3')

    expect(await screen.findByText(/Stopped: this PowerBody API account is still their DEMO sandbox/)).toBeInTheDocument()
    // One refusal, not three: the others were never sent.
    expect(searchesIn(calls)).toEqual(['P1'])
    expect(screen.getAllByText('Not looked up')).toHaveLength(2)
    // Whose problem it is, and where to see it.
    expect(within(card('P1')).getByText(/Only PowerBody can switch it to live/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Run the checks' })[0]).toHaveAttribute('href', '/founderhub/settings/supplier')
    // The status strip learnt it too.
    expect(screen.getByText('PowerBody DEMO')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try the rest again (2)' }))
    expect(await screen.findByText('Product P3')).toBeInTheDocument()
    expect(searchesIn(calls)).toEqual(['P1', 'P2', 'P3'])
  })

  it('looks a code up by a pasted product id, checked against the SKU it was pasted on', async () => {
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': [
        () => quickPass([quick('P300')]),
        () => ndjson([[result('P300', { status: 'not-yet', message: 'Not found yet.', next: ['search-again', 'paste-id'] })]]),
        // The wrong id first: it belongs to another product.
        () =>
          ndjson([
            [
              result('12345', {
                kind: 'id',
                status: 'wrong-product',
                message: 'Product id 12345 is Mass Gainer (SKU P999), not P300.',
                next: ['paste-id'],
              }),
            ],
          ]),
        () => ndjson([[result('44338', { kind: 'id', productId: '44338', card: row({ sku: 'P300', productId: '44338', name: 'Casein 900g' }) })]]),
      ],
    })

    render(<AddProducts />)
    const user = userEvent.setup()
    await lookUp(user, 'P300')

    const field = await screen.findByRole('textbox', { name: 'PowerBody product id for P300' })
    await user.type(field, '12345')
    await user.click(screen.getByRole('button', { name: 'Look up this id' }))
    expect(await screen.findByText('Product id 12345 is Mass Gainer (SKU P999), not P300.')).toBeInTheDocument()
    expect(calls.filter((c) => c.body?.stream).at(-1)?.body).toEqual({ code: '12345', stream: true, expectSku: 'P300' })

    // The paste field is offered again.
    await user.type(screen.getByRole('textbox', { name: 'PowerBody product id for P300' }), '44338')
    await user.click(screen.getByRole('button', { name: 'Look up this id' }))
    expect(await screen.findByText('Casein 900g')).toBeInTheDocument()
    expect(screen.getByText(/PowerBody id 44338/)).toBeInTheDocument()
    expect(calls.filter((c) => c.body?.stream).at(-1)?.body).toEqual({ code: '44338', stream: true, expectSku: 'P300' })
  })

  it('offers the SKU reading of an all-digit code that is both', async () => {
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': (body) => {
        if (body?.codes) return quickPass([quick('44338', { kind: 'id' })])
        if (body?.code === '44338') {
          return ndjson([[result('44338', { kind: 'id', card: row({ sku: 'P777', productId: '44338', name: 'Id Product' }), alsoMeant: { code: 'P44338', productId: '5150' } })]])
        }
        return ndjson([[result('P44338', { card: row({ sku: 'P44338', productId: '5150', name: 'Sku Product' }) })]])
      },
    })
    render(<AddProducts />)
    const user = userEvent.setup()
    await lookUp(user, '44338')

    await user.click(await screen.findByRole('button', { name: 'Did you mean SKU P44338?' }))
    expect(await screen.findByText('Sku Product')).toBeInTheDocument()
    expect(searchesIn(calls)).toEqual(['44338', 'P44338'])
  })

  it('offers Restore for a code a removed product sold', async () => {
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': () =>
        quickPass([quick('P500', { stored: { id: 'old-whey', title: 'Old Whey', state: 'removed', skus: ['P500'] } })]),
      'POST /api/portal/products': () => json({ state: 'pending' }),
    })
    render(<AddProducts />)
    const user = userEvent.setup()
    await lookUp(user, 'P500')

    // Held: we sell (sold) it, so PowerBody is not searched for it.
    expect(await screen.findByText(/Restore it rather than adding it again/)).toBeInTheDocument()
    expect(searchesIn(calls)).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    expect(await screen.findByText('Restored — it is back, waiting for review.')).toBeInTheDocument()
    expect(calls.find((c) => c.url === '/api/portal/products')?.body).toEqual({ id: 'old-whey', action: 'restore' })
  })

  it('shows the server’s reason when flavours of different sizes cannot be one product, and offers them separately', async () => {
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': () =>
        quickPass([
          quick('P100', { status: 'found', card: WHEY }),
          quick('P200', { status: 'found', card: CREATINE }),
        ]),
      'POST /api/portal/supplier': [
        () => json({ error: 'These are different sizes (1kg, 300g). Each size is its own product.' }, 400),
        () =>
          json({
            ok: true,
            outcomes: [
              { status: 'added', id: 'whey-protein-1kg', title: 'Whey Protein 1kg' },
              { status: 'added', id: 'creatine-300g', title: 'Creatine 300g' },
            ],
            notFound: [],
          }),
      ],
    })
    render(<AddProducts />)
    const user = userEvent.setup()
    await lookUp(user, 'P100 P200')

    await user.click(await screen.findByRole('button', { name: 'Add as one product with 2 flavours' }))
    expect(await screen.findByText(/Not added: These are different sizes \(1kg, 300g\)/)).toBeInTheDocument()
    expect(calls.find((c) => c.url === '/api/portal/supplier')?.body).toEqual({ productIds: ['100', '200'], skus: [], combine: true })

    await user.click(screen.getByRole('button', { name: 'Add the 2 as separate products instead' }))
    expect(await screen.findByText(/2 products added, waiting for review/)).toBeInTheDocument()
    expect(calls.filter((c) => c.url === '/api/portal/supplier').at(-1)?.body).toEqual({ productIds: ['100', '200'], skus: [] })
  })

  it('adds flavours to a product already in the shop, picked from the list', async () => {
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': () =>
        quickPass([
          quick('P100', { status: 'found', card: WHEY }),
          quick('P200', { status: 'found', card: CREATINE }),
        ]),
      'GET /api/portal/products': () =>
        json({
          products: [
            { product: { id: 'whey-isolate', title: 'Whey Isolate', brand: 'Optimum', category: 'Protein', variants: [{ id: 'a', title: 'Chocolate', sku: 'P9' }] }, state: 'live' },
            { product: { id: 'bcaa', title: 'BCAA Fresh', brand: 'Scitec', category: 'Recovery', variants: [] }, state: 'pending' },
            { product: { id: 'gone', title: 'Gone Whey', brand: 'X', category: 'Protein', variants: [] }, state: 'removed' },
          ],
        }),
      'POST /api/portal/supplier': () => json({ ok: true, added: 0, into: 'whey-isolate', flavoursAdded: 2, ids: ['whey-isolate'], outcomes: [], notFound: [] }),
    })
    render(<AddProducts />)
    const user = userEvent.setup()
    await lookUp(user, 'P100 P200')

    await user.click(await screen.findByRole('button', { name: 'Add as flavours of an existing product' }))
    expect(calls.find((c) => c.url.startsWith('/api/portal/products'))?.url).toBe('/api/portal/products?all=1')
    await user.type(await screen.findByRole('textbox', { name: 'Which product do these join?' }), 'whey')
    // Removed products are not offered: flavours added to a hidden product would vanish with it.
    expect(screen.queryByRole('radio', { name: /Gone Whey/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Whey Isolate/ }))
    // Said before the press: a flavour joining a product on sale is on sale at once.
    expect(screen.getByText(/Whey Isolate is on sale, so these flavours go on sale as soon as they are added/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add 2 flavours to Whey Isolate' }))
    expect(calls.find((c) => c.url === '/api/portal/supplier')?.body).toEqual({ productIds: ['100', '200'], skus: [], into: 'whey-isolate' })
    expect(await screen.findByText(/2 flavours added to Whey Isolate, which is on sale/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Whey Isolate' })).toHaveAttribute('href', '/founderhub/products/item/whey-isolate#variants')
  })

  it('says when a product already sells some of them, and offers to add the new flavours to it', async () => {
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': () =>
        quickPass([
          quick('P100', { status: 'found', card: WHEY }),
          quick('P200', { status: 'found', card: row({ sku: 'P200', productId: '200', name: 'Whey Protein 1kg Vanilla' }) }),
        ]),
      'POST /api/portal/supplier': [
        () =>
          json({
            ok: true,
            added: 0,
            outcomes: [{ status: 'already', id: 'whey-isolate', title: 'Whey Isolate', state: 'pending', skus: ['P100'], newSkus: ['P200'] }],
            notFound: [],
          }),
        () => json({ ok: true, added: 0, into: 'whey-isolate', flavoursAdded: 1, outcomes: [], notFound: [] }),
      ],
    })
    render(<AddProducts />)
    const user = userEvent.setup()
    await lookUp(user, 'P100 P200')

    await user.click(await screen.findByRole('button', { name: 'Add as one product with 2 flavours' }))
    expect(await screen.findByText(/1 new flavour \(P200\) is not on it yet\./)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add it to Whey Isolate' }))
    expect(calls.filter((c) => c.url === '/api/portal/supplier').at(-1)?.body).toEqual({ productIds: ['200'], skus: [], into: 'whey-isolate' })
    expect(await screen.findByText(/1 flavour added to Whey Isolate\. They go on sale when it is approved\./)).toBeInTheDocument()
  })

  it('says the session expired, with a way to sign in, rather than searching code by code', async () => {
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': () => json({ error: 'Unauthorized' }, 401),
    })
    render(<AddProducts />)
    const user = userEvent.setup()
    await lookUp(user, 'P1 P2')

    expect(await screen.findByText(/Your session has expired/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/founderhub/products/add')
    expect(searchesIn(calls)).toEqual([])
  })

  it('falls back to searching each code when the quick pass fails, and says so', async () => {
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': (body) =>
        body?.codes
          ? json({ error: 'The database is not answering.' }, 502)
          : ndjson([[result('P1', { card: row({ sku: 'P1', name: 'Found Anyway' }) })]]),
    })
    render(<AddProducts />)
    const user = userEvent.setup()
    await lookUp(user, 'P1')

    expect(await screen.findByText(/The quick check did not answer \(The database is not answering\), so each code is being searched/)).toBeInTheDocument()
    expect(await screen.findByText('Found Anyway')).toBeInTheDocument()
    expect(searchesIn(calls)).toEqual(['P1'])
  })

  it('treats a search that ends without an answer as not found yet, after asking once more', async () => {
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': (body) =>
        body?.codes ? quickPass([quick('P1')]) : ndjson([[{ type: 'step', phase: 'bisect', message: 'Searching…', probes: 1 }]]),
    })
    render(<AddProducts />)
    const user = userEvent.setup()
    await lookUp(user, 'P1')

    expect(await screen.findByText(/ended twice without an answer/)).toBeInTheDocument()
    expect(searchesIn(calls)).toEqual(['P1', 'P1'])
    expect(screen.getByRole('button', { name: 'Search again' })).toBeInTheDocument()
  })
})

describe('Add products — the status strip', () => {
  it('says which supplier answers and how complete the index is', async () => {
    router({ ...STANDING })
    render(<AddProducts />)
    expect(await screen.findByText('Live PowerBody')).toBeInTheDocument()
    expect(await screen.findByText(/5,200 PowerBody products indexed, read in full on 8 Oct/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh the index' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Run the checks' })).toHaveAttribute('href', '/founderhub/settings/supplier')
    // The nightly check moved to Fix-ups; this is where founders looked for it.
    expect(screen.getByRole('link', { name: 'Fix-ups → Supplier check' })).toHaveAttribute('href', '/founderhub/products/fix-ups#supplier-check')
  })

  it('opens the index section when there is no index yet', async () => {
    router({
      ...STANDING,
      'GET /api/portal/supplier/index': () => json({ products: 0, pagesRead: 0, complete: false, updatedAt: null }),
    })
    render(<AddProducts />)
    expect(await screen.findByText(/Not built — so every code is searched for/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true'))
    expect(screen.getByText('Not built')).toBeInTheDocument()
  })

  it('shows sample codes from the start on the sample catalogue, and puts a tapped one in the box', async () => {
    router({
      ...STANDING,
      'GET /api/portal/supplier-source': () => json({ mode: 'mock', effective: 'mock', hasCredentials: false }),
      'GET /api/portal/supplier/skus': () => json({ source: 'mock', skus: ['P64', 'P2589'], count: 2 }),
    })
    render(<AddProducts />)
    const user = userEvent.setup()

    expect(await screen.findByText('Sample')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'P2589' }))
    expect(screen.getByRole('textbox', { name: 'SKUs or product ids' })).toHaveValue('P2589')
    await user.click(screen.getByRole('button', { name: 'Put all 2 in the box' }))
    expect(screen.getByRole('textbox', { name: 'SKUs or product ids' })).toHaveValue('P64, P2589')
  })

  it('offers sample codes on a live account only when asked', async () => {
    const { calls } = router({
      ...STANDING,
      'GET /api/portal/supplier/skus': () => json({ source: 'powerbody', skus: ['P64'], count: 1 }),
    })
    render(<AddProducts />)
    const user = userEvent.setup()
    await screen.findByText('Live PowerBody')
    expect(calls.some((c) => c.url.startsWith('/api/portal/supplier/skus'))).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Show me some SKUs' }))
    expect(await screen.findByRole('button', { name: 'P64' })).toBeInTheDocument()
    expect(calls.find((c) => c.url.startsWith('/api/portal/supplier/skus'))?.url).toBe('/api/portal/supplier/skus?limit=40')
  })
})

describe('Add products — from PowerBody’s spreadsheet', () => {
  const CSV = [
    'sku;manufacturer_name;name;qty;flavour;weight;img_url;retail_price;',
    'P1;Applied;Creatine HCl, Fruit Punch - 75g;50+; ;0.1;https://x/1.jpg;10;',
    'P2;Applied;Creatine HCl, Blue Raz - 75g;12; ;0.1;https://x/2.jpg;10;',
  ].join('\n')

  it('looks the ticked flavours up together and leads with one product with flavours', async () => {
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/supplier/resolve': () =>
        quickPass([
          quick('P1', { status: 'found', card: row({ sku: 'P1', productId: '1', name: 'Creatine HCl, Fruit Punch - 75g' }) }),
          quick('P2', { status: 'found', card: row({ sku: 'P2', productId: '2', name: 'Creatine HCl, Blue Raz - 75g' }) }),
        ]),
      'POST /api/portal/supplier': () =>
        json({ ok: true, added: 1, combined: true, outcomes: [{ status: 'added', id: 'creatine-hcl-75g', title: 'Creatine HCl - 75g' }], notFound: [] }),
    })
    render(<AddProducts />)
    const user = userEvent.setup()

    const pick = screen.getByRole('button', { name: 'Choose PowerBody’s spreadsheet' })
    await user.upload(pick.previousElementSibling as HTMLInputElement, new File([CSV], 'powerbody.csv', { type: 'text/csv' }))
    await user.click(await screen.findByRole('button', { name: 'Tick all 2' }))
    await user.click(screen.getByRole('button', { name: 'Look up 2 ticked' }))

    expect(await screen.findByRole('heading', { name: 'Creatine HCl - 75g' })).toBeInTheDocument()
    const group = screen.getByRole('region', { name: 'Creatine HCl - 75g' })
    await within(group).findByText('Creatine HCl, Blue Raz - 75g')
    // The flavours of one tub: "one product with flavours" comes first.
    const buttons = within(group).getAllByRole('button').map((b) => b.textContent)
    expect(buttons.indexOf('Add as one product with 2 flavours')).toBeLessThan(buttons.indexOf('Add 2 as separate products'))

    await user.click(within(group).getByRole('button', { name: 'Add as one product with 2 flavours' }))
    expect(calls.find((c) => c.url === '/api/portal/supplier')?.body).toEqual({
      productIds: ['1', '2'],
      skus: [],
      combine: true,
      title: 'Creatine HCl - 75g',
    })
    expect(await screen.findByText(/Creatine HCl - 75g added with 2 flavours, waiting for review/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Creatine HCl - 75g' })).toHaveAttribute('href', '/founderhub/products/item/creatine-hcl-75g')
  })
})

describe('Add products — from a roster spreadsheet', () => {
  /** The roster import answering with SKUs it could not find an id for. */
  const importWithoutIds = (withoutIds: string[]) => () =>
    json({
      ok: true,
      total: 1,
      offset: 0,
      imported: 1,
      refreshed: 0,
      already: 0,
      enriched: 0,
      nextOffset: null,
      withoutIds,
      results: [{ sku: 'P7', id: 'creatine', title: 'Creatine', enriched: false, notes: [], outcome: 'added' }],
      warnings: [],
    })
  const ON_CREATINE = (sku: string) => ({ id: 'creatine', title: 'Creatine', state: 'pending' as const, skus: [sku] })

  async function findTheirIds(user: ReturnType<typeof userEvent.setup>) {
    const pick = screen.getByRole('button', { name: 'Choose a roster spreadsheet' })
    await user.upload(pick.previousElementSibling as HTMLInputElement, new File(['sku,title\nP7,Creatine\n'], 'roster.csv', { type: 'text/csv' }))
    await user.click(await screen.findByRole('button', { name: 'Find their ids' }))
  }

  it('searches PowerBody for SKUs the roster put on a product, rather than calling them already in the catalogue', async () => {
    // The real shape of the problem: the import reported P7 and P8 BECAUSE the
    // index has no id for them, so the quick pass cannot answer them either —
    // and it knows they are on the product the roster just made.
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/products/import-csv': importWithoutIds(['P7', 'P8']),
      'POST /api/portal/supplier/resolve': (body) => {
        if (body?.codes) return quickPass([quick('P7', { stored: ON_CREATINE('P7') }), quick('P8', { stored: ON_CREATINE('P8') })])
        if (body?.code === 'P7') {
          return ndjson([
            [result('P7', { productId: '7', via: 'search', card: row({ sku: 'P7', productId: '7', name: 'Creatine 500g' }), stored: ON_CREATINE('P7') })],
          ])
        }
        return ndjson([
          [
            result('P8', {
              status: 'not-yet',
              message: 'Searched 40 of PowerBody’s ids without finding P8 yet.',
              next: ['search-again', 'paste-id'],
              stored: ON_CREATINE('P8'),
            }),
          ],
        ])
      },
    })
    render(<AddProducts />)
    const user = userEvent.setup()
    await findTheirIds(user)

    // Each one is searched for, in turn.
    await waitFor(() => expect(searchesIn(calls)).toEqual(['P7', 'P8']))
    expect(screen.queryByText(/so PowerBody were not searched for it/)).not.toBeInTheDocument()

    // Found: says the id is kept and where to use it — and it is still a link
    // to the product it is on, not something to add a second time.
    const found = card('Creatine 500g')
    expect(await within(found).findByText(/PowerBody id 7 found and kept\. Its “Pull from PowerBody” now brings in the picture, cost and stock without a search\./)).toBeInTheDocument()
    expect(within(found).getByRole('link', { name: 'Open Creatine' })).toHaveAttribute('href', '/founderhub/products/item/creatine#supplier')
    expect(within(found).getByRole('link', { name: 'Creatine →' })).toBeInTheDocument()
    expect(within(found).queryByRole('checkbox')).not.toBeInTheDocument()

    // Not found yet: the usual ways on, and still says which product it is on.
    const p8 = await waitFor(() => {
      const el = card('P8')
      expect(within(el).getByText('Not found yet')).toBeInTheDocument()
      return el
    })
    expect(within(p8).getByRole('button', { name: 'Search again' })).toBeInTheDocument()
    expect(within(p8).getByRole('textbox', { name: 'PowerBody product id for P8' })).toBeInTheDocument()
    expect(within(p8).getByRole('link', { name: 'Creatine →' })).toBeInTheDocument()
  })

  it('looks up the SKUs a roster brought in without a PowerBody id', async () => {
    const { calls } = router({
      ...STANDING,
      'POST /api/portal/products/import-csv': () =>
        json({
          ok: true,
          total: 1,
          offset: 0,
          imported: 1,
          refreshed: 0,
          already: 0,
          enriched: 0,
          nextOffset: null,
          withoutIds: ['P7', 'p8'],
          results: [{ sku: 'P7', id: 'creatine', title: 'Creatine', enriched: false, notes: [], outcome: 'added' }],
          warnings: [],
        }),
      'POST /api/portal/supplier/resolve': (body) =>
        body?.codes
          ? quickPass([
              quick('P7', { status: 'found', card: row({ sku: 'P7', productId: '7', name: 'Creatine 500g' }), stored: { id: 'creatine', title: 'Creatine', state: 'pending', skus: ['P7'] } }),
              quick('P8', { status: 'found', card: row({ sku: 'P8', productId: '8', name: 'Creatine 500g Lemon' }), stored: { id: 'creatine', title: 'Creatine', state: 'pending', skus: ['P8'] } }),
            ])
          : ndjson([]),
    })
    render(<AddProducts />)
    const user = userEvent.setup()

    const pick = screen.getByRole('button', { name: 'Choose a roster spreadsheet' })
    await user.upload(pick.previousElementSibling as HTMLInputElement, new File(['sku,title\nP7,Creatine\n'], 'roster.csv', { type: 'text/csv' }))
    await user.click(await screen.findByRole('button', { name: 'Find their ids' }))

    expect(await screen.findByRole('heading', { name: 'Roster SKUs without a PowerBody id' })).toBeInTheDocument()
    expect(calls.find((c) => c.body?.codes)?.body).toEqual({ codes: ['P7', 'P8'] })
    // Both are already on the product the roster made, so each is a link to it — nothing to add twice.
    expect(await screen.findAllByRole('link', { name: 'Creatine →' })).toHaveLength(2)
    expect(screen.queryByRole('checkbox', { name: /Add Creatine/ })).not.toBeInTheDocument()
  })
})

