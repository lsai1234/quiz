/**
 * @jest-environment node
 *
 * The handoff payload, saved against its consult ID (build H7). The route is
 * open to the internet, so what matters is what it refuses.
 */
import { GET, POST } from '../route'
import { buildHandoff } from '@/lib/consult/handoff'
import { runStackEngine } from '@/lib/consult/engine'
import { chargeProfile } from '@/lib/consult/profile'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'

const answers: ConsultAnswers = {
  ...EMPTY_ANSWERS,
  route: 'deep',
  goals: ['focus', 'allround'],
  age: '25-34',
  sex: 'female',
  week: ['gym', 'rest', 'cardio', 'rest', 'gym', 'rest', 'rest'],
  energy: 6,
  sleep: { bed: 1380, wake: 420, quality: 'ok' },
  daylight: 'some',
  caffeine: { coffee: 1, tea: 1, energy: 0 },
  plate: ['poultry', 'eggs', 'greens', 'fruit'],
  body: [],
  shelf: [],
  circuit: { flags: [], none: true },
  healthConsent: { accepted: true, version: 'x', at: 'x' },
}

function payload(id = 'c_abc123def456') {
  return buildHandoff({
    consultId: id,
    route: 'deep',
    goals: answers.goals,
    profile: chargeProfile(answers),
    engine: runStackEngine(answers, MOCK_CATALOGUE),
  })
}

const post = (body: unknown) =>
  POST(new Request('http://x/api/consult', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }))
const get = (id: string) => GET(new Request(`http://x/api/consult?id=${encodeURIComponent(id)}`))

describe('/api/consult', () => {
  it('saves a valid payload and hands it back by consult ID', async () => {
    const p = payload()
    const saved = await post(p)
    expect(saved.status).toBe(200)
    const back = await get(p.consult_id)
    expect(back.status).toBe(200)
    expect((await back.json()).payload).toEqual(p)
  })

  it('refuses a payload that fails its schema', async () => {
    const p = payload('c_zzz999yyy888')
    const broken = { ...p, tiers: { ...p.tiers, standard: ['not-essentials-first'] } }
    const res = await post(broken)
    expect(res.status).toBe(422)
    expect((await res.json()).errors).toContain('standard must contain essentials')
  })

  it('refuses something that is not JSON, or is too large', async () => {
    expect((await post('{nope')).status).toBe(400)
    expect((await post('x'.repeat(20_000))).status).toBe(413)
  })

  it('says not found for an unknown ID, and rejects a malformed one', async () => {
    expect((await get('c_nothinghere1')).status).toBe(404)
    expect((await get('../../etc')).status).toBe(400)
  })

  it('never stores the circuit check answers', async () => {
    const p = payload('c_privacy000001')
    await post(p)
    const text = JSON.stringify((await (await get(p.consult_id)).json()).payload)
    expect(text).not.toMatch(/circuit|healthConsent|pregnan|kidney|blood/i)
  })
})
