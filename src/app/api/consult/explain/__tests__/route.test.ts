/**
 * @jest-environment node
 */
const create = jest.fn()
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create } } })))

import { POST } from '../route'

const call = (body: unknown) => POST(new Request('http://x/api/consult/explain', { method: 'POST', body: JSON.stringify(body) }))
const reply = (content: unknown) => ({ choices: [{ message: { content: JSON.stringify(content) } }] })

beforeEach(() => {
  create.mockReset()
  process.env.OPENAI_API_KEY = 'test'
})

describe('/api/consult/explain', () => {
  it('answers only from the approved entry', async () => {
    create.mockResolvedValue(reply({ found: true, answer: 'It means keeping moving well for the long run.' }))
    expect(await (await call({ key: 'ageing', question: 'what does it mean?' })).json()).toEqual({ answer: 'It means keeping moving well for the long run.' })
    expect(create.mock.calls[0][0].messages[1].content).toMatch(/Approved text — Healthy ageing/)
  })

  it('says nothing when the entry doesn’t cover it', async () => {
    create.mockResolvedValue(reply({ found: false, answer: 'Probably yes.' }))
    expect(await (await call({ key: 'ageing', question: 'will I live longer?' })).json()).toEqual({ answer: null })
  })

  it('drops an answer that makes a claim', async () => {
    create.mockResolvedValue(reply({ found: true, answer: 'It helps prevent disease.' }))
    expect(await (await call({ key: 'ageing', question: 'why?' })).json()).toEqual({ answer: null })
  })

  it('redirects medical questions before any model sees them', async () => {
    expect(await (await call({ key: 'energy', question: 'can I take it with my insulin?' })).json()).toEqual({ medical: true })
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses the circuit check and unknown terms', async () => {
    expect(await (await call({ key: 'circuit-check', question: 'why?' })).json()).toEqual({ answer: null })
    expect(await (await call({ key: 'nope', question: 'why?' })).json()).toEqual({ answer: null })
  })
})
