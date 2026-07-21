import { track, SHOP_EVENTS } from '../events'

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
