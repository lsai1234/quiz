/**
 * @jest-environment node
 */
const create = jest.fn()
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create } } })))

import { NextRequest } from 'next/server'
import { POST } from '../route'
import { BLUEPRINT_SYSTEM_PROMPT } from '@/lib/ai-stack'
import { defaultAnswers } from '@/lib/quiz-answers'

/**
 * The route hands the client product ids and nothing else. The model is asked
 * for ids only, but a reply shaped the old way (with a `reasons` object) must
 * not get its prose through to the browser.
 */

const slots = [{
  slotId: 'slot-protein', title: 'Protein', description: 'Daily protein', currentProductId: 'a',
  options: [
    { id: 'a', name: 'A', category: 'Protein', price: 30, vegan: false, stimulant: false, reason: 'r', claims: [] },
    { id: 'b', name: 'B', category: 'Protein', price: 32, vegan: true, stimulant: false, reason: 'r', claims: [] },
  ],
}]

const call = (body: unknown) =>
  POST(new NextRequest('http://x/api/personalise-stack', { method: 'POST', body: JSON.stringify(body) }))
const reply = (content: unknown) => ({ choices: [{ message: { content: JSON.stringify(content) } }] })
const answers = { ...defaultAnswers, goals: ['muscle'], budget: '50-80' }

beforeEach(() => {
  create.mockReset()
  process.env.OPENAI_API_KEY = 'test'
})

describe('/api/personalise-stack', () => {
  it('returns the chosen ids and no reasons, even when the model writes some', async () => {
    create.mockResolvedValue(reply({
      choices: { 'slot-protein': 'b' },
      reasons: { 'slot-protein': 'The perfect protein for your goals' },
    }))
    const body = await (await call({ answers, slots })).json()
    expect(body).toEqual({ choices: { 'slot-protein': 'b' }, personalised: true })
    expect(JSON.stringify(body)).not.toMatch(/perfect protein/)
  })

  it('reports nothing personalised when the reply is only prose', async () => {
    create.mockResolvedValue(reply({ reasons: { 'slot-protein': 'Great pick' } }))
    expect(await (await call({ answers, slots })).json()).toEqual({ choices: {}, personalised: false })
  })

  it('drops an id that was not one of the slot options', async () => {
    create.mockResolvedValue(reply({ choices: { 'slot-protein': 'zzz' } }))
    expect(await (await call({ answers, slots })).json()).toEqual({ choices: {}, personalised: false })
  })

  it('sends the ids-only system prompt and no budget, even for an answer set that has one', async () => {
    create.mockResolvedValue(reply({ choices: { 'slot-protein': 'a' } }))
    await call({ answers, slots })
    const { messages } = create.mock.calls[0][0]
    expect(messages[0].content).toBe(BLUEPRINT_SYSTEM_PROMPT)
    expect(messages[1].content).not.toMatch(/budget|£50/i)
  })

  it('falls back quietly when there is no key, or the model fails', async () => {
    delete process.env.OPENAI_API_KEY
    expect(await (await call({ answers, slots })).json()).toEqual({ choices: {}, personalised: false })
    expect(create).not.toHaveBeenCalled()

    process.env.OPENAI_API_KEY = 'test'
    create.mockRejectedValue(new Error('timeout'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(await (await call({ answers, slots })).json()).toEqual({ choices: {}, personalised: false })
    spy.mockRestore()
  })
})
