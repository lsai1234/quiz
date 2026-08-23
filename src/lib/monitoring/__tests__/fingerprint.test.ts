/**
 * @jest-environment node
 */
import { fingerprint, normaliseMessage, topFrame } from '../fingerprint'

/**
 * Grouping is the difference between a monitoring page and a wall of text, and
 * it fails in two opposite directions — over-merging hides a second bug behind
 * the first, under-merging buries everything under one noisy fault. Both are
 * asserted here because both are silent: the page looks fine either way.
 */
describe('normaliseMessage', () => {
  it('strips the ids that make one fault look like hundreds', () => {
    const a = normaliseMessage('Order 3f2b8c1e-9a4d-4f61-b2c7-8e1d5a6f0b93 not found')
    const b = normaliseMessage('Order 91a7d4f2-1c8b-4e33-9d0a-6b2f7c4e8a15 not found')
    expect(a).toBe(b)
    expect(a).toBe('Order <uuid> not found')
  })

  it('strips Stripe-style prefixed ids', () => {
    expect(normaliseMessage('No such checkout.session: cs_test_a1B2c3D4e5')).toBe(
      'No such checkout.session: <id>',
    )
  })

  it('strips numbers, URLs and timestamps', () => {
    expect(normaliseMessage('Request to https://api.stripe.com/v1/charges failed after 3 tries')).toBe(
      'Request to <url> failed after <n> tries',
    )
    expect(normaliseMessage('Expired at 2026-08-23T10:15:00.000Z')).toBe('Expired at <time>')
  })

  it('keeps two genuinely different messages apart', () => {
    expect(normaliseMessage('Card declined')).not.toBe(normaliseMessage('Card expired'))
  })
})

describe('topFrame', () => {
  it('skips framework and dependency frames to find our own', () => {
    const stack = [
      'Error: boom',
      '    at Object.throwError (/var/task/node_modules/stripe/lib/index.js:120:15)',
      '    at handler (/var/task/.next/server/node_modules/next/dist/server/route.js:9:1)',
      '    at finalizeCheckout (/var/task/src/lib/checkout/finalize.ts:88:11)',
    ].join('\n')
    expect(topFrame(stack)).toBe('checkout/finalize.ts:88')
  })

  it('is empty rather than wrong when there is no stack', () => {
    expect(topFrame(null)).toBe('')
    expect(topFrame('Error: boom')).toBe('')
  })

  it('ignores the column, so a reformat does not fork the group', () => {
    const at = (col: number) => `Error: x\n    at f (/app/src/lib/a.ts:10:${col})`
    expect(topFrame(at(4))).toBe(topFrame(at(40)))
  })
})

describe('fingerprint', () => {
  const stack = 'Error: boom\n    at pay (/app/src/lib/checkout/finalize.ts:88:11)'

  it('collapses the same fault raised many times', () => {
    expect(
      fingerprint({ surface: 'checkout', message: 'Order abc-1 failed at 14:02', stack }),
    ).toBe(fingerprint({ surface: 'checkout', message: 'Order abc-2 failed at 15:31', stack }))
  })

  it('separates the same message thrown from different places', () => {
    const other = 'Error: boom\n    at load (/app/src/lib/shop/catalogue.ts:12:3)'
    expect(fingerprint({ surface: 'shop', message: 'Not found', stack })).not.toBe(
      fingerprint({ surface: 'shop', message: 'Not found', stack: other }),
    )
  })

  it('separates the same fault on different surfaces', () => {
    expect(fingerprint({ surface: 'shop', message: 'fetch failed' })).not.toBe(
      fingerprint({ surface: 'myhub', message: 'fetch failed' }),
    )
  })

  it('is short and stable', () => {
    const fp = fingerprint({ surface: 'quiz', message: 'boom' })
    expect(fp).toMatch(/^[0-9a-f]{12}$/)
    expect(fp).toBe(fingerprint({ surface: 'quiz', message: 'boom' }))
  })
})

describe('normaliseMessage does not over-merge', () => {
  /**
   * The id rule has to be greedy enough for `cs_test_…` and shy enough to leave
   * snake_case alone. Collapsing table names would put two unrelated database
   * faults in one group, where fixing one looks like it fixed both.
   */
  it('leaves snake_case identifiers alone', () => {
    expect(normaliseMessage('relation stock_exceptions does not exist')).toBe(
      'relation stock_exceptions does not exist',
    )
    expect(normaliseMessage('relation stock_exceptions does not exist')).not.toBe(
      normaliseMessage('relation partner_payouts does not exist'),
    )
  })

  it('still catches multi-segment Stripe ids', () => {
    expect(normaliseMessage('cs_test_a1B2c3D4e5 expired')).toBe('<id> expired')
    expect(normaliseMessage('pi_3ABC123xyz789 failed')).toBe('<id> failed')
  })
})
