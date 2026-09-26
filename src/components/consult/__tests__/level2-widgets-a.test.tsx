import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SCENES } from '@/lib/consult/flow'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { SceneRenderer } from '../scenes/registry'
import { GoalTiles, promoteGoal, toggleGoal } from '../scenes/GoalTiles'
import { AGE_BANDS } from '../scenes/AgeWheel'
import { cycleDay, weekSummary } from '../scenes/TrainingWeek'

/** Renders one scene with live answers, as the consult would. */
function Harness({ id, start = {}, comfort = false, spy }: { id: string; start?: Partial<ConsultAnswers>; comfort?: boolean; spy?: (a: ConsultAnswers) => void }) {
  const [answers, setAnswers] = useState<ConsultAnswers>({ ...EMPTY_ANSWERS, ...start })
  const scene = SCENES.find((s) => s.id === id)!
  return (
    <SceneRenderer
      scene={scene}
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

describe('C2 goal tiles', () => {
  const tile = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })

  it('offers six goals', () => {
    render(<Harness id="goals" />)
    expect(screen.getByRole('group', { name: 'Goals, up to three' }).querySelectorAll('button[aria-pressed]')).toHaveLength(6)
  })

  it('numbers goals in the order tapped', () => {
    const spy = jest.fn()
    render(<Harness id="goals" spy={spy} />)
    fireEvent.click(tile('Focus'))
    fireEvent.click(tile('Performance'))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ goals: ['focus', 'performance'] }))
    expect(tile('Focus')).toHaveTextContent('1')
    expect(tile('Performance')).toHaveTextContent('2')
  })

  it('stops at three, and says how to swap', () => {
    const spy = jest.fn()
    render(<Harness id="goals" spy={spy} />)
    for (const g of ['Energy', 'Focus', 'Performance', 'Healthy ageing']) fireEvent.click(tile(g))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ goals: ['energy', 'focus', 'performance'] }))
    expect(screen.getByText('Three is the most. Tap one to swap it out.')).toBeInTheDocument()
  })

  it('keeps the others in order when one is taken out', () => {
    expect(toggleGoal(['energy', 'focus', 'sleep'], 'focus')).toEqual(['energy', 'sleep'])
  })

  it('survives an edit: coming back shows the same priority', () => {
    render(<Harness id="goals" start={{ goals: ['sleep', 'energy'] }} />)
    expect(tile('Sleep & recovery')).toHaveTextContent('1')
    expect(tile('Energy')).toHaveTextContent('2')
  })

  it('reorders without starting over', () => {
    const spy = jest.fn()
    render(<Harness id="goals" start={{ goals: ['sleep', 'energy', 'focus'] }} spy={spy} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move Focus up to number 2' }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ goals: ['sleep', 'focus', 'energy'] }))
    expect(promoteGoal(['a', 'b'] as never, 'a' as never)).toEqual(['a', 'b'])
  })

  it('is registered to write goals only', () => {
    const onAnswer = jest.fn()
    render(
      <GoalTiles scene={SCENES[0]} answers={EMPTY_ANSWERS} onAnswer={onAnswer} comfort={false} order={[]} onEdit={() => undefined} />,
    )
    fireEvent.click(tile('Energy'))
    expect(onAnswer).toHaveBeenCalledWith({ goals: ['energy'] })
  })
})

describe('C3 age wheel', () => {
  it('lists every band, none picked until touched', () => {
    render(<Harness id="about" />)
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Under 18', '18–24', '25–34', '35–44', '45–54', '55–64', '65+'])
    expect(options.every((o) => o.getAttribute('aria-selected') === 'false')).toBe(true)
  })

  it('does not pick a band just because the wheel was placed', () => {
    const spy = jest.fn()
    render(<Harness id="about" spy={spy} />)
    fireEvent.scroll(screen.getByRole('listbox'))
    expect(spy).not.toHaveBeenCalled()
  })

  it('picks a band on tap', () => {
    render(<Harness id="about" />)
    fireEvent.click(screen.getByRole('option', { name: '45–54' }))
    expect(screen.getByRole('option', { name: '45–54' })).toHaveAttribute('aria-selected', 'true')
  })

  it('steps with the keyboard arrows, and stops at the ends', () => {
    const spy = jest.fn()
    render(<Harness id="about" start={{ age: 'under-18' }} spy={spy} />)
    const wheel = screen.getByRole('listbox', { name: 'Age band' })
    fireEvent.keyDown(wheel, { key: 'ArrowUp' })
    expect(spy).not.toHaveBeenCalled()
    fireEvent.keyDown(wheel, { key: 'ArrowDown' })
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ age: '18-24' }))
    fireEvent.keyDown(wheel, { key: 'End' })
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ age: '65-plus' }))
  })

  it('asks sex as a three-way toggle that keeps the age', () => {
    const spy = jest.fn()
    render(<Harness id="about" start={{ age: '35-44' }} spy={spy} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Male' }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ age: '35-44', sex: 'male' }))
  })

  it('becomes plain large buttons in comfort mode', () => {
    render(<Harness id="about" comfort />)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Age band' }).querySelectorAll('[role="radio"]')).toHaveLength(AGE_BANDS.length)
  })
})

describe('C4 training week', () => {
  const day = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })

  it('cycles rest → gym → cardio → sport → rest', () => {
    expect(['rest', 'gym', 'cardio', 'sport'].map((d) => cycleDay(d as never))).toEqual(['gym', 'cardio', 'sport', 'rest'])
  })

  it('shows seven days, and a live summary as you tap', () => {
    render(<Harness id="training" />)
    expect(screen.getByRole('group', { name: 'Your training week' }).querySelectorAll('button')).toHaveLength(7)
    fireEvent.click(day('Monday'))
    fireEvent.click(day('Wednesday'))
    fireEvent.click(day('Saturday'))
    fireEvent.click(day('Saturday'))
    fireEvent.click(day('Saturday'))
    expect(screen.getByText('3 sessions · 2 Gym · 1 Sport')).toBeInTheDocument()
    expect(day('Saturday')).toHaveAccessibleName('Saturday: Sport. Tap to change.')
  })

  it('captures a full week in a handful of taps', () => {
    const spy = jest.fn()
    render(<Harness id="training" spy={spy} />)
    // Mon gym, Tue cardio, Thu gym, Sat sport: seven taps.
    fireEvent.click(day('Monday'))
    fireEvent.click(day('Tuesday'))
    fireEvent.click(day('Tuesday'))
    fireEvent.click(day('Thursday'))
    for (let i = 0; i < 3; i++) fireEvent.click(day('Saturday'))
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ week: ['gym', 'cardio', 'rest', 'gym', 'rest', 'sport', 'rest'] }),
    )
  })

  it('answers a rest week without tapping every day', () => {
    const spy = jest.fn()
    render(<Harness id="training" spy={spy} />)
    fireEvent.click(screen.getByRole('button', { name: 'No training right now' }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ week: Array(7).fill('rest') }))
  })

  it('summarises a week in words', () => {
    expect(weekSummary(['gym', 'rest', 'gym', 'rest', 'gym', 'cardio', 'sport'])).toBe('5 sessions · 3 Gym · 1 Cardio · 1 Sport')
    expect(weekSummary(Array(7).fill('rest'))).toBe('Rest week')
  })
})
