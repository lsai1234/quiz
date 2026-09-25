import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SCENES, resolveSceneDef } from '@/lib/consult/flow'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { HEALTH_DATA_VERSION } from '@/lib/legal/versions'
import { SceneRenderer } from '../scenes/registry'
import { toggleFlag, toggleNone } from '../scenes/CircuitCheck'
import { AmpConsult, offerComfort } from '../AmpConsult'
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
  it('is offered for healthy ageing and older age bands, once, after "about you"', () => {
    const ageing = { ...EMPTY_ANSWERS, goals: ['ageing' as const] }
    expect(offerComfort(ageing, 'about')).toBe(false)
    expect(offerComfort(ageing, 'training')).toBe(true)
    expect(offerComfort({ ...EMPTY_ANSWERS, age: '65-plus' }, 'training')).toBe(true)
    expect(offerComfort({ ...EMPTY_ANSWERS, age: '25-34' }, 'training')).toBe(false)
    expect(offerComfort({ ...ageing, comfortOffered: true }, 'training')).toBe(false)
    expect(offerComfort({ ...ageing, comfort: true }, 'training')).toBe(false)
  })

  it('switches on from the offer and lifts the whole surface', () => {
    const { container } = render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Healthy ageing/ }))
    pressNext()
    fireEvent.click(screen.getByRole('option', { name: '55–64' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Female' }))
    pressNext()
    expect(screen.getByRole('region', { name: 'Comfort mode' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Yes, comfort mode/ }))
    expect(container.querySelector('.amp-consult')).toHaveAttribute('data-comfort', 'true')
    expect(screen.queryByRole('region', { name: 'Comfort mode' })).toBeNull()
  })

  it('can be switched on and off by anyone from the footer', () => {
    const { container } = render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: 'Bigger text' }))
    expect(container.querySelector('.amp-consult')).toHaveAttribute('data-comfort', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Standard size' }))
    expect(container.querySelector('.amp-consult')).toHaveAttribute('data-comfort', 'false')
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
    render(<Harness id="training" comfort start={{ goals: ['performance'], week: ['gym', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest'] }} />)
    expect(screen.getByRole('radiogroup', { name: 'How hard do most sessions feel?' })).toBeInTheDocument()
  })

  it('lays the training week out as one row per day', () => {
    const spy = jest.fn()
    render(<Harness id="training" comfort spy={spy} />)
    fireEvent.click(screen.getAllByRole('radiogroup', { name: 'Wednesday' })[0].querySelectorAll('[role="radio"]')[1])
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ week: ['rest', 'rest', 'gym', 'rest', 'rest', 'rest', 'rest'] }))
  })
})

describe('H1 review screen', () => {
  function toReview() {
    render(<AmpConsult />)
    chooseRoute()
    for (let i = 0; i < 10; i++) pickFirstOptionAndNext()
    expect(heading()).toHaveTextContent("Here's what I've got")
  }

  it('shows every answer as a tappable card, before anything is decided', () => {
    toReview()
    expect(screen.getByText("Tap anything to change it. Nothing's been decided yet.")).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /\. Change$/ })).toHaveLength(10)
    expect(screen.getByRole('button', { name: /^Goals: 1\. Performance\. Change$/ })).toBeInTheDocument()
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
    for (let i = 0; i < 11; i++) pickFirstOptionAndNext()
    expect(heading()).toHaveTextContent('Circuit check')
    expect(container.querySelector('.amp-consult')).toHaveAttribute('data-mode', 'calm')
    expect(screen.getByRole('img', { name: 'Amp, calm' })).toBeInTheDocument()
    expect(screen.queryByText('Tell Amp more')).toBeNull()
  })

  it('is part of every consult, on both routes', () => {
    for (const route of ['speed', 'deep'] as const) {
      const order = SCENES.filter((s) => route === 'deep' || s.speedRun).map((s) => s.id)
      expect(order[order.length - 1]).toBe('circuit')
    }
  })
})
