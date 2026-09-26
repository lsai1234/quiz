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

  const toTraining = () => {
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }))
    pressNext()
    fireEvent.click(screen.getByRole('option', { name: '25–34' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Male' }))
    pressNext()
    expect(heading()).toHaveTextContent(SCENES.find((s) => s.id === 'training')!.copy.question)
  }
  const understandReplies = (picks: unknown[]) => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) =>
      String(url) === '/api/consult/understand' ? reply({ picks }) : reply({ fallback: true }),
    ) as typeof fetch
  }
  const say = async (text: string) => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: text } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to Amp' }))
    })
  }

  it('is offered only with the AI layer on', () => {
    render(<AmpConsult />)
    toTraining()
    expect(screen.queryByText(/Tell Amp/)).toBeNull()
  })

  it('lives in the scene, in its own words: leading where talking is easier, under the widget elsewhere', () => {
    setQuizArm({ arm: 'v1', consultAi: true })
    understandReplies([])
    render(<AmpConsult />)
    toTraining()
    // Training leads with it, and says what someone might tell it.
    const lead = screen.getByRole('button', { name: /Tell Amp how your weeks usually go/ })
    expect(lead).toHaveTextContent('football on Tuesdays')
    expect(screen.getByText('Or set it below')).toBeInTheDocument()
    fireEvent.click(lead)
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', expect.stringContaining('football on Tuesdays'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    // Energy: a quiet line under the dial.
    fireEvent.click(screen.getByRole('button', { name: 'No training right now' }))
    pressNext()
    expect(screen.getByRole('button', { name: /Tell Amp when it dips/ })).toBeInTheDocument()
    expect(screen.queryByText('Or set it below')).toBeNull()
  })

  it('fills the training week from what was said, as sessions a week', async () => {
    setQuizArm({ arm: 'v1', consultAi: true })
    understandReplies([
      { kind: 'gym-sessions', value: '2', label: 'Gym twice a week' },
      { kind: 'sport-sessions', value: '1', label: 'Football on Tuesdays' },
    ])
    render(<AmpConsult />)
    toTraining()
    fireEvent.click(screen.getByRole('button', { name: /Tell Amp how your weeks usually go/ }))
    await say('gym monday and thursday, football tuesdays')
    fireEvent.click(screen.getByRole('button', { name: 'Add all' }))
    expect(screen.getByRole('radio', { name: 'It varies' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('About 3 a week · 2 Gym · 1 Sport')).toBeInTheDocument()
  })

  it('takes an explanation as the answer: no need to tap the widget as well', async () => {
    setQuizArm({ arm: 'v1', consultAi: true })
    understandReplies([{ kind: 'note', value: 'Shift work', label: 'Shift work · changes every week' }])
    render(<AmpConsult />)
    toTraining()
    fireEvent.click(screen.getByRole('button', { name: /Tell Amp how your weeks usually go/ }))
    await say('shift work, honestly it changes every week')
    fireEvent.click(screen.getByRole('button', { name: 'Add it' }))
    expect(screen.getByRole('status')).toHaveTextContent('Shift work · changes every week')
    pressNext()
    expect(heading()).toHaveTextContent(SCENES.find((s) => s.id === 'energy')!.copy.question)
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
