import { track, SHOP_EVENTS, QUIZ_EVENTS, SHARE_EVENTS, CONSULT_EVENTS, SITE_EVENTS, ALL_EVENTS } from '../events'

function setNav(props: Record<string, unknown>) {
  for (const [k, v] of Object.entries(props)) {
    Object.defineProperty(navigator, k, { value: v, configurable: true })
  }
}

describe('track', () => {
  const beacon = jest.fn((_url: string, _data?: BodyInit | null) => true)

  beforeEach(() => {
    beacon.mockClear()
    beacon.mockImplementation(() => true)
    setNav({ sendBeacon: beacon, doNotTrack: '0', globalPrivacyControl: false, msDoNotTrack: '0' })
  })

  it('beacons the event to /api/analytics', () => {
    track('add_to_basket', { id: 'chrgd-whey-protein' })
    expect(beacon).toHaveBeenCalledTimes(1)
    const [url, payload] = beacon.mock.calls[0]
    expect(url).toBe('/api/analytics')
    expect(payload).toBeInstanceOf(Blob)
  })

  it('respects Do Not Track', () => {
    setNav({ doNotTrack: '1' })
    track('shop_view')
    expect(beacon).not.toHaveBeenCalled()
  })

  it('respects Global Privacy Control', () => {
    setNav({ globalPrivacyControl: true })
    track('shop_view')
    expect(beacon).not.toHaveBeenCalled()
  })

  it('never throws even if the transport fails', () => {
    beacon.mockImplementation(() => { throw new Error('boom') })
    expect(() => track('checkout_start', { value: 42 })).not.toThrow()
  })

  it('accepts quiz events (broadened event type)', () => {
    track('quiz_step_view', { stepId: 'goals' })
    expect(beacon).toHaveBeenCalledTimes(1)
  })

  it('reuses one persisted session id across events (funnel grouping)', () => {
    // Use the fetch fallback (string body) so we can read the session id out.
    const fetchMock = jest.fn((_url: string, _init?: RequestInit) => Promise.resolve({} as Response))
    setNav({ sendBeacon: undefined })
    const origFetch = global.fetch
    global.fetch = fetchMock as unknown as typeof fetch
    try {
      track('quiz_start', {})
      track('checkout_success', {})
    } finally {
      global.fetch = origFetch
    }
    const sessions = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse((init as RequestInit).body as string).session,
    )
    expect(sessions[0]).toBeTruthy()
    expect(new Set(sessions).size).toBe(1)
  })
})

describe('SHOP_EVENTS', () => {
  it('covers the full funnel', () => {
    expect(SHOP_EVENTS).toEqual(
      expect.arrayContaining([
        'shop_view', 'shop_filter_toggle', 'product_open', 'add_to_basket',
        'basket_open', 'checkout_start', 'checkout_error',
        'purchase', 'confirmation_cta',
      ]),
    )
  })

  it('no longer fires checkout_success anywhere', async () => {
    // It fired when the Checkout Session was created — before payment, and on
    // everyone who then abandoned at Stripe. `purchase` replaces it and fires
    // once, after the server has verified the session.
    const { readFileSync, readdirSync, statSync } = await import('fs')
    const { join } = await import('path')

    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          if (entry !== '__tests__') walk(full)
        } else if (/\.tsx?$/.test(entry)) {
          if (readFileSync(full, 'utf8').includes("track('checkout_success'")) offenders.push(full)
        }
      }
    }
    walk(join(process.cwd(), 'src'))
    expect(offenders).toEqual([])
  })
})

describe('the visit context', () => {
  it('rides on every beacon, captured from the page the visit began on', () => {
    const fetchMock = jest.fn((_url: string, _init?: RequestInit) => Promise.resolve({} as Response))
    setNav({ sendBeacon: undefined })
    const origFetch = global.fetch
    global.fetch = fetchMock as unknown as typeof fetch
    window.sessionStorage.clear()
    window.history.replaceState(null, '', '/?utm_source=instagram&utm_campaign=launch')
    try {
      // A fresh page-load: the module's memory starts empty, as it does in a new tab.
      jest.isolateModules(() => {
        const fresh = jest.requireActual<typeof import('../events')>('../events')
        fresh.track('page_view')
        // A later page: the tags are gone from the URL, the context is not.
        window.history.replaceState(null, '', '/shop')
        fresh.track('shop_view')
      })
    } finally {
      global.fetch = origFetch
      window.history.replaceState(null, '', '/')
    }
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)))
    expect(bodies[0].ctx).toMatchObject({ land: '/', utm_source: 'instagram', utm_campaign: 'launch' })
    expect(bodies[1].ctx).toEqual(bodies[0].ctx)
    expect(bodies[1].path).toBe('/shop')
  })
})

describe('ALL_EVENTS', () => {
  it('is every family the client can emit, so the server cannot drop one', () => {
    for (const e of [...SHOP_EVENTS, ...QUIZ_EVENTS, ...SHARE_EVENTS, ...CONSULT_EVENTS, ...SITE_EVENTS]) {
      expect(ALL_EVENTS).toContain(e)
    }
  })
})

describe('QUIZ_EVENTS', () => {
  it('covers the quiz funnel (start → per-step → complete/abandon → reveal → checkout)', () => {
    expect(QUIZ_EVENTS).toEqual(
      expect.arrayContaining([
        'quiz_start', 'quiz_step_view', 'quiz_step_complete', 'quiz_step_back',
        'quiz_subquestion_view', 'quiz_subquestion_answer',
        'quiz_deepdive_offer', 'quiz_deepdive_accept',
        'quiz_complete', 'quiz_abandon',
        'stack_reveal_view', 'stack_swap', 'stack_add', 'stack_remove',
      ]),
    )
  })
})
