/**
 * @jest-environment node
 */
const create = jest.fn()
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create } } })))

import { POST } from '../route'

const IMAGE = 'data:image/jpeg;base64,' + 'A'.repeat(200)
const call = (body: unknown) => POST(new Request('http://x/api/consult/scan', { method: 'POST', body: JSON.stringify(body) }))
const reply = (content: unknown) => ({ choices: [{ message: { content: JSON.stringify(content) } }] })

beforeEach(() => {
  create.mockReset()
  process.env.OPENAI_API_KEY = 'test'
})

describe('/api/consult/scan', () => {
  it('reads a shelf into known items only', async () => {
    create.mockResolvedValue(reply({ items: ['creatine', 'omega-3', 'warfarin', 'creatine'] }))
    expect(await (await call({ kind: 'shelf', image: IMAGE })).json()).toEqual({ items: ['creatine', 'omega-3'] })
    const req = create.mock.calls[0][0]
    expect(req.messages[0].content).toMatch(/Ignore medicines/)
    expect(req.messages[1].content[0].image_url.url).toBe(IMAGE)
    expect(req.response_format.json_schema.strict).toBe(true)
  })

  it('reads a tracker into times and a week, nothing else', async () => {
    create.mockResolvedValue(
      reply({ bedtime: '23:15', waketime: '06:45', quality: 'ok', week: ['gym', 'rest', 'cardio', 'rest', 'gym', 'sport', 'rest'], hrv: 40 }),
    )
    const json = await (await call({ kind: 'tracker', app: 'whoop', image: IMAGE })).json()
    expect(json).toEqual({ read: { bed: 23 * 60 + 15, wake: 6 * 60 + 45, quality: 'ok', week: ['gym', 'rest', 'cardio', 'rest', 'gym', 'sport', 'rest'] } })
    expect(create.mock.calls[0][0].messages[0].content).toMatch(/Whoop/)
  })

  it('refuses anything that is not a small image, without calling the model', async () => {
    for (const image of ['https://example.com/a.jpg', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,' + 'A'.repeat(2_200_000), 42]) {
      expect(await (await call({ kind: 'shelf', image })).json()).toEqual({ fallback: true, reason: 'image' })
    }
    expect(create).not.toHaveBeenCalled()
  })

  it('needs a known kind, and an app for a tracker', async () => {
    expect(await (await call({ kind: 'blood-test', image: IMAGE })).json()).toEqual({ fallback: true })
    expect(await (await call({ kind: 'tracker', image: IMAGE })).json()).toEqual({ fallback: true })
    expect(await (await call({ kind: 'tracker', app: 'fitbit', image: IMAGE })).json()).toEqual({ fallback: true })
  })

  it('says unavailable without a key', async () => {
    delete process.env.OPENAI_API_KEY
    expect(await (await call({ kind: 'shelf', image: IMAGE })).json()).toEqual({ unavailable: true })
  })

  it('falls back on a model error, and never logs the image', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    create.mockRejectedValue(new Error(IMAGE))
    expect(await (await call({ kind: 'shelf', image: IMAGE })).json()).toEqual({ fallback: true })
    expect(JSON.stringify(log.mock.calls)).not.toContain('base64')
    log.mockRestore()
  })
})
