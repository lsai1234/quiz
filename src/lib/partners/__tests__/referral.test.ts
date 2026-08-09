/**
 * The referral cookie as a server-side backstop.
 *
 * The checkout UI applies it too, but only if the code box mounted and had time
 * to run. An express "Buy now" goes straight to Stripe without one, so a
 * referral that depended on a component rendering would be lost silently —
 * exactly the failure a partner's link exists to prevent.
 */
const jar = new Map<string, string>()

jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  }),
}))

import { REFERRAL_COOKIE, resolveCheckoutCode } from '@/lib/partners/referral'

beforeEach(() => jar.clear())

describe('which code a checkout is attributed to', () => {
  it('uses the cookie when nothing was typed', () => {
    jar.set(REFERRAL_COOKIE, 'SARAH20')
    return expect(resolveCheckoutCode(null)).resolves.toBe('SARAH20')
  })

  it('lets a TYPED code win over the cookie', async () => {
    // The cookie is a fallback, never an override. Someone who has gone to the
    // trouble of typing a code means that one.
    jar.set(REFERRAL_COOKIE, 'SARAH20')
    expect(await resolveCheckoutCode('JAMIE15')).toBe('JAMIE15')
  })

  it('reads whitespace-only as nothing typed', async () => {
    jar.set(REFERRAL_COOKIE, 'SARAH20')
    expect(await resolveCheckoutCode('   ')).toBe('SARAH20')
  })

  it('is null when there is neither', async () => {
    expect(await resolveCheckoutCode(null)).toBeNull()
    expect(await resolveCheckoutCode('')).toBeNull()
  })

  it('trims what it hands on, but does not otherwise touch it', async () => {
    // Normalising belongs to `normaliseCode` at redemption; doing it twice in
    // two places is how the two drift apart.
    expect(await resolveCheckoutCode('  jamie15 ')).toBe('jamie15')
  })

  it('survives having no request context at all', async () => {
    // A background job raising an order has no browser to hold a cookie. Not an
    // error — just nothing to attribute to.
    const headers = jest.requireMock('next/headers') as { cookies: () => Promise<unknown> }
    const original = headers.cookies
    headers.cookies = async () => { throw new Error('called outside a request scope') }
    try {
      await expect(resolveCheckoutCode(null)).resolves.toBeNull()
    } finally {
      headers.cookies = original
    }
  })
})
