import { act, fireEvent, render, screen } from '@testing-library/react'
import { setQuizArm, resetQuizArm } from '@/lib/experiments/client'
import { AmpConsult } from '../AmpConsult'
import { chooseRoute, heading, pickFirstOptionAndNext, pressNext } from './drive'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetQuizArm()
})

/** jsdom has no `Response`; the consult only reads `ok` and `json()`. */
const reply = (data: unknown) => ({ ok: true, json: async () => data }) as unknown as Response

function mockCopy(respond: (sceneId: string) => unknown) {
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === '/api/consult/copy') {
      const { sceneId } = JSON.parse(String(init?.body))
      return reply(respond(sceneId))
    }
    return reply({})
  }) as typeof fetch
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('V2 AI-worded scenes in the consult', () => {
  it('uses the AI’s words for the next scene when they’re ready in time', async () => {
    setQuizArm({ arm: 'v1', consultAi: true })
    mockCopy((id) => (id === 'about' ? { copy: { question: 'Tell me about you', hint: 'Spin, then pick.' } } : { fallback: true }))
    render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }))
    await settle()
    pressNext()
    expect(heading()).toHaveTextContent('Tell me about you')
    expect(screen.getByText('Spin, then pick.')).toBeInTheDocument()
  })

  it('keeps the scripted words, with no visible break, when the AI misses', async () => {
    setQuizArm({ arm: 'v1', consultAi: true })
    mockCopy(() => ({ fallback: true }))
    render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }))
    await settle()
    pressNext()
    expect(heading()).toHaveTextContent('A bit about you')
  })

  it('never swaps words in once a scene is on screen', async () => {
    setQuizArm({ arm: 'v1', consultAi: true })
    let release: () => void = () => undefined
    global.fetch = jest.fn(
      () =>
        new Promise<Response>((r) => {
          release = () => r(reply({ copy: { question: 'Late words', hint: 'Too late.' } }))
        }),
    ) as typeof fetch
    render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }))
    pressNext()
    expect(heading()).toHaveTextContent('A bit about you')
    await act(async () => release())
    expect(heading()).toHaveTextContent('A bit about you')
  })

  it('asks for nothing while the AI layer is switched off', async () => {
    setQuizArm({ arm: 'v1', consultAi: false })
    global.fetch = jest.fn(async () => reply({})) as typeof fetch
    render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }))
    await settle()
    expect((global.fetch as jest.Mock).mock.calls.filter(([u]) => String(u) === '/api/consult/copy')).toHaveLength(0)
  })

  it('never asks for words for the circuit check', async () => {
    setQuizArm({ arm: 'v1', consultAi: true })
    mockCopy(() => ({ fallback: true }))
    render(<AmpConsult />)
    chooseRoute()
    for (let i = 0; i < 10; i++) {
      pickFirstOptionAndNext()
      await settle()
    }
    const asked = (global.fetch as jest.Mock).mock.calls.filter(([u]) => String(u) === '/api/consult/copy').map(([, init]) => JSON.parse(init.body).sceneId)
    expect(asked).not.toContain('circuit')
    expect(asked).not.toContain('review')
  })
})
