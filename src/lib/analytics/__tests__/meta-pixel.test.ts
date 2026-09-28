/**
 * The Meta Pixel — nothing loads without consent, and nothing personal leaves.
 */
import {
  AD_CONSENT_KEY,
  forwardToPixel,
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
