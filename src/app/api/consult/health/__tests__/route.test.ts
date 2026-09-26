/**
 * @jest-environment node
 */
const create = jest.fn()
const moderate = jest.fn()
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create } }, moderations: { create: moderate } })))
const authed = { value: true }
jest.mock('@/lib/portal/guard', () => ({ isPortalAuthed: async () => authed.value }))

import { POST } from '../route'

const reply = (content: unknown) => ({ choices: [{ message: { content: JSON.stringify(content) } }] })

beforeEach(() => {
  create.mockReset()
  moderate.mockReset().mockResolvedValue({ results: [{ flagged: false }] })
  authed.value = true
  process.env.OPENAI_API_KEY = 'test'
})

describe('the founder AI check', () => {
  it('is founders only', async () => {
    authed.value = false
    expect((await POST()).status).toBe(401)
    expect(create).not.toHaveBeenCalled()
  })

  it('says so when there is no key', async () => {
    delete process.env.OPENAI_API_KEY
    expect(await (await POST()).json()).toEqual({ configured: false })
  })

  it('reports working wording with what Amp wrote, and its time', async () => {
    create.mockResolvedValue(reply({ question: 'How does your week look?', hint: 'Tap each day.', react: 'Nice.' }))
    const body = await (await POST()).json()
    expect(body.configured).toBe(true)
    expect(body.wording).toMatchObject({ ok: true, detail: '“Nice. How does your week look?”' })
    expect(typeof body.wording.ms).toBe('number')
    expect(body.moderation.ok).toBe(true)
  })

  it('passes on OpenAI’s own error, which says what to fix', async () => {
    create.mockRejectedValue(Object.assign(new Error('Incorrect API key provided'), { status: 401 }))
    const body = await (await POST()).json()
    expect(body.wording).toMatchObject({ ok: false, detail: '401 Incorrect API key provided' })
  })
})
