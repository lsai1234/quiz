import { fireEvent, render, screen } from '@testing-library/react'
import { AmpConsult } from '../AmpConsult'
import { SCENES } from '@/lib/consult/flow'
import { chooseRoute, heading, pickFirstOptionAndNext } from './drive'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('AmpConsult', () => {
  it('opens on the route choice, then the goals scene', () => {
    render(<AmpConsult />)
    expect(heading()).toHaveTextContent('How much time have you got?')
    chooseRoute()
    expect(heading()).toHaveTextContent('What are you after?')
    expect(screen.getByText('1/12 · Goals')).toBeInTheDocument()
  })

  it('clicks through every scene to the end on scripted answers', () => {
    const onComplete = jest.fn()
    render(<AmpConsult onComplete={onComplete} />)
    chooseRoute()
    const seen: string[] = []
    for (let i = 0; i < 12; i++) {
      seen.push(heading().textContent ?? '')
      pickFirstOptionAndNext()
    }
    expect(seen).toEqual(SCENES.map((s) => s.copy.question))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(heading()).toHaveTextContent("Everything's in")
  })

  it('moves focus to the new question on a scene change', () => {
    render(<AmpConsult />)
    pickFirstOptionAndNext()
    expect(document.activeElement).toBe(heading())
    expect(heading()).toHaveTextContent('A bit about you')
  })

  it('shows Amp reacting to the previous answer', () => {
    render(<AmpConsult />)
    pickFirstOptionAndNext()
    expect(screen.getByText('Performance first. Got it.')).toBeInTheDocument()
  })

  it('slides forward, then back', () => {
    const { container } = render(<AmpConsult />)
    pickFirstOptionAndNext()
    expect(container.querySelector('[data-scene]')).toHaveAttribute('data-direction', 'forward')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(container.querySelector('[data-scene]')).toHaveAttribute('data-direction', 'back')
    expect(heading()).toHaveTextContent('What are you after?')
  })

  it('backs out of the first scene to the route choice, and from there to wherever it came from', () => {
    const onExit = jest.fn()
    render(<AmpConsult onExit={onExit} />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(heading()).toHaveTextContent('How much time have you got?')
    expect(onExit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onExit).toHaveBeenCalled()
  })

  it('switches to calm mode for the circuit check', () => {
    const { container } = render(<AmpConsult />)
    for (let i = 0; i < 11; i++) pickFirstOptionAndNext()
    expect(heading()).toHaveTextContent('Circuit check')
    expect(container.querySelector('.amp-consult')).toHaveAttribute('data-mode', 'calm')
    expect(screen.queryByText('Tell Amp more')).toBeNull()
  })
})

describe('save & resume', () => {
  it('returns to the same scene with answers intact after a refresh', () => {
    const first = render(<AmpConsult />)
    pickFirstOptionAndNext()
    pickFirstOptionAndNext()
    expect(heading()).toHaveTextContent('Map your training week')
    first.unmount()

    render(<AmpConsult />)
    expect(heading()).toHaveTextContent('Map your training week')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('option', { name: '18–24' })).toHaveAttribute('aria-selected', 'true')
  })

  it('offers to resume when coming back in a new tab', () => {
    const first = render(<AmpConsult />)
    pickFirstOptionAndNext()
    first.unmount()
    sessionStorage.clear()

    render(<AmpConsult />)
    expect(heading()).toHaveTextContent('Pick up where you left off?')
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(heading()).toHaveTextContent('A bit about you')
  })

  it('starts fresh when asked, and forgets the old consult', () => {
    const first = render(<AmpConsult />)
    pickFirstOptionAndNext()
    first.unmount()
    sessionStorage.clear()

    render(<AmpConsult />)
    fireEvent.click(screen.getByRole('button', { name: 'Start fresh' }))
    chooseRoute()
    expect(heading()).toHaveTextContent('What are you after?')
    expect(screen.getByRole('button', { name: /^Performance/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not offer to resume a consult that never got past the first scene', () => {
    const first = render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }))
    first.unmount()
    sessionStorage.clear()
    render(<AmpConsult />)
    expect(heading()).not.toHaveTextContent('Pick up where you left off?')
  })
})

describe('Amp', () => {
  it('is on screen from the first scene, idle', () => {
    render(<AmpConsult />)
    expect(screen.getByRole('img', { name: 'Amp, idle' })).toBeInTheDocument()
  })

  it('watches as you answer', () => {
    render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }))
    expect(screen.getByRole('img', { name: 'Amp, watching' })).toBeInTheDocument()
  })

  it('goes calm for the circuit check', () => {
    render(<AmpConsult />)
    for (let i = 0; i < 11; i++) pickFirstOptionAndNext()
    expect(screen.getByRole('img', { name: 'Amp, calm' })).toBeInTheDocument()
  })

  it('is charged once everything is in', () => {
    render(<AmpConsult />)
    for (let i = 0; i < 12; i++) pickFirstOptionAndNext()
    expect(screen.getByRole('img', { name: 'Amp, charged' })).toBeInTheDocument()
  })
})
