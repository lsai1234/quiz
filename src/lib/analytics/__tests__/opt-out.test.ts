import { OPT_OUT_KEY, analyticsOptedOutHere, privacyOptedOut, setAnalyticsOptOut, track } from '../events'

/**
 * The off switch on the storage notice has to actually switch things off.
 * A notice offering a choice that does not take effect is worse than no notice.
 */

const nav = navigator as Navigator & { globalPrivacyControl?: boolean }

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  delete nav.globalPrivacyControl
})

describe('the local opt-out', () => {
  it('is off until someone chooses it', () => {
    expect(analyticsOptedOutHere()).toBe(false)
    expect(privacyOptedOut()).toBe(false)
  })

  it('is remembered once chosen', () => {
    setAnalyticsOptOut(true)
    expect(window.localStorage.getItem(OPT_OUT_KEY)).toBe('1')
    expect(privacyOptedOut()).toBe(true)
  })

  it('can be turned back on', () => {
    setAnalyticsOptOut(true)
    setAnalyticsOptOut(false)
    expect(privacyOptedOut()).toBe(false)
  })

  it('drops the session id already minted rather than waiting for the tab to close', () => {
    window.sessionStorage.setItem('chrgd_analytics_sid', 'existing-id')
    setAnalyticsOptOut(true)
    expect(window.sessionStorage.getItem('chrgd_analytics_sid')).toBeNull()
  })

  it('stops events being sent', () => {
    const beacon = jest.fn().mockReturnValue(true)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })

    track('quiz_start')
    expect(beacon).toHaveBeenCalled()

    beacon.mockClear()
    setAnalyticsOptOut(true)
    track('quiz_start')
    expect(beacon).not.toHaveBeenCalled()
  })
})

describe('browser signals still win', () => {
  it('honours Global Privacy Control without being asked', () => {
    nav.globalPrivacyControl = true
    expect(privacyOptedOut()).toBe(true)
    // …and that is a standing instruction, not something the local flag undoes.
    setAnalyticsOptOut(false)
    expect(privacyOptedOut()).toBe(true)
  })
})
