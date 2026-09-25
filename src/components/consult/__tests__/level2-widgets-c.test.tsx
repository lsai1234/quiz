import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SCENES } from '@/lib/consult/flow'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { SceneRenderer } from '../scenes/registry'
import { MAX_PER_DRINK } from '../scenes/CupCounter'
import { readPlate } from '../scenes/PlatePicker'
import { SPOTS, toggleSpot } from '../scenes/BodyMap'

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

describe('C8 cup counter', () => {
  it('stacks coffees, teas and energy drinks separately', () => {
    const spy = jest.fn()
    render(<Harness id="caffeine" spy={spy} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a coffee' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a coffee' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a tea' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add an energy drink' }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ caffeine: { coffee: 2, tea: 1, energy: 1 } }))
  })

  it('shows the count as cups and as a big number', () => {
    const { container } = render(<Harness id="caffeine" start={{ caffeine: { coffee: 2, tea: 1, energy: 0 } }} />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('drinks a day')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-cup]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-cup="tea"]')).toHaveLength(1)
  })

  it('says stimulants stay out at four or more', () => {
    render(<Harness id="caffeine" start={{ caffeine: { coffee: 3, tea: 0, energy: 0 } }} />)
    expect(screen.queryByText(/keep anything with caffeine out/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add a tea' }))
    expect(screen.getByText(/keep anything with caffeine out/)).toBeInTheDocument()
  })

  it('answers "none" in one tap, and never goes below zero', () => {
    const spy = jest.fn()
    render(<Harness id="caffeine" spy={spy} />)
    expect(screen.getByRole('button', { name: 'Remove a coffee' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ caffeine: { coffee: 0, tea: 0, energy: 0 } }))
  })

  it('stops adding at a sensible ceiling', () => {
    render(<Harness id="caffeine" start={{ caffeine: { coffee: MAX_PER_DRINK, tea: 0, energy: 0 } }} />)
    expect(screen.getByRole('button', { name: 'Add a coffee' })).toBeDisabled()
  })
})

describe('C9 plate picker', () => {
  it('offers a grid of foods to tap', () => {
    render(<Harness id="food" />)
    expect(screen.getByRole('group', { name: 'Foods you eat most weeks' }).querySelectorAll('button')).toHaveLength(10)
  })

  it('toggles foods on and off', () => {
    const spy = jest.fn()
    render(<Harness id="food" spy={spy} />)
    fireEvent.click(screen.getByRole('button', { name: /^Eggs/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Fruit/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Eggs/ }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ plate: ['fruit'] }))
  })

  it('goes back to unanswered when everything is untapped', () => {
    const spy = jest.fn()
    render(<Harness id="food" start={{ plate: ['eggs'] }} spy={spy} />)
    fireEvent.click(screen.getByRole('button', { name: /^Eggs/ }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ plate: null }))
  })

  it('spots a plate with no oily fish', () => {
    expect(readPlate(['poultry', 'eggs'])).toEqual({ plantBased: false, noOilyFish: true })
    render(<Harness id="food" start={{ plate: ['poultry'] }} />)
    expect(screen.getByText('No oily fish most weeks. Noted.')).toBeInTheDocument()
  })

  it('spots a fully plant-based plate', () => {
    expect(readPlate(['beans', 'greens', 'nuts'])).toEqual({ plantBased: true, noOilyFish: true })
    render(<Harness id="food" start={{ plate: ['beans', 'greens'] }} />)
    expect(screen.getByText('Fully plant-based. Noted.')).toBeInTheDocument()
  })

  it('reads nothing into an empty plate', () => {
    expect(readPlate([])).toEqual({ plantBased: false, noOilyFish: false })
  })
})

describe('C10 body map', () => {
  it('has tappable spots for neck, shoulders, back, hips and knees', () => {
    const { container } = render(<Harness id="body" />)
    const spots = new Set([...container.querySelectorAll('[data-spot]')].map((b) => b.getAttribute('data-spot')))
    expect([...spots]).toEqual(SPOTS)
  })

  it('toggles a spot from the figure', () => {
    const spy = jest.fn()
    const { container } = render(<Harness id="body" spy={spy} />)
    fireEvent.click(container.querySelector('[data-spot="knees"]')!)
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ body: ['knees'] }))
  })

  it('treats both sides of a paired joint as one spot', () => {
    const spy = jest.fn()
    const { container } = render(<Harness id="body" spy={spy} />)
    const [left, right] = container.querySelectorAll('[data-spot="shoulders"]')
    fireEvent.click(left)
    fireEvent.click(right)
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ body: [] }))
  })

  it('gives screen readers and keyboards a simple list, and hides the figure from them', () => {
    const { container } = render(<Harness id="body" />)
    const list = screen.getByRole('group', { name: 'Stiff or sore spots' })
    expect(list.querySelectorAll('button')).toHaveLength(5)
    for (const b of container.querySelectorAll('[data-spot]')) {
      expect(b.closest('[aria-hidden="true"]')).not.toBeNull()
      expect(b).toHaveAttribute('tabindex', '-1')
    }
  })

  it('makes every spot a full-size target', () => {
    const { container } = render(<Harness id="body" />)
    for (const b of container.querySelectorAll<HTMLElement>('[data-spot]')) {
      expect(b.style.width).toBe('var(--amp-target)')
      expect(b.style.height).toBe('var(--amp-target)')
    }
  })

  it('swaps the figure for large buttons in comfort mode', () => {
    const { container } = render(<Harness id="body" comfort />)
    expect(container.querySelector('[data-spot]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Knees' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('says a blank map means all good', () => {
    render(<Harness id="body" />)
    expect(screen.getByText('Nothing tapped: all good')).toBeInTheDocument()
    expect(toggleSpot(null, 'hips')).toEqual(['hips'])
  })
})
