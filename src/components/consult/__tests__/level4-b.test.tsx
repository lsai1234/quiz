import { act, fireEvent, render, screen } from '@testing-library/react'
import { setQuizArm, resetQuizArm } from '@/lib/experiments/client'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { DURATION } from '@/lib/consult/motion'
import { GLOSSARY } from '@/lib/consult/glossary'
import { profileInWords } from '@/lib/consult/profile'
import { EMPTY_ANSWERS } from '@/lib/consult/types'
import { AmpConsult } from '../AmpConsult'
import { WhatsThis } from '../WhatsThis'
import { BREAKER } from '../useAiCopy'
import { chooseRoute, heading, pickFirstOptionAndNext } from './drive'

const reply = (data: unknown) => ({ ok: true, json: async () => data }) as unknown as Response
const copyCalls = () => (global.fetch as jest.Mock).mock.calls.filter(([u]) => String(u) === '/api/consult/copy').length

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetQuizArm()
})

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('V6 lost-signal fallback', () => {
  it('completes a full consult with OpenAI switched off', async () => {
    setQuizArm({ arm: 'v1', consultAi: true })
    global.fetch = jest.fn(async (u: RequestInfo | URL) => reply(String(u) === '/api/consult/copy' ? { unavailable: true } : {})) as typeof fetch
    const onHandoff = jest.fn()
    render(<AmpConsult onHandoff={onHandoff} loadProducts={async () => MOCK_CATALOGUE} />)
    chooseRoute()
    for (let i = 0; i < 12; i++) {
      pickFirstOptionAndNext()
      await settle()
    }
    fireEvent.click(await screen.findByRole('button', { name: 'See my stacks' }, { timeout: DURATION.chargeUp + 2000 }))
    expect(onHandoff).toHaveBeenCalled()
  })

  it(`stops asking after ${BREAKER} misses in a row, and "Tell Amp more" steps aside`, async () => {
    setQuizArm({ arm: 'v1', consultAi: true })
    global.fetch = jest.fn(async () => reply({ fallback: true })) as typeof fetch
    render(<AmpConsult />)
    chooseRoute()
    for (let i = 0; i < 7; i++) {
      pickFirstOptionAndNext()
      await settle()
    }
    expect(copyCalls()).toBe(BREAKER)
    expect(screen.queryByText('Tell Amp more')).toBeNull()
    expect(heading()).toBeInTheDocument()
  })
})

describe('V7 what’s this?', () => {
  it('shows only the approved explanation', () => {
    render(<WhatsThis term="ageing" />)
    fireEvent.click(screen.getByRole('button', { name: 'What’s healthy ageing?' }))
    expect(screen.getByRole('note')).toHaveTextContent(GLOSSARY.ageing.body)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('redirects a medical question to a GP or pharmacist, without sending it', async () => {
    const send = jest.fn()
    render(<WhatsThis term="ageing" questions send={send} />)
    fireEvent.click(screen.getByRole('button', { name: 'What’s healthy ageing?' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Is this ok with my blood pressure tablets?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText(/GP or a pharmacist/)).toBeInTheDocument()
  })

  it('says it has no answer rather than improvising', async () => {
    render(<WhatsThis term="energy" questions send={async () => ({ answer: null })} />)
    fireEvent.click(screen.getByRole('button', { name: 'What’s energy?' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'what’s the weather like' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    })
    expect(screen.getByText(/don’t have an answer/)).toBeInTheDocument()
  })

  it('never takes questions about the circuit check', () => {
    render(<WhatsThis term="circuit-check" questions />)
    fireEvent.click(screen.getByRole('button', { name: 'What’s the circuit check?' }))
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('sits on every goal tile', () => {
    render(<AmpConsult />)
    chooseRoute()
    expect(screen.getAllByRole('button', { name: /^What’s / })).toHaveLength(6)
  })

  it('keeps every approved entry clear of claims and products', () => {
    for (const e of Object.values(GLOSSARY)) {
      expect(e.body).not.toMatch(/\b(cure|treat|prevent|boost|guarantee|mg|creatine|whey|vitamin|magnesium|omega)\b/i)
    }
  })
})

describe('V8 profile in Amp’s words', () => {
  it('restates the answers in a line', () => {
    expect(
      profileInWords({
        ...EMPTY_ANSWERS,
        week: ['gym', 'gym', 'cardio', 'rest', 'gym', 'sport', 'rest'],
        intensity: 'hard',
        sleep: { bed: 1410, wake: 360, quality: 'ok' },
        daylight: 'hardly',
      }),
    ).toBe('You train hard, sleep short and rarely see daylight.')
  })

  it('only ever says what was answered', () => {
    expect(profileInWords(EMPTY_ANSWERS)).toBe('')
    expect(profileInWords({ ...EMPTY_ANSWERS, energy: 2 })).toBe('You run low by the afternoon.')
  })

  it('never mentions health, products or results', () => {
    const line = profileInWords({
      ...EMPTY_ANSWERS,
      week: Array(7).fill('rest'),
      energy: 1,
      sleep: { bed: 120, wake: 300, quality: 'broken' },
      daylight: 'hardly',
      caffeine: { coffee: 5, tea: 0, energy: 1 },
      plate: ['beans'],
      body: ['knees'],
      circuit: { flags: ['heart'], none: false },
    })
    expect(line).not.toMatch(/knee|heart|stack|supplement|will|help|improve/i)
    expect(line.split(',').length + (line.includes(' and ') ? 1 : 0)).toBeLessThanOrEqual(4)
  })
})
