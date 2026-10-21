/**
 * @jest-environment node
 */
/**
 * The code box — on the results page, a bundle page and the shop basket —
 * with the daily codes switched off. A daily code made before is refused while
 * it is being typed, so the basket never shows 25% off that checkout would not
 * give; a store code is still taken, and says what it takes off.
 */
jest.mock('@/lib/portal/store', () => ({ syncPortalRuntime: async () => {} }))

import { POST } from '../route'
import { createStoreCode, ensureHousePartner } from '@/lib/store-codes'
import { HOUSE_PARTNER_ID } from '@/lib/partners/house'
import * as repo from '@/lib/partners/repo'

function check(code: string, channel: 'quiz' | 'subscription' | 'shop') {
  return POST(new Request('http://localhost/api/partner-code', { method: 'POST', body: JSON.stringify({ code, subtotal: 60, channel }) }))
}

beforeAll(async () => {
  await ensureHousePartner()
  // As the old schedule made it, on open terms: only its kind can refuse it.
  await repo.createCode({
    code: 'IGNITE25',
    partnerId: HOUSE_PARTNER_ID,
    discountPct: 0.25,
    terms: { firstOrderOnly: false, maxUses: null, uses: 0, startsAt: null, endsAt: null, minSpend: null },
  })
  await createStoreCode({ name: 'STORE15', percent: 15 })
})

it('refuses a daily code for a stack, a subscription and the shop basket', async () => {
  for (const channel of ['quiz', 'subscription', 'shop'] as const) {
    expect(await (await check('ignite25', channel)).json()).toEqual({ ok: false, reason: 'That code is no longer active.' })
  }
})

it('still takes a store code, for a stack, a subscription and the shop basket', async () => {
  for (const channel of ['quiz', 'subscription', 'shop'] as const) {
    expect(await (await check('store15', channel)).json()).toEqual({
      ok: true, code: 'STORE15', discountPct: 0.15, kind: 'store', partnerName: null,
    })
  }
})
