/**
 * @jest-environment node
 */
/**
 * Every order asks PowerBody for a service by its code: Royal Mail Tracked 48
 * up to 7 kg, DPD above. The codes are the account's own, read off
 * `getShippingMethod` by name, or chosen by a founder.
 */
import { kvDelete } from '@/lib/db/kv'
import { toCreateOrderPayload } from '../powerbody/wire'
import { detectTransportCodes, getTransportCodes, rememberShippingMethods, setTransportCode, transportCodeFor } from '../transport'

const METHODS = [
  { code: 'DPD_2D', name: 'DPD Two Day', price: 5.17 },
  { code: 'RM_T24', name: 'Royal Mail Tracked 24', price: 4.1 },
  { code: 'RM_T48', name: 'Royal Mail Tracked 48', price: 3.25 },
]
const NOW = new Date('2026-11-11T10:00:00Z')

beforeEach(async () => {
  await kvDelete('supplier-transport-codes')
})

describe('reading the codes off the account', () => {
  it('finds each carrier by name, preferring the service we price on', () => {
    expect(detectTransportCodes(METHODS)).toEqual({ 'royal-mail': 'RM_T48', dpd: 'DPD_2D', ups: null })
    expect(detectTransportCodes([{ code: 'X', name: 'Courier', price: null }])).toEqual({ 'royal-mail': null, dpd: null, ups: null })
  })

  it('keeps what it found, and never overwrites a code a founder chose', async () => {
    await setTransportCode('dpd', 'MY_DPD')
    const kept = await rememberShippingMethods(METHODS, NOW)
    expect(kept.codes['royal-mail']).toEqual({ code: 'RM_T48', source: 'detected' })
    expect(kept.codes.dpd).toEqual({ code: 'MY_DPD', source: 'set' })
    expect(kept.methods).toHaveLength(3)
    // Cleared, it goes back to what the account lists.
    expect((await setTransportCode('dpd', '')).codes.dpd).toEqual({ code: 'DPD_2D', source: 'detected' })
  })
})

describe('the code an order is sent with', () => {
  it('asks the account once when none is known, and holds off an hour if that finds nothing', async () => {
    const list = jest.fn(async () => METHODS)
    expect(await transportCodeFor('royal-mail', list, NOW)).toBe('RM_T48')
    expect(await transportCodeFor('dpd', list, NOW)).toBe('DPD_2D')
    expect(list).toHaveBeenCalledTimes(1)

    await kvDelete('supplier-transport-codes')
    const failing = jest.fn(async () => {
      throw new Error('Resource path is not callable')
    })
    expect(await transportCodeFor('royal-mail', failing, NOW)).toBeNull()
    expect(await transportCodeFor('royal-mail', failing, new Date(NOW.getTime() + 10 * 60_000))).toBeNull()
    expect(failing).toHaveBeenCalledTimes(1)
    expect((await getTransportCodes()).checkedAt).toBe(NOW.toISOString())
  })

  it('without a way to ask, leaves the choice to PowerBody', async () => {
    expect(await transportCodeFor('royal-mail', null, NOW)).toBeNull()
  })

  it('rides on the order into transport_code, ahead of any caller override', () => {
    const order = {
      reference: 'ord_1',
      shippingAddress: { name: 'Sam Taylor', line1: '1 St', city: 'Leeds', postcode: 'LS1 1AA', country: 'GB' },
      lines: [{ sku: 'W1', quantity: 1 }],
      weightKg: 1.15,
      transportCode: 'RM_T48',
    }
    const payload = toCreateOrderPayload(order, { transportCode: 'OTHER', dateAdd: '2026-11-11 10:00:00' })
    expect(payload).toMatchObject({ transport_code: 'RM_T48', weight: 1.15 })
    expect(toCreateOrderPayload({ ...order, transportCode: null }, {}).transport_code).toBe('')
  })
})
