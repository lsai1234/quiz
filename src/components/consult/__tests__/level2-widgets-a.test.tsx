import { fireEvent, render, screen } from '@testing-library/react'
import { trainingAverage, trainingDays } from '@/lib/consult/training'
import { useState } from 'react'
import { SCENES } from '@/lib/consult/flow'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { SceneRenderer } from '../scenes/registry'
import { GoalTiles, promoteGoal, toggleGoal } from '../scenes/GoalTiles'
import { AGE_BANDS } from '../scenes/AgeWheel'
import { trainingSummary } from '../scenes/TrainingWeek'
import { setDay } from './drive'

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

  it('offers seven goals', () => {
    render(<Harness id="goals" />)
    expect(screen.getByRole('group', { name: 'Goals, up to three' }).querySelectorAll('button[aria-pressed]')).toHaveLength(7)
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

describe('C3 about you (age bands as buttons, the clarity pass)', () => {
  const bands = () => [...screen.getByRole('radiogroup', { name: 'Age band' }).querySelectorAll<HTMLElement>('[role="radio"]')]

  it('lists every band, none picked until tapped', () => {
    render(<Harness id="about" />)
    expect(bands().map((o) => o.textContent)).toEqual(['Under 18', '18–24', '25–34', '35–44', '45–54', '55–64', '65+'])
    expect(bands().every((o) => o.getAttribute('aria-checked') === 'false')).toBe(true)
    // No spinning drum: nothing that looks answered before it is.
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('picks a band on tap', () => {
    render(<Harness id="about" />)
    fireEvent.click(screen.getByRole('radio', { name: '45–54' }))
    expect(screen.getByRole('radio', { name: '45–54' })).toHaveAttribute('aria-checked', 'true')
  })

  it('moves with the arrow keys, as a radio group does', () => {
    const spy = jest.fn()
    render(<Harness id="about" start={{ age: 'under-18' }} spy={spy} />)
    const first = screen.getByRole('radio', { name: 'Under 18' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ age: '18-24' }))
  })

  it('asks sex as a three-way toggle that keeps the age', () => {
    const spy = jest.fn()
    render(<Harness id="about" start={{ age: '35-44' }} spy={spy} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Male' }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ age: '35-44', sex: 'male' }))
  })

  it('is two to a row in comfort mode', () => {
    render(<Harness id="about" comfort />)
    expect(bands()).toHaveLength(AGE_BANDS.length)
    expect(screen.getByRole('radiogroup', { name: 'Age band' }).className).toMatch(/grid-cols-2/)
  })
})

describe('C4 training week', () => {
  const day = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}:`) })

  it('shows seven days, and a live summary as you set them', () => {
    render(<Harness id="training" />)
    expect(screen.getByRole('group', { name: 'Your training week' }).querySelectorAll('button')).toHaveLength(7)
    setDay('Monday', 'Gym')
    setDay('Wednesday', 'Gym')
    setDay('Saturday', 'Sport')
    expect(screen.getByText('3 sessions · 2 Gym · 1 Sport')).toBeInTheDocument()
    expect(day('Saturday')).toHaveAccessibleName('Saturday: Sport. Tap to change.')
  })

  it('takes more than one thing on a day: gym in the morning, sport at night', () => {
    const spy = jest.fn()
    render(<Harness id="training" spy={spy} />)
    setDay('Tuesday', 'Gym')
    setDay('Tuesday', 'Sport')
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ training: expect.objectContaining({ mode: 'days', days: [[], ['gym', 'sport'], [], [], [], [], []] }) }))
    expect(day('Tuesday')).toHaveAccessibleName('Tuesday: Gym and Sport. Tap to change.')
    expect(screen.getByText('2 sessions · 1 Gym · 1 Sport')).toBeInTheDocument()
  })

  it('answers a rest week without tapping every day', () => {
    const spy = jest.fn()
    render(<Harness id="training" spy={spy} />)
    fireEvent.click(screen.getByRole('button', { name: 'No training right now' }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ training: trainingDays(Array(7).fill('rest')) }))
  })

  it('takes an average when weeks vary, starting from the days already set', () => {
    const spy = jest.fn()
    render(<Harness id="training" spy={spy} />)
    setDay('Monday', 'Gym')
    setDay('Thursday', 'Gym')
    fireEvent.click(screen.getByRole('radio', { name: 'It varies' }))
    expect(screen.queryByRole('group', { name: 'Your training week' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More cardio sessions' }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ training: expect.objectContaining({ mode: 'average', average: { gym: 2, cardio: 1, sport: 0 } }) }))
    expect(screen.getByText('About 3 a week · 2 Gym · 1 Cardio')).toBeInTheDocument()
  })

  it('summarises a week in words', () => {
    expect(trainingSummary(trainingDays(['gym', 'rest', 'gym', 'rest', 'gym', 'cardio', 'sport']))).toBe('5 sessions · 3 Gym · 1 Cardio · 1 Sport')
    expect(trainingSummary(trainingDays(Array(7).fill('rest')))).toBe('No training right now')
    expect(trainingSummary(trainingAverage({ gym: 2.5, sport: 1 }))).toBe('About 3.5 a week · 2.5 Gym · 1 Sport')
  })
})
