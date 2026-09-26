/**
 * @jest-environment node
 */
const create = jest.fn()
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create } } })))

import { POST } from '../route'
import { COPY_BUDGET_MS } from '@/lib/consult/ai/copy'

const call = (body: unknown) => POST(new Request('http://x/api/consult/copy', { method: 'POST', body: JSON.stringify(body) }))
const reply = (content: unknown) => ({ choices: [{ message: { content: JSON.stringify(content) } }] })

beforeEach(() => {
  create.mockReset()
  process.env.OPENAI_API_KEY = 'test'
})

describe('/api/consult/copy', () => {
  it('says unavailable with no key, so "never on" is distinguishable from "missed"', async () => {
    delete process.env.OPENAI_API_KEY
    expect(await (await call({ sceneId: 'energy', answers: {} })).json()).toEqual({ unavailable: true })
  })

  it('refuses unknown scenes and never words the circuit check', async () => {
    expect(await (await call({ sceneId: 'nope' })).json()).toEqual({ fallback: true })
    expect(await (await call({ sceneId: 'circuit' })).json()).toEqual({ fallback: true })
    expect(create).not.toHaveBeenCalled()
  })

  it('returns validated copy from the pinned model with structured output', async () => {
    create.mockResolvedValue(reply({ question: 'Battery check: how are afternoons?', hint: 'Drag to fill it.' }))
    const res = await (await call({ sceneId: 'energy', answers: { goals: ['energy'] } })).json()
    expect(res).toEqual({ copy: { question: 'Battery check: how are afternoons?', hint: 'Drag to fill it.' } })
    const [params, opts] = create.mock.calls[0]
    expect(params.model).toMatch(/\d{4}-\d{2}-\d{2}$/)
    expect(params.response_format.json_schema.strict).toBe(true)
    expect(opts.timeout).toBeLessThan(COPY_BUDGET_MS)
  })

  it('falls back when the model goes off-message', async () => {
    create.mockResolvedValue(reply({ question: 'Want some creatine?', hint: 'It helps.' }))
    expect(await (await call({ sceneId: 'energy' })).json()).toEqual({ fallback: true })
  })

  it('falls back when the model is slow or down', async () => {
    create.mockRejectedValue(new Error('timeout'))
    expect(await (await call({ sceneId: 'energy' })).json()).toEqual({ fallback: true })
  })

  it('never sends health answers to the model', async () => {
    create.mockResolvedValue(reply({ question: 'How’s your energy?', hint: 'Drag to fill it.' }))
    await call({
      sceneId: 'energy',
      answers: { goals: ['sleep'], circuit: { flags: ['pregnancy'], none: false }, body: ['knees'], notes: { sleep: 'insomnia' } },
    })
    expect(JSON.stringify(create.mock.calls[0][0].messages)).not.toMatch(/pregnan|knee|insomnia/i)
  })
})
