/**
 * Subscription checkout, from the browser's side — specifically what happens
 * when the server refuses the checkout.
 *
 * The bug these pin: consent was only ever collected inside the account gate,
 * and the account gate only opens on a 401. A member who was ALREADY signed in
 * sailed past it, sent a checkout with no consent, and got back a red banner
 * asking them to confirm terms nothing had shown them — with no box to tick and
 * no way forward. A refusal the member can clear has to open a gate, not report
 * an error.
 *
 * The stack builders are mocked out: what's under test is how the hook reads a
 * response, not how a blueprint is priced (that has its own tests).
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { useStackCheckout } from '../useStackCheckout'
import { TERMS_VERSION, DISCLAIMER_VERSION } from '@/lib/legal/content'
import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'

jest.mock('@/lib/stack-blueprint/checkout', () => ({
  validateCheckout: jest.fn(() => ({ ok: true, lines: [] })),
  validationErrorMessage: (e: unknown) => String(e),
  buildSubscriptionCheckout: jest.fn(() => ({ ok: true, checkout: { monthlyTotal: 42 } })),
}))
jest.mock('@/lib/recharge/mock', () => ({
  buildMemberSubscription: jest.fn(() => ({ id: 'sub-1', flatMonthly: 42, lines: [] })),
}))

const blueprint = { slots: [] } as unknown as StackBlueprint
const catalogue: CatalogueProduct[] = []

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

function fetchMock(...responses: Response[]) {
  const fn = jest.fn()
  responses.forEach((res) => fn.mockResolvedValueOnce(res))
  global.fetch = fn as unknown as typeof fetch
  return fn
}

/** Tap "Start subscription" as a page does. */
async function startSubscription(result: { current: ReturnType<typeof useStackCheckout> }) {
  await act(async () => {
    await result.current.checkout(blueprint, catalogue, 'subscription')
  })
}

const consentVersions = { terms: TERMS_VERSION, disclaimer: DISCLAIMER_VERSION }

const needsConsent = (state: ReturnType<typeof useStackCheckout>['state']) =>
  state as Extract<ReturnType<typeof useStackCheckout>['state'], { status: 'needs-consent' }>

describe('a checkout refused for want of consent', () => {
  it('opens the consent gate instead of showing an error', async () => {
    fetchMock(
      json(400, {
        error: 'Please confirm you’ve read and agree to the subscription terms and health information.',
        code: 'not-accepted',
        versions: consentVersions,
      }),
    )
    const { result } = renderHook(() => useStackCheckout())
    await startSubscription(result)

    await waitFor(() => expect(result.current.state.status).toBe('needs-consent'))
    const state = needsConsent(result.current.state)
    // The versions the SERVER is serving, so a stale tab submits the right ones.
    expect(state.versions).toEqual(consentVersions)
    // Nothing to explain when they simply haven't been asked yet.
    expect(state.notice).toBeNull()
  })

  it('carries the tick back to the server and lets the checkout through', async () => {
    const fetchFn = fetchMock(
      json(400, { error: 'nope', code: 'not-accepted', versions: consentVersions }),
      json(200, { ok: true, checkoutUrl: '#mock-subscription', mock: true }),
    )
    const { result } = renderHook(() => useStackCheckout())
    await startSubscription(result)
    await waitFor(() => expect(result.current.state.status).toBe('needs-consent'))

    await act(async () => {
      result.current.resume({
        accepted: true,
        termsVersion: TERMS_VERSION,
        disclaimerVersion: DISCLAIMER_VERSION,
      })
    })

    await waitFor(() => expect(result.current.state.status).toBe('mock-complete'))
    const sent = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string)
    expect(sent.consent).toEqual({
      accepted: true,
      termsVersion: TERMS_VERSION,
      disclaimerVersion: DISCLAIMER_VERSION,
    })
    // Same order, not a new one — the bundle survives the detour.
    expect(sent.subscription.id).toBe('sub-1')
  })

  it('passes on the server’s explanation when the terms changed underneath them', async () => {
    fetchMock(
      json(400, {
        error: 'Our terms were updated while you were here. Please review them and tick the box again.',
        code: 'stale-version',
        versions: { terms: '2099-01-01', disclaimer: DISCLAIMER_VERSION },
      }),
    )
    const { result } = renderHook(() => useStackCheckout())
    await startSubscription(result)

    await waitFor(() => expect(result.current.state.status).toBe('needs-consent'))
    const state = needsConsent(result.current.state)
    expect(state.notice).toMatch(/updated/i)
    // The gate re-submits against what the server serves NOW, not this build's.
    expect(state.versions).toEqual({ terms: '2099-01-01', disclaimer: DISCLAIMER_VERSION })
  })

  it('still reports refusals the member cannot fix', async () => {
    fetchMock(json(400, { error: 'Something went wrong. Please try again.' }))
    const { result } = renderHook(() => useStackCheckout())
    await startSubscription(result)

    await waitFor(() => expect(result.current.state.status).toBe('error'))
  })

  it('opens the account gate, not the consent gate, when nobody is signed in', async () => {
    fetchMock(json(401, { error: 'Not signed in' }))
    const { result } = renderHook(() => useStackCheckout())
    await startSubscription(result)

    await waitFor(() => expect(result.current.state.status).toBe('needs-account'))
  })
})
