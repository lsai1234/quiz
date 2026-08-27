/**
 * The rewrite's guardrails, not its prose. What matters is that it can never
 * leave a product with no copy, and can never publish a health claim.
 */
const create = jest.fn()
jest.mock('openai', () => ({
  __esModule: true,
  default: class {
    chat = { completions: { create } }
  },
}))

import { rewriteDescription } from '../rewrite-description'

const OSAVI =
  '<div class="RichText3-paragraph">OSAVI shaker in blue, 700 ml capacity.</div>' +
  '<div class="RichText3-paragraph">Food safe, BPA free.</div>'

const CLEANED = 'OSAVI shaker in blue, 700 ml capacity.\nFood safe, BPA free.'

const input = { title: 'Osavi Shaker', category: 'Accessories', description: OSAVI }

function aiReplies(content: string) {
  create.mockResolvedValueOnce({ choices: [{ message: { content } }] })
}

describe('rewriteDescription', () => {
  const originalKey = process.env.OPENAI_API_KEY

  beforeEach(() => {
    create.mockReset()
    process.env.OPENAI_API_KEY = 'test-key'
  })

  afterAll(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalKey
  })

  it('uses the rewrite when it is clean', async () => {
    aiReplies('A 700 ml blue shaker with a measuring cup and mixing ball. BPA free and dishwasher safe.')
    const result = await rewriteDescription(input)
    expect(result.source).toBe('ai')
    expect(result.text).toContain('700 ml')
  })

  it('rejects a rewrite that makes a health claim and keeps the cleaned source', async () => {
    aiReplies('A shaker that is clinically proven to speed up recovery.')
    const result = await rewriteDescription(input)
    expect(result.source).toBe('cleaned')
    expect(result.reason).toBe('claim-flagged')
    expect(result.text).toBe(CLEANED)
    expect(result.flags?.length).toBeGreaterThan(0)
  })

  it('strips markup out of the model answer too', async () => {
    aiReplies('<p>A 700 ml blue shaker.</p>')
    const result = await rewriteDescription(input)
    expect(result.source).toBe('ai')
    expect(result.text).toBe('A 700 ml blue shaker.')
  })

  it('falls back to the cleaned text when the API fails', async () => {
    create.mockRejectedValueOnce(new Error('timeout'))
    const result = await rewriteDescription(input)
    expect(result).toMatchObject({ source: 'cleaned', reason: 'api-error', text: CLEANED })
  })

  it('falls back when the model answers with nothing', async () => {
    aiReplies('   ')
    const result = await rewriteDescription(input)
    expect(result).toMatchObject({ source: 'cleaned', reason: 'empty-answer', text: CLEANED })
  })

  it('falls back when the model runs away', async () => {
    aiReplies('word '.repeat(400))
    const result = await rewriteDescription(input)
    expect(result).toMatchObject({ source: 'cleaned', reason: 'too-long', text: CLEANED })
  })

  it('returns the cleaned text and never calls the API without a key', async () => {
    delete process.env.OPENAI_API_KEY
    const result = await rewriteDescription(input)
    expect(result).toMatchObject({ source: 'cleaned', reason: 'no-api-key', text: CLEANED })
    expect(create).not.toHaveBeenCalled()
  })

  it('never asks the model to describe a product with no source text', async () => {
    const result = await rewriteDescription({ ...input, description: '' })
    expect(result).toMatchObject({ source: 'cleaned', reason: 'no-source-text', text: '' })
    expect(create).not.toHaveBeenCalled()
  })
})
