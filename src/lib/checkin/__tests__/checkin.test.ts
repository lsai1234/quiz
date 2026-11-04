/** @jest-environment node */
import { addDays, isDue, normaliseAnswer, suggestionsFor, type CheckInRecord } from '../model'
import { CHECKIN_COPY } from '../copy'
import { registerCheckIns } from '../register'
import { sweepCheckIns } from '../sweep'
import { deleteCheckInsFor, getCheckIns, saveCheckIns } from '../store'
import { buildGuide, normaliseGuideSeed } from '@/lib/guide/build'
import { saveGuide } from '@/lib/guide/store'
import { listNotifications } from '@/lib/notify/outbox'
import { saveServiceSettings } from '@/lib/offer/store'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { POST } from '@/app/api/checkin/[token]/route'

process.env.NOTIFY_TEST_ALLOWLIST = '@example.com'

const products = [
  { id: 'a', short: 'Creatine', trainingDays: false },
  { id: 'b', short: 'Pre-Workout', trainingDays: true },
  { id: 'c', short: 'Omega-3', trainingDays: false },
]
const base = { plan: 'oneoff' as const, answers: [] as CheckInRecord['answers'] }
const answer = (over: Partial<CheckInRecord['answers'][number]>) => ({ at: '2026-11-18T10:00:00Z', using: {}, training: null, timesWork: null, happy: null, ...over })

let n = 0
const token = () => `tok${String(++n).padStart(21, '0')}`

function guideFor(t: string, plan: 'oneoff' | 'subscription' = 'oneoff') {
  return buildGuide({
    token: t, now: '2026-11-04T10:00:00Z', plan,
    lines: MOCK_CATALOGUE.slice(0, 3).map((p) => ({ productId: p.id })),
    seed: normaliseGuideSeed({ firstName: 'alex' }), catalogue: MOCK_CATALOGUE,
  })
}

describe('Amp’s check-ins: about the box, never the body', () => {
  it('asks nothing about health', () => {
    const words = JSON.stringify(CHECKIN_COPY).toLowerCase()
    for (const w of ['energy', 'sleep', 'mood', 'stress', 'symptom', 'feel better', 'pain']) expect(words).not.toContain(w)
  })

  it('keeps answers to the box’s products and the shapes it asks', () => {
    expect(normaliseAnswer({ using: { a: 'daily', b: 'nope', z: 'daily' }, training: 'stopped', timesWork: false, happy: 9 }, ['a', 'b'], 'now')).toEqual({
      at: 'now', using: { a: 'daily' }, training: 'stopped', timesWork: false, happy: null,
    })
  })

  it('suggests leaving out what they stopped, a nudge for what they haven’t started, and training products while not training', () => {
    const s = suggestionsFor({ ...base, answers: [answer({ using: { a: 'stopped', c: 'notYet' }, training: 'stopped', timesWork: false, happy: 2 })] }, products)
    expect(s.map((x) => [x.kind, x.productId])).toEqual([
      ['drop', 'a'], ['training', 'b'], ['notStarted', 'c'], ['times', null], ['unhappy', null],
    ])
    expect(s[0].action).toEqual({ kind: 'reorder-without', productIds: ['a'] })
    // A plan changes in the account, where billing is handled.
    expect(suggestionsFor({ plan: 'subscription', answers: [answer({ using: { a: 'stopped' } })] }, products)[0].action).toEqual({ kind: 'account' })
  })

  it('is due every two weeks, up to its limit, until stopped', () => {
    const r = { stopped: false, sent: 0, plan: 'oneoff', nextDue: '2026-11-18' } as CheckInRecord
    expect(isDue(r, '2026-11-17')).toBe(false)
    expect(isDue(r, '2026-11-18')).toBe(true)
    expect(isDue({ ...r, sent: 6 }, '2026-12-30')).toBe(false)
    expect(isDue({ ...r, stopped: true }, '2026-11-18')).toBe(false)
    expect(addDays('2026-11-18', 14)).toBe('2026-12-02')
  })

  it('starts with the guide, sends when due through the outbox once, and lets them answer and stop', async () => {
    const t = token()
    const guide = guideFor(t)
    await saveGuide(guide)
    const record = await registerCheckIns(guide, { email: 'buyer@example.com', userId: null, orderId: 'o1' })
    expect(record?.nextDue).toBe('2026-11-18')

    expect((await sweepCheckIns(new Date('2026-11-10T07:00:00Z'))).sent).toBe(0)
    expect((await sweepCheckIns(new Date('2026-11-18T07:00:00Z'))).sent).toBeGreaterThanOrEqual(1)
    expect((await getCheckIns(t))?.nextDue).toBe('2026-12-02')
    // Same day again: nothing new for this box.
    await sweepCheckIns(new Date('2026-11-18T09:00:00Z'))
    const sent = (await listNotifications({ limit: 100 })).filter((x) => x.template === 'check-in' && x.dedupeKey?.startsWith(`check-in:${t}:`))
    expect(sent).toHaveLength(1)
    expect(sent[0].rendered.html).toContain(`/checkin/${t}?stop=1`)

    const ctx = { params: Promise.resolve({ token: t }) }
    const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ answer: { using: { [guide.products[0].id]: 'stopped' }, happy: 4 } }) }), ctx)
    const view = await res.json()
    expect(view.suggestions[0].kind).toBe('drop')
    expect(JSON.stringify(view)).not.toContain('buyer@example.com')

    await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ stop: true }) }), ctx)
    expect((await getCheckIns(t))?.stopped).toBe(true)
  })

  it('starts nothing while check-ins are switched off, or with no address', async () => {
    const t = token()
    expect(await registerCheckIns(guideFor(t), { email: null, userId: null, orderId: null })).toBeNull()
    await saveServiceSettings({ checkIns: false })
    expect(await registerCheckIns(guideFor(token()), { email: 'x@example.com', userId: null, orderId: null })).toBeNull()
    await saveServiceSettings({ checkIns: true })
  })

  it('deletes them with the account, and a year after the last activity', async () => {
    const t1 = token()
    const t2 = token()
    await registerCheckIns(guideFor(t1, 'subscription'), { email: 'm@example.com', userId: 'user-9', orderId: null })
    expect(await deleteCheckInsFor('user-9')).toBe(1)
    expect(await getCheckIns(t1)).toBeNull()

    const old = await registerCheckIns(guideFor(t2), { email: 'o@example.com', userId: null, orderId: null })
    await saveCheckIns({ ...old!, lastActivity: '2025-01-01T00:00:00Z' })
    await sweepCheckIns(new Date('2026-11-18T07:00:00Z'))
    expect(await getCheckIns(t2)).toBeNull()
  })
})
