import { fireEvent, render, screen, within } from '@testing-library/react'
import { trainingDays } from '@/lib/consult/training'
import { useState } from 'react'
import { SCENES, resolveSceneDef } from '@/lib/consult/flow'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { HEALTH_DATA_VERSION } from '@/lib/legal/versions'
import { SceneRenderer } from '../scenes/registry'
import { toggleFlag, toggleNone } from '../scenes/CircuitCheck'
import { AmpConsult, autoComfort } from '../AmpConsult'
import { chooseRoute, heading, pickFirstOptionAndNext, pressNext } from './drive'

function Harness({ id, start = {}, comfort = false, spy }: { id: string; start?: Partial<ConsultAnswers>; comfort?: boolean; spy?: (a: ConsultAnswers) => void }) {
  const [answers, setAnswers] = useState<ConsultAnswers>({ ...EMPTY_ANSWERS, ...start })
  return (
    <SceneRenderer
      scene={resolveSceneDef(id as never, answers)}
      answers={answers}
      comfort={comfort}
      order={SCENES.map((s) => s.id)}
      onEdit={() => undefined}
      onAnswer={(patch) => {
        const next = { ...answers, ...patch }
        setAnswers(next)
        spy?.(next)
      }}
    />
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('C14 comfort mode', () => {
  it('switches itself on for 65 and over, and 55 to 64 with healthy ageing, and no one else', () => {
    expect(autoComfort({ ...EMPTY_ANSWERS, age: '65-plus' })).toBe(true)
    expect(autoComfort({ ...EMPTY_ANSWERS, age: '55-64', goals: ['ageing'] })).toBe(true)
    expect(autoComfort({ ...EMPTY_ANSWERS, age: '55-64', goals: ['performance'] })).toBe(false)
    expect(autoComfort({ ...EMPTY_ANSWERS, age: '25-34', goals: ['ageing'] })).toBe(false)
  })

  it('lifts the whole surface after the age answer, says so once, and can be put back', () => {
    const { container } = render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Healthy ageing/ }))
    pressNext()
    expect(screen.queryByRole('button', { name: 'Bigger text' })).toBeNull()
    fireEvent.click(screen.getByRole('option', { name: '55–64' }))
    expect(container.querySelector('.amp-consult')).toHaveAttribute('data-comfort', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Female' }))
    pressNext()
    expect(screen.getByText(/made everything a little bigger/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Standard size' }))
    expect(container.querySelector('.amp-consult')).toHaveAttribute('data-comfort', 'false')
  })

  it('isn’t advertised to anyone else', () => {
    render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Performance/ }))
    pressNext()
    fireEvent.click(screen.getByRole('option', { name: '25–34' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Male' }))
    pressNext()
    expect(screen.queryByRole('button', { name: /Bigger text|Standard size/ })).toBeNull()
    expect(screen.queryByText(/made everything a little bigger/)).toBeNull()
  })

  it.each(['about', 'body'])('swaps the fiddly %s widget for big buttons', (id) => {
    const { container } = render(<Harness id={id} comfort />)
    expect(container.querySelector('[role="listbox"], [data-spot]')).toBeNull()
  })

  it('swaps the drags for buttons: energy, sleep and daylight', () => {
    const spy = jest.fn()
    const energy = render(<Harness id="energy" comfort spy={spy} />)
    expect(screen.queryByRole('slider')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More energy' }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ energy: 5 }))
    energy.unmount()

    const sleep = render(<Harness id="sleep" comfort spy={spy} />)
    expect(screen.queryByRole('slider')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Bedtime earlier' }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ sleep: expect.objectContaining({ bed: 22 * 60 + 30 }) }))
    sleep.unmount()

    render(<Harness id="daylight" comfort spy={spy} />)
    expect(screen.queryByRole('slider')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /^Every day/ }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ daylight: 'daily' }))
  })

  it('keeps the performance detail in comfort mode', () => {
    render(<Harness id="training" comfort start={{ goals: ['performance'], training: trainingDays(['gym', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest']) }} />)
    expect(screen.getByRole('radiogroup', { name: 'How hard do most sessions feel?' })).toBeInTheDocument()
  })

  it('lays the training week out as one row per day, more than one thing allowed', () => {
    const spy = jest.fn()
    render(<Harness id="training" comfort spy={spy} />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Wednesday' })).getByRole('button', { name: /^Gym/ }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ training: trainingDays(['rest', 'rest', 'gym', 'rest', 'rest', 'rest', 'rest']) }))
  })
})

describe('H1 review screen', () => {
  function toReview() {
    render(<AmpConsult />)
    chooseRoute()
    // Ten scenes, then the circuit check, then the review (plan v4).
    for (let i = 0; i < 11; i++) pickFirstOptionAndNext()
    expect(heading()).toHaveTextContent("Here's what I've got")
  }

  it('shows every answer as a tappable card, before anything is decided', () => {
    toReview()
    expect(screen.getByText("Tap anything to change it. Nothing's been decided yet.")).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /\. Change$/ })).toHaveLength(11)
    expect(screen.getByRole('button', { name: /^Goals: 1\. Performance\. Change$/ })).toBeInTheDocument()
    // The safety answers are on the review now it comes last.
    expect(screen.getByRole('button', { name: /^Circuit check: None of these apply\. Change$/ })).toBeInTheDocument()
  })

  it('edits one answer and comes back with everything else intact', () => {
    toReview()
    const before = screen.getAllByRole('button', { name: /\. Change$/ }).map((b) => b.getAttribute('aria-label'))
    fireEvent.click(screen.getByRole('button', { name: /^Energy:/ }))
    expect(heading()).toHaveTextContent("How's your energy most afternoons?")
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' })
    fireEvent.click(screen.getByRole('button', { name: 'Back to review' }))
    expect(heading()).toHaveTextContent("Here's what I've got")
    const after = screen.getAllByRole('button', { name: /\. Change$/ }).map((b) => b.getAttribute('aria-label'))
    expect(after.filter((l) => !l!.startsWith('Energy'))).toEqual(before.filter((l) => !l!.startsWith('Energy')))
    expect(after.find((l) => l!.startsWith('Energy'))).toBe('Energy: 10 / 10. Change')
  })
})

describe('H2 circuit check', () => {
  it('asks for explicit consent before a single answer is collected', () => {
    const spy = jest.fn()
    render(<Harness id="circuit" spy={spy} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Blood-thinning medicine' }))
    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByText('Tick the line above first, then these switch on.')).toBeInTheDocument()
  })

  it('records consent with the health notice version, then takes answers', () => {
    const spy = jest.fn()
    render(<Harness id="circuit" spy={spy} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /^Use my answers here/ }))
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ healthConsent: expect.objectContaining({ accepted: true, version: HEALTH_DATA_VERSION }) }),
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Blood-thinning medicine' }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ circuit: { flags: ['blood-thinners'], none: false } }))
  })

  it('drops the answers if consent is withdrawn', () => {
    const spy = jest.fn()
    render(
      <Harness
        id="circuit"
        start={{ healthConsent: { accepted: true, version: HEALTH_DATA_VERSION, at: 'x' }, circuit: { flags: ['heart'], none: false } }}
        spy={spy}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /^Use my answers here/ }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ healthConsent: null, circuit: null }))
  })

  it('makes "None of these" exclusive', () => {
    expect(toggleNone({ flags: ['heart'], none: false })).toEqual({ flags: [], none: true })
    expect(toggleFlag({ flags: [], none: true }, 'heart')).toEqual({ flags: ['heart'], none: false })
  })

  it('runs in calm mode, with Amp calm and no "Tell Amp more"', () => {
    const { container } = render(<AmpConsult />)
    chooseRoute()
    for (let i = 0; i < 10; i++) pickFirstOptionAndNext()
    expect(heading()).toHaveTextContent('Circuit check')
    expect(container.querySelector('.amp-consult')).toHaveAttribute('data-mode', 'calm')
    expect(screen.getByRole('img', { name: 'Amp, calm' })).toBeInTheDocument()
    expect(screen.queryByText(/Tell Amp/)).toBeNull()
  })

  it('is part of every consult, on both routes, just before the review', () => {
    for (const route of ['speed', 'deep'] as const) {
      const order = SCENES.filter((s) => route === 'deep' || s.speedRun).map((s) => s.id)
      expect(order.slice(-2)).toEqual(['circuit', 'review'])
    }
  })
})
