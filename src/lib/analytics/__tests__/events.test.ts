import { track, SHOP_EVENTS, QUIZ_EVENTS } from '../events'

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
        'basket_open', 'checkout_start', 'checkout_success', 'checkout_error',
      ]),
    )
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
