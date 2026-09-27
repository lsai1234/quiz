import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SCENES, initialFlow, isAnswered } from '@/lib/consult/flow'
import { forStorage } from '@/lib/consult/persist'
import { summariseForCopy } from '@/lib/consult/ai/copy'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { HEALTH_DATA_VERSION, TAILOR_CONSENT_VERSION } from '@/lib/legal/versions'
import { SceneRenderer } from '../scenes/registry'
import { toggleSymptom } from '../scenes/CircuitCheck'

function Harness({ id, start = {}, comfort = false, spy }: { id: string; start?: Partial<ConsultAnswers>; comfort?: boolean; spy?: (a: ConsultAnswers) => void }) {
  const [answers, setAnswers] = useState<ConsultAnswers>({ ...EMPTY_ANSWERS, ...start })
  return (
    <SceneRenderer
      scene={SCENES.find((s) => s.id === id)!}
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

const CONSENT = { accepted: true as const, version: HEALTH_DATA_VERSION, at: 'x' }

describe('the Weight loss goal card', () => {
  it('is a seventh goal that opens to an optional medication switch when picked', () => {
    const spy = jest.fn()
    render(<Harness id="goals" spy={spy} />)
    expect(screen.queryByRole('switch', { name: /weight-loss injections or tablets/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Weight loss/ }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ goals: ['weight'] }))
    fireEvent.click(screen.getByRole('switch', { name: /weight-loss injections or tablets/ }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ circuit: { flags: ['weight-meds'], none: false } }))
  })

  it('takes the medication answer away with the goal', () => {
    const spy = jest.fn()
    render(<Harness id="goals" spy={spy} start={{ goals: ['weight'], circuit: { flags: ['weight-meds'], none: false } }} />)
    fireEvent.click(screen.getByRole('button', { name: /^Weight loss/ }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ goals: [], circuit: null }))
  })

  it('offers Yes and No buttons in comfort mode', () => {
    render(<Harness id="goals" comfort start={{ goals: ['weight'] }} />)
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    expect(screen.getByRole('radio', { name: 'No' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('weight-loss medication on the circuit check', () => {
  it('arrives already on from the goal card, and says so', () => {
    render(<Harness id="circuit" start={{ goals: ['weight'], circuit: { flags: ['weight-meds'], none: false } }} />)
    const sw = screen.getByRole('checkbox', { name: /^Weight-loss medication/ })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(sw).toHaveTextContent('You mentioned this on the first screen.')
  })

  it('asks for a second consent before any symptom, and only then shows the symptoms', () => {
    const spy = jest.fn()
    render(<Harness id="circuit" spy={spy} start={{ healthConsent: CONSENT, circuit: { flags: ['weight-meds'], none: false } }} />)
    expect(screen.queryByRole('group', { name: 'Since starting weight-loss medication' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: /^Use this to tailor my recommendations/ }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ tailorConsent: expect.objectContaining({ accepted: true, version: TAILOR_CONSENT_VERSION }) }))
    fireEvent.click(screen.getByRole('button', { name: /^Nausea/ }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ symptoms: ['nausea'] }))
  })

  it('switching medication off drops the tailoring and symptoms with it', () => {
    const spy = jest.fn()
    render(
      <Harness
        id="circuit"
        spy={spy}
        start={{ healthConsent: CONSENT, circuit: { flags: ['weight-meds'], none: false }, tailorConsent: CONSENT, symptoms: ['nausea'] }}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /^Weight-loss medication/ }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ tailorConsent: null, symptoms: null }))
  })

  it('needs the symptoms answered only when tailoring was opted in to', () => {
    const base = { ...EMPTY_ANSWERS, healthConsent: CONSENT, circuit: { flags: ['weight-meds' as const], none: false } }
    expect(isAnswered('circuit', base)).toBe(true)
    expect(isAnswered('circuit', { ...base, tailorConsent: CONSENT })).toBe(false)
    expect(isAnswered('circuit', { ...base, tailorConsent: CONSENT, symptoms: [] })).toBe(true)
    expect(toggleSymptom(['nausea'], 'none')).toEqual([])
    expect(toggleSymptom([], 'tiredness')).toEqual(['tiredness'])
  })
})

describe('weight-loss medication stays private', () => {
  const answers: ConsultAnswers = {
    ...EMPTY_ANSWERS,
    goals: ['weight'],
    healthConsent: CONSENT,
    circuit: { flags: ['weight-meds'], none: false },
    tailorConsent: CONSENT,
    symptoms: ['nausea', 'constipation'],
  }

  it('is never saved to the device', () => {
    const saved = JSON.stringify(forStorage({ ...initialFlow('c_test0001', 0, { route: 'deep' }), answers, sceneId: 'review' }))
    expect(saved).not.toMatch(/weight-meds|nausea|constipation|tailorConsent":\{/)
  })

  it('is never in what the AI is told', () => {
    expect(summariseForCopy(answers)).not.toMatch(/medication|jab|nausea|constipation|weight-meds/i)
  })
})
