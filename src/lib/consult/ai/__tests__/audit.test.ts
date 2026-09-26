/**
 * @jest-environment node
 */
import { AI_LOG_RETENTION_DAYS, readAiLog, recordAi, summariseAiLog, type AiAuditEntry } from '../audit'
import { auditRoute, outcomeOf } from '../auditRoute'

const DAY = 86_400_000
const entry = (over: Partial<AiAuditEntry>): AiAuditEntry => ({ at: Date.UTC(2026, 8, 20, 12), route: 'copy', model: 'm', ms: 1000, outcome: 'ok', ...over })

describe('C1 the AI audit log', () => {
  it('reads outcomes off each route’s own reply', () => {
    expect(outcomeOf(200, { copy: {} })).toEqual({ outcome: 'ok' })
    expect(outcomeOf(200, { fallback: true, reason: 'image' })).toEqual({ outcome: 'fallback', reason: 'image' })
    expect(outcomeOf(200, { held: 'medical' })).toEqual({ outcome: 'held', reason: 'medical' })
    expect(outcomeOf(200, { medical: true })).toEqual({ outcome: 'held', reason: 'medical' })
    expect(outcomeOf(200, { unavailable: true })).toEqual({ outcome: 'unavailable' })
    expect(outcomeOf(200, { answer: null })).toEqual({ outcome: 'fallback' })
    expect(outcomeOf(429, { fallback: true })).toEqual({ outcome: 'busy' })
  })

  it('records a call with its subject and timing, and never the text', async () => {
    const at = Date.now()
    const POST = auditRoute('understand', 'model-x', async () => new Response(JSON.stringify({ held: 'medical' }), { headers: { 'content-type': 'application/json' } }))
    await POST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sceneId: 'sleep', text: 'I take warfarin' }) }))
    await new Promise((r) => setTimeout(r, 20))
    const log = await readAiLog(1, at)
    const line = log.find((e) => e.route === 'understand')!
    expect(line).toMatchObject({ route: 'understand', subject: 'sleep', model: 'model-x', outcome: 'held', reason: 'medical' })
    expect(JSON.stringify(log)).not.toMatch(/warfarin/)
  })

  it('drops days past the retention as new ones are written', async () => {
    const old = Date.UTC(2026, 0, 1, 12)
    await recordAi(entry({ at: old, route: 'voice' }))
    expect((await readAiLog(1, old)).some((e) => e.route === 'voice')).toBe(true)
    await recordAi(entry({ at: old + (AI_LOG_RETENTION_DAYS + 1) * DAY, route: 'scan' }))
    expect((await readAiLog(1, old)).some((e) => e.route === 'voice')).toBe(false)
  })

  it('summarises per feature, with median and slowest times', () => {
    const s = summariseAiLog([
      entry({ ms: 800 }),
      entry({ ms: 1200 }),
      entry({ ms: 4000, outcome: 'fallback' }),
      entry({ outcome: 'unavailable', ms: 2 }),
      entry({ route: 'voice', outcome: 'held', ms: 900 }),
    ])
    const copy = s.find((r) => r.route === 'copy')!
    expect(copy).toMatchObject({ calls: 4, ok: 2, fallback: 1, unavailable: 1, p50: 1200, p95: 1200 })
    expect(s[0].route).toBe('copy')
  })
})
