import { fireEvent, render, screen } from '@testing-library/react'
import { AmpConsult } from '../AmpConsult'
import { ChargeProfileChart } from '../ChargeProfileChart'
import { chooseRoute, heading, pickFirstOptionAndNext, pressNext } from './drive'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

function toCircuit() {
  render(<AmpConsult onExit={jest.fn()} />)
  chooseRoute()
  for (let i = 0; i < 11; i++) pickFirstOptionAndNext()
  expect(heading()).toHaveTextContent('Circuit check')
}

describe('H3 stop & signpost screens', () => {
  it('pauses kindly for pregnancy and points to a midwife, GP or pharmacist', () => {
    toCircuit()
    fireEvent.click(screen.getByRole('checkbox', { name: /^Use my answers here/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Pregnant, breastfeeding or trying' }))
    pressNext()
    expect(heading()).toHaveTextContent('Let’s pause here')
    expect(screen.getByRole('status')).toHaveTextContent(/midwife, GP or pharmacist/)
    expect(screen.queryByText(/charge profile/i)).toBeNull()
  })

  it('pauses for a kidney or liver condition and points to a GP', () => {
    toCircuit()
    fireEvent.click(screen.getByRole('checkbox', { name: /^Use my answers here/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Kidney or liver condition' }))
    pressNext()
    expect(screen.getByRole('status')).toHaveTextContent(/GP/)
  })

  it('lets them go back if a switch was tapped by mistake', () => {
    toCircuit()
    fireEvent.click(screen.getByRole('checkbox', { name: /^Use my answers here/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Kidney or liver condition' }))
    pressNext()
    fireEvent.click(screen.getByRole('button', { name: 'I tapped something by mistake' }))
    expect(heading()).toHaveTextContent('Circuit check')
  })

  it('is calm: circuit-check mode, Amp still', () => {
    toCircuit()
    fireEvent.click(screen.getByRole('button', { name: 'I’d rather not answer these' }))
    expect(document.querySelector('.amp-consult')).toHaveAttribute('data-mode', 'calm')
    expect(screen.getByRole('img', { name: 'Amp, calm' })).toBeInTheDocument()
  })

  it('declining the circuit check stops with no stack, and offers the shop', () => {
    toCircuit()
    fireEvent.click(screen.getByRole('button', { name: 'I’d rather not answer these' }))
    expect(heading()).toHaveTextContent('That’s completely fine')
    expect(screen.getByRole('link', { name: 'Browse the shop' })).toHaveAttribute('href', '/shop')
  })
})

describe('H5 charge profile chart', () => {
  const profile = { training: 100, energy: 40, sleep: 52, daylight: 15, nutrition: 50, recovery: 68 }

  it('says every score in words, for small screens and screen readers', () => {
    render(<ChargeProfileChart profile={profile} />)
    expect(screen.getByRole('img', { name: 'Your charge profile: Training 100, Energy 40, Sleep 52, Daylight 15, Nutrition 50, Recovery 68' })).toBeInTheDocument()
    for (const v of Object.values(profile)) expect(screen.getByText(String(v))).toBeInTheDocument()
  })

  it('draws the shape from the scores', () => {
    const { container } = render(<ChargeProfileChart profile={profile} grow={false} />)
    const points = container.querySelector('[data-profile-shape] polygon')!.getAttribute('points')!.split(' ')
    expect(points).toHaveLength(6)
    // Training at 100 sits on the outer ring, straight up from the centre.
    expect(points[0]).toBe('180,58')
  })
})
