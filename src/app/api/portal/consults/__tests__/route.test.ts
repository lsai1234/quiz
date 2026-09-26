/**
 * @jest-environment node
 */
const authed = { value: true }
jest.mock('@/lib/portal/guard', () => ({ isPortalAuthed: async () => authed.value }))

import { kvGet, kvSet } from '@/lib/db/kv'
import { DELETE, GET } from '../route'

beforeEach(() => {
  authed.value = true
})

describe('C2 the consult viewer API', () => {
  it('is founders only', async () => {
    authed.value = false
    expect((await GET()).status).toBe(401)
    expect((await DELETE(new Request('http://x?id=c_abcdef12'))).status).toBe(401)
  })

  it('lists saved consults newest first, and leaves out ones past 30 days', async () => {
    const payload = (id: string) => ({ consult_id: id, goals: ['energy'], tiers: { essentials: [], standard: [], complete: [] }, excluded: [], flags: { pharmacist_note: false }, reasons: {}, claims: {}, notes: [], profile: {}, route: 'deep' })
    await kvSet('consult:c_old00001', { savedAt: Date.now() - 31 * 86_400_000, payload: payload('c_old00001') })
    await kvSet('consult:c_new00001', { savedAt: Date.now() - 1000, payload: payload('c_new00001') })
    await kvSet('consult:c_new00002', { savedAt: Date.now(), payload: payload('c_new00002') })
    await kvSet('consult-ai-log:2026-01-01', [])
    const body = await (await GET()).json()
    expect(body.consults.map((c: { payload: { consult_id: string } }) => c.payload.consult_id)).toEqual(['c_new00002', 'c_new00001'])
    expect(body.ai).toMatchObject({ targetMs: 1500 })
  })

  it('deletes a consult on request', async () => {
    await kvSet('consult:c_gone0001', { savedAt: Date.now(), payload: {} })
    expect((await DELETE(new Request('http://x?id=c_gone0001'))).status).toBe(200)
    expect(await kvGet('consult:c_gone0001')).toBeUndefined()
    expect((await DELETE(new Request('http://x?id=../etc'))).status).toBe(400)
  })
})
