import { act, fireEvent, render, screen } from '@testing-library/react'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { DURATION } from '@/lib/consult/motion'
import { initialFlow, type FlowState } from '@/lib/consult/flow'
import { useQuizStore } from '@/lib/store'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { Analysis } from '../Analysis'
import { AmpConsult } from '../AmpConsult'
import { chooseRoute, pickFirstOptionAndNext } from './drive'

const answers: ConsultAnswers = {
  ...EMPTY_ANSWERS,
  route: 'deep',
  goals: ['performance', 'sleep'],
  age: '35-44',
  sex: 'male',
  week: ['gym', 'rest', 'gym', 'rest', 'gym', 'cardio', 'sport'],
  intensity: 'steady',
  energy: 4,
  sleep: { bed: 1380, wake: 360, quality: 'broken' },
  daylight: 'hardly',
  caffeine: { coffee: 2, tea: 0, energy: 0 },
  plate: ['red-meat', 'poultry', 'eggs', 'fruit'],
  body: [],
  shelf: ['creatine'],
  circuit: { flags: ['blood-thinners'], none: false },
  healthConsent: { accepted: true, version: 'x', at: 'x' },
}

const state: FlowState = { ...initialFlow('c_analysis0001', 0, answers), phase: 'analysis', sceneId: 'circuit' }

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  jest.useFakeTimers()
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response) as typeof fetch
})

afterEach(() => {
  jest.useRealTimers()
})

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('H6 analysis & charge-up', () => {
  it('finishes the charge-up in under 4 seconds', () => {
    expect(DURATION.chargeUp).toBeLessThan(4000)
  })

  it('grows the profile and ticks off four steps, then is fully charged', async () => {
    render(<Analysis state={state} onDone={jest.fn()} onBack={jest.fn()} loadProducts={async () => MOCK_CATALOGUE} />)
    await flush()
    expect(screen.getByRole('img', { name: /Your charge profile/ })).toBeInTheDocument()
    const steps = () => screen.getByRole('list', { name: 'Analysis steps' }).querySelectorAll('li')
    expect(steps()).toHaveLength(4)
    expect(screen.getByText(/Reading 11 answers/)).toBeInTheDocument()
    act(() => {
      jest.advanceTimersByTime(DURATION.chargeUp)
    })
    expect(screen.getByRole('heading', { name: 'Fully charged' })).toBeInTheDocument()
  })

  it('never shows a blank screen: a slow catalogue keeps the last step working', async () => {
    let release: (v: typeof MOCK_CATALOGUE) => void = () => undefined
    const slow = () => new Promise<typeof MOCK_CATALOGUE>((r) => (release = r))
    render(<Analysis state={state} onDone={jest.fn()} onBack={jest.fn()} loadProducts={slow} />)
    act(() => {
      jest.advanceTimersByTime(DURATION.chargeUp * 2)
    })
    expect(screen.getByText('Building three stacks')).toBeInTheDocument()
    expect(screen.getByText(/Building three stacks/).textContent).toMatch(/working/)
    expect(screen.queryByRole('heading', { name: 'Fully charged' })).toBeNull()
    await act(async () => release(MOCK_CATALOGUE))
    expect(screen.getByRole('heading', { name: 'Fully charged' })).toBeInTheDocument()
  })

  it('preloads the results page’s data while it animates', async () => {
    render(<Analysis state={state} onDone={jest.fn()} onBack={jest.fn()} loadProducts={async () => MOCK_CATALOGUE} />)
    await flush()
    const store = useQuizStore.getState()
    expect(store.stackReady).toBe(true)
    expect(store.stackBlueprint?.id).toBe('c_analysis0001')
    expect(store.identity?.name).toBe('Peak Protocol')
  })

  it('shows the three stacks and what was kept out, then hands over', async () => {
    const onDone = jest.fn()
    render(<Analysis state={state} onDone={onDone} onBack={jest.fn()} loadProducts={async () => MOCK_CATALOGUE} />)
    await flush()
    act(() => {
      jest.advanceTimersByTime(DURATION.chargeUp)
    })
    expect(screen.getByText('Essentials')).toBeInTheDocument()
    expect(screen.getByText('Standard')).toBeInTheDocument()
    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Kept out and skipped' })).toHaveTextContent(/blood thinners/)
    fireEvent.click(screen.getByRole('button', { name: 'See my stacks' }))
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ consult_id: 'c_analysis0001' }) }))
  })

  it('saves the payload against the consult ID, on the device and the server', async () => {
    render(<Analysis state={state} onDone={jest.fn()} onBack={jest.fn()} loadProducts={async () => MOCK_CATALOGUE} />)
    await flush()
    expect(localStorage.getItem('chrgd-consult-handoff')).toMatch(/c_analysis0001/)
    expect(global.fetch).toHaveBeenCalledWith('/api/consult', expect.objectContaining({ method: 'POST' }))
  })

  it('says so calmly when the shop can’t be reached, and can try again', async () => {
    let calls = 0
    const flaky = async () => {
      calls++
      if (calls === 1) throw new Error('offline')
      return MOCK_CATALOGUE
    }
    render(<Analysis state={state} onDone={jest.fn()} onBack={jest.fn()} loadProducts={flaky} />)
    await flush()
    expect(screen.getByText(/couldn’t reach the shop/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await flush()
    act(() => {
      jest.advanceTimersByTime(DURATION.chargeUp)
    })
    expect(screen.getByRole('heading', { name: 'Fully charged' })).toBeInTheDocument()
  })
})

describe('the consult, end to end', () => {
  it('runs from the route choice to the handoff', async () => {
    const onHandoff = jest.fn()
    render(<AmpConsult onHandoff={onHandoff} loadProducts={async () => MOCK_CATALOGUE} />)
    chooseRoute()
    for (let i = 0; i < 12; i++) pickFirstOptionAndNext()
    await flush()
    act(() => {
      jest.advanceTimersByTime(DURATION.chargeUp)
    })
    fireEvent.click(screen.getByRole('button', { name: 'See my stacks' }))
    expect(onHandoff).toHaveBeenCalledTimes(1)
    expect(useQuizStore.getState().stackBlueprint?.slots.length).toBeGreaterThan(0)
  })
})
