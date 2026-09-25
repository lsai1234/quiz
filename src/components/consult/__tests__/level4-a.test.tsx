import { act, fireEvent, render, screen } from '@testing-library/react'
import { setQuizArm, resetQuizArm } from '@/lib/experiments/client'
import { SCENES } from '@/lib/consult/flow'
import { AmpConsult } from '../AmpConsult'
import { TellAmpMore } from '../TellAmpMore'
import { chooseRoute, heading, pressNext } from './drive'

const sleep = SCENES.find((s) => s.id === 'sleep')!
const reply = (data: unknown) => ({ ok: true, json: async () => data }) as unknown as Response

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetQuizArm()
})

describe('V3 tell Amp more', () => {
  it('keeps health details on the device: no request at all', async () => {
    const send = jest.fn()
    render(<TellAmpMore scene={sleep} onAdd={jest.fn()} onClose={jest.fn()} onThinking={jest.fn()} send={send} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I take blood thinners' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send to Amp' }))
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText(/circuit check at the end/)).toBeInTheDocument()
  })

  it('comes back as cards to add, not a chat reply — and a wrong pick goes with one tap', async () => {
    const onAdd = jest.fn()
    const send = jest.fn(async () => ({
      picks: [
        { kind: 'note' as const, value: 'Night shifts', label: 'Night shifts · 3 a week' },
        { kind: 'sleep-quality' as const, value: 'broken', label: 'Sleep: Restless' },
      ],
    }))
    render(<TellAmpMore scene={sleep} onAdd={onAdd} onClose={jest.fn()} onThinking={jest.fn()} send={send} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I work nights three times a week' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to Amp' }))
    })
    expect(screen.getByText('Night shifts · 3 a week')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sleep: Restless' }))
    expect(screen.queryByText('Sleep: Restless')).toBeNull()
    expect(onAdd).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Add it' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ label: 'Night shifts · 3 a week' }))
  })

  it('is offered only with the AI layer on, and never on the circuit check', () => {
    render(<AmpConsult />)
    chooseRoute()
    expect(screen.queryByText('Tell Amp more')).toBeNull()
  })

  it('applies added picks to the answers', async () => {
    setQuizArm({ arm: 'v1', consultAi: true })
    global.fetch = jest.fn(async (url: RequestInfo | URL) =>
      String(url) === '/api/consult/understand'
        ? reply({ picks: [{ kind: 'goal', value: 'focus', label: 'Goal: Focus' }] })
        : reply({ fallback: true }),
    ) as typeof fetch
    render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: 'Tell Amp more' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'mostly want to concentrate better' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to Amp' }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add it' }))
    expect(screen.getByRole('button', { name: /^Focus/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('V4 Amp reacts', () => {
  it('shows the AI’s reaction on the next scene when it was ready', async () => {
    setQuizArm({ arm: 'v1', consultAi: true })
    global.fetch = jest.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const { sceneId } = JSON.parse(String(init?.body))
      return reply(sceneId === 'about' ? { copy: { question: 'A bit about you', hint: 'Spin.', react: 'Energy first. Love it.' } } : { fallback: true })
    }) as typeof fetch
    render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    pressNext()
    expect(screen.getByText('Energy first. Love it.')).toBeInTheDocument()
  })
})

describe('V5 the 18+ gate', () => {
  it('ends the consult at "about you" for under-18s, before any health question', () => {
    render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }))
    pressNext()
    fireEvent.click(screen.getByRole('option', { name: 'Under 18' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Female' }))
    pressNext()
    expect(heading()).toHaveTextContent('Come back at 18')
    fireEvent.click(screen.getByRole('button', { name: 'I picked the wrong age' }))
    expect(heading()).toHaveTextContent('A bit about you')
  })
})
