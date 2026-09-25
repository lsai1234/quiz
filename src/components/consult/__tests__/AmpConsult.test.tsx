import { fireEvent, render, screen } from '@testing-library/react'
import { AmpConsult } from '../AmpConsult'
import { SCENES } from '@/lib/consult/flow'

function heading() {
  return screen.getByRole('heading', { level: 1 })
}

function pickFirstOptionAndNext() {
  const scene = SCENES.find((s) => s.copy.question === heading().textContent)
  const first = scene?.placeholder?.options[0]
  if (first) fireEvent.click(screen.getByRole(scene.placeholder!.multi ? 'button' : 'radio', { name: first.label }))
  const next = screen.getAllByRole('button').find((b) => /^(Next|Looks right|Continue|Back to review)$/.test(b.textContent ?? ''))!
  fireEvent.click(next)
}

describe('AmpConsult', () => {
  it('opens on the goals scene', () => {
    render(<AmpConsult />)
    expect(heading()).toHaveTextContent('What are you after?')
    expect(screen.getByText('1/12 · Goals')).toBeInTheDocument()
  })

  it('clicks through every scene to the end on scripted answers', () => {
    const onComplete = jest.fn()
    render(<AmpConsult onComplete={onComplete} />)
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

  it('backs out of the first scene to wherever it came from', () => {
    const onExit = jest.fn()
    render(<AmpConsult onExit={onExit} />)
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
