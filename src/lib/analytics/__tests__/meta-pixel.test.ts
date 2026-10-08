/**
 * The Meta Pixel — nothing loads without consent, and nothing personal leaves.
 */
import {
  AD_CONSENT_KEY,
  captureClickId,
  forwardToPixel,
  pixelPageView,
  pixelAllowedOn,
  pixelEventFor,
  setAdConsent,
  setMetaPixelId,
} from '@/lib/analytics/meta-pixel'

beforeEach(() => {
  window.localStorage.clear()
  delete window.fbq
  delete window._fbq
  document.head.querySelectorAll('script[src*="fbevents"]').forEach((s) => s.remove())
  setMetaPixelId(null)
})

describe('the Meta Pixel', () => {
  it('maps the funnel moments ads care about to Meta’s standard events', () => {
    expect(pixelEventFor('quiz_complete', {})?.name).toBe('Lead')
    expect(pixelEventFor('add_to_basket', { id: 'p1', price: 12.5, qty: 2 })).toMatchObject({
      name: 'AddToCart',
      params: { content_ids: ['p1'], value: 25, currency: 'GBP' },
    })
    expect(pixelEventFor('checkout_start', { total: 40, source: 'quiz' })).toMatchObject({
      name: 'InitiateCheckout',
      params: { value: 40, currency: 'GBP' },
    })
    expect(pixelEventFor('purchase', { value: 39.99, currency: 'gbp', transaction_id: 't1' })).toEqual({
      kind: 'track',
      name: 'Purchase',
      params: { value: 39.99, currency: 'GBP' },
      eventID: 't1',
    })
    expect(pixelEventFor('quiz_step_complete', {})).toBeNull()
  })

  it('never forwards quiz answers', () => {
    const call = pixelEventFor('quiz_complete', { primaryGoal: 'fat-loss', budget: 'low', goalCount: 2 })
    expect(JSON.stringify(call)).not.toMatch(/fat-loss|budget|primaryGoal/)
  })

  it('never forwards the age band and sex, or page views it already counts itself', () => {
    expect(pixelEventFor('quiz_profile', { ageBracket: '25-34', gender: 'female' })).toBeNull()
    expect(pixelEventFor('page_view', {})).toBeNull()
  })

  it('loads nothing until the visitor says yes', () => {
    setMetaPixelId('1234567890123456')
    forwardToPixel('purchase', { value: 10 })
    expect(window.fbq).toBeUndefined()
    expect(document.head.querySelector('script[src*="fbevents"]')).toBeNull()

    setAdConsent('granted')
    expect(window.localStorage.getItem(AD_CONSENT_KEY)).toBe('granted')
    expect(window.fbq).toBeDefined()
    expect(document.head.querySelector('script[src*="fbevents"]')).not.toBeNull()
    const queued = window.fbq!.queue.map((a) => (a as unknown[]).slice(0, 2))
    expect(queued).toContainEqual(['set', 'autoConfig'])
    expect(queued).toContainEqual(['init', '1234567890123456'])
  })

  it('stays off when there is no Pixel connected, even with consent', () => {
    setAdConsent('granted')
    expect(window.fbq).toBeUndefined()
  })

  it('does not run on our own tools or members’ pages', () => {
    expect(pixelAllowedOn('/')).toBe(true)
    expect(pixelAllowedOn('/bundles/big-night-big-morning')).toBe(true)
    expect(pixelAllowedOn('/founderhub/settings')).toBe(false)
    expect(pixelAllowedOn('/myhub')).toBe(false)
    expect(pixelAllowedOn('/partner/login')).toBe(false)
  })
})

describe('before the visitor has answered', () => {
  it('holds events in memory and sends them on a yes', () => {
    setMetaPixelId('1234567890123456')
    pixelPageView()
    pixelPageView()
    forwardToPixel('quiz_start', {})
    forwardToPixel('quiz_complete', {})
    expect(window.fbq).toBeUndefined()

    setAdConsent('granted')
    const names = window.fbq!.queue.map((a) => (a as unknown[]).slice(0, 2).join(':'))
    // One PageView for however many pages were seen, then the held events in order.
    expect(names.filter((n) => n === 'track:PageView')).toHaveLength(1)
    expect(names.indexOf('trackCustom:StartQuiz')).toBeLessThan(names.indexOf('track:Lead'))
  })

  it('drops what it held on a no', () => {
    setMetaPixelId('1234567890123456')
    forwardToPixel('quiz_complete', {})
    setAdConsent('denied')
    expect(window.fbq).toBeUndefined()
    // Changing their mind later sends nothing from before.
    setAdConsent('granted')
    const names = window.fbq!.queue.map((a) => (a as unknown[])[1])
    expect(names).not.toContain('Lead')
  })

  it('keeps the ad click id until cookies are allowed', () => {
    window.history.replaceState(null, '', '/?fbclid=abc123')
    captureClickId()
    window.history.replaceState(null, '', '/quiz')
    setMetaPixelId('1234567890123456')
    expect(document.cookie).not.toMatch(/_fbc=/)
    setAdConsent('granted')
    expect(decodeURIComponent(document.cookie)).toMatch(/_fbc=fb\.1\.\d+\.abc123/)
  })
})

describe('before the Pixel id has arrived', () => {
  /**
   * The id comes from `/api/config`, fetched after the page mounts. A page that
   * fires an event on load — the order confirmation's Purchase, above all —
   * can get there first. Those events used to be dropped on the floor, so the
   * one conversion ads most need was the one most likely to go missing.
   */
  function freshModule(): typeof import('@/lib/analytics/meta-pixel') {
    let mod!: typeof import('@/lib/analytics/meta-pixel')
    jest.isolateModules(() => { mod = require('@/lib/analytics/meta-pixel') })
    return mod
  }

  it('holds a Purchase fired before the config lands, and sends it once it does', () => {
    window.localStorage.setItem(AD_CONSENT_KEY, 'granted')
    const pixel = freshModule()

    pixel.forwardToPixel('purchase', { value: 42, currency: 'GBP', transaction_id: 'order-1' })
    expect(window.fbq).toBeUndefined()

    pixel.setMetaPixelId('1234567890123456')
    const calls = window.fbq!.queue.map((a) => (a as unknown[]).slice(0, 2).join(':'))
    expect(calls).toContain('track:Purchase')
  })

  it('drops what it held when the config says there is no Pixel', () => {
    window.localStorage.setItem(AD_CONSENT_KEY, 'granted')
    const pixel = freshModule()
    pixel.forwardToPixel('purchase', { value: 42 })
    pixel.setMetaPixelId(null)
    expect(window.fbq).toBeUndefined()
  })
})
