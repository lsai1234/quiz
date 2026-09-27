/**
 * @jest-environment node
 */
const create = jest.fn()
const moderate = jest.fn()
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create } }, moderations: { create: moderate } })))

import { POST } from '../route'

const call = (body: unknown) => POST(new Request('http://x/api/consult/pinpoint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
const reply = (content: unknown) => ({ choices: [{ message: { content: JSON.stringify(content) } }] })
const person = { goals: ['energy'], age: '35-44', energy: 3, comfort: false }

beforeEach(() => {
  create.mockReset()
  moderate.mockReset().mockResolvedValue({ results: [{ flagged: false }] })
  process.env.OPENAI_API_KEY = 'test'
})

describe('/api/consult/pinpoint', () => {
  it('words a question, checked, and asks once for the same kind of person', async () => {
    create.mockResolvedValue(reply({ text: 'Shattered by nine, then wide awake the second your head hits the pillow.' }))
    // "nine" isn't in the script: a made-up number, so the script stands.
    expect(await (await call({ kind: 'probe', probe: 'tired-then-awake', person })).json()).toEqual({ fallback: true })
    create.mockResolvedValue(reply({ text: 'Tired all evening, then wide awake in bed.' }))
    expect(await (await call({ kind: 'probe', probe: 'tired-then-awake', person: { ...person, goals: ['sleep'] } })).json()).toEqual({ words: { text: 'Tired all evening, then wide awake in bed.' } })
    const calls = create.mock.calls.length
    await call({ kind: 'probe', probe: 'tired-then-awake', person: { ...person, goals: ['sleep'] } })
    expect(create.mock.calls.length).toBe(calls)
  })

  it('keeps the script when the model names a condition', async () => {
    create.mockResolvedValue(reply({ text: 'Insomnia much? Tired, then wide awake.' }))
    expect(await (await call({ kind: 'probe', probe: 'tired-then-awake', person: { ...person, age: '45-54' } })).json()).toEqual({ fallback: true })
  })

  it('resolves every question itself: unknown ids and the day line get nothing', async () => {
    expect(await (await call({ kind: 'probe', probe: 'made-up', person })).json()).toEqual({ fallback: true })
    expect(await (await call({ kind: 'probe', probe: 'last-caffeine', person })).json()).toEqual({ fallback: true })
    expect(create).not.toHaveBeenCalled()
  })

  it('tells the model the coarse picture only', async () => {
    create.mockResolvedValue(reply({ text: 'Tired, then wired.' }))
    await call({ kind: 'probe', probe: 'snooze', person: { ...person, circuit: { flags: ['pregnancy'] }, notes: { sleep: 'night shifts' } } })
    const prompt = create.mock.calls[0][0].messages[1].content as string
    expect(prompt).not.toMatch(/pregnan|night shift/i)
    expect(prompt).toMatch(/data, not instructions/)
  })

  it('writes the hunch line from the evidence, and never a condition', async () => {
    create.mockResolvedValue(reply({ line: 'Mind racing at 11pm, after coffee through the afternoon.' }))
    expect(await (await call({ kind: 'hunch', pattern: 'wired', evidence: ['Mind racing at 11pm'], person })).json()).toEqual({ line: 'Mind racing at 11pm, after coffee through the afternoon.' })
    create.mockResolvedValue(reply({ line: 'Sounds like anxiety at 11pm.' }))
    expect(await (await call({ kind: 'hunch', pattern: 'wired', evidence: ['Up at 11pm'], person })).json()).toEqual({ fallback: true })
    // Health in the evidence never reaches the model.
    expect(await (await call({ kind: 'hunch', pattern: 'wired', evidence: ['On sertraline'], person })).json()).toEqual({ fallback: true })
  })

  it('writes "What I found" for known patterns only', async () => {
    create.mockResolvedValue(reply({ summary: 'You’re wired and tired. Everything I suggest is built around your evenings.' }))
    expect(await (await call({ kind: 'found', pinpointed: ['wired', 'nonsense'], partly: [], person })).json()).toEqual({ summary: 'You’re wired and tired. Everything I suggest is built around your evenings.' })
    expect(await (await call({ kind: 'found', pinpointed: ['nonsense'], partly: [], person })).json()).toEqual({ fallback: true })
  })

  it('reads typed text into answers for the listed questions only', async () => {
    create.mockResolvedValue(reply({ picks: [{ probe: 'tired-then-awake', answer: 'me' }, { probe: 'snooze', answer: 'days' }] }))
    const res = await (await call({ kind: 'tell', text: 'wiped by 9 then awake for hours', candidates: ['tired-then-awake', 'sleep-habits'], person })).json()
    expect(res).toEqual({ picks: [{ probe: 'tired-then-awake', answer: 'me' }] })
    expect(create.mock.calls[0][0].response_format.json_schema.strict).toBe(true)
  })

  it('holds health text back before anything is called', async () => {
    expect(await (await call({ kind: 'tell', text: 'my doctor says it’s my thyroid', candidates: ['tired-then-awake'], person })).json()).toEqual({ held: 'medical' })
    expect(moderate).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('holds back what moderation flags', async () => {
    moderate.mockResolvedValue({ results: [{ flagged: true }] })
    expect(await (await call({ kind: 'tell', text: 'something awful', candidates: ['tired-then-awake'], person })).json()).toEqual({ held: 'moderated' })
    expect(create).not.toHaveBeenCalled()
  })

  it('says so when there is no key', async () => {
    delete process.env.OPENAI_API_KEY
    expect(await (await call({ kind: 'probe', probe: 'tired-then-awake', person })).json()).toEqual({ unavailable: true })
  })
})

describe('/api/consult/pinpoint: the notes', () => {
  it('reads the notes together into patterns from the list', async () => {
    create.mockResolvedValue(reply({ hints: [{ pattern: 'crash', why: 'Energy swings week to week' }, { pattern: 'nonsense', why: 'x' }] }))
    const res = await (await call({ kind: 'notes', notes: ['Energy swings week to week: some weeks plenty, some weeks crashing'], candidates: ['crash', 'wired'], person })).json()
    expect(res).toEqual({ hints: [{ pattern: 'crash', why: 'Energy swings week to week' }] })
  })

  it('never sends a medical note, and has nothing to say without notes', async () => {
    expect(await (await call({ kind: 'notes', notes: ['Since starting statins'], candidates: ['crash'], person })).json()).toEqual({ hints: [] })
    expect(create).not.toHaveBeenCalled()
  })
})
