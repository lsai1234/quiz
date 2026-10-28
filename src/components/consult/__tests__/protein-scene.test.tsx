import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { ProteinScene } from '../scenes/ProteinScene'
import { resolveSceneDef } from '@/lib/consult/flow'
import { trainingDays } from '@/lib/consult/training'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'

/** The protein check on screen (Phase 5 proposal 2): v2's three doors, the consult's controls. */
const START: ConsultAnswers = { ...EMPTY_ANSWERS, route: 'deep', goals: ['performance'], age: '25-34', training: trainingDays(['gym', 'rest', 'gym', 'rest', 'gym', 'rest', 'rest']) }

function Harness() {
  const [answers, setAnswers] = useState(START)
  return <ProteinScene scene={resolveSceneDef('protein', answers)} answers={answers} onAnswer={(p) => setAnswers((a) => ({ ...a, ...p }))} comfort={false} order={[]} onEdit={() => {}} />
}

const verdict = () => document.querySelector('[data-protein-verdict]')!

it('shows no target before the estimate, then the number against their range', () => {
  render(<Harness />)
  expect(screen.getByText('You lift, which moves your number up.')).toBeInTheDocument()
  expect(verdict().textContent).toBe('')
  fireEvent.click(screen.getByRole('button', { name: '75–90kg' }))
  expect(verdict().textContent).toBe('')
  fireEvent.click(screen.getByRole('radio', { name: /^Not much until dinner/ }))
  expect(verdict()).toHaveTextContent('About 55g a day · your range 130–180g')
  expect(verdict()).toHaveTextContent('About 75g under the range for your size and training.')
})

it('goes without a number when the weight is skipped', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('radio', { name: /^Three normal meals/ }))
  expect(verdict()).toHaveTextContent('About 75g a day. Add your weight above and I’ll put a number on it.')
})

it('counts a day one meal at a time, and a meal can be asked again', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: '75–90kg' }))
  fireEvent.click(screen.getByRole('button', { name: 'Count it instead, meal by meal' }))
  expect(screen.getByText('What does breakfast usually look like?')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: 'Eggs, yoghurt or similar' }))
  expect(screen.getByText('And lunch?')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Breakfast: Eggs, yoghurt or similar' }))
  expect(screen.getByText('What does breakfast usually look like?')).toBeInTheDocument()
  for (const pick of ['A shake', 'Chicken, fish or similar', 'Meat or fish, decent size', 'Nuts, cheese or yoghurt']) fireEvent.click(screen.getByRole('radio', { name: pick }))
  expect(verdict()).toHaveTextContent('About 110g a day · your range 130–180g')
  fireEvent.click(screen.getByRole('radio', { name: 'Bigger than most' }))
  expect(verdict()).toHaveTextContent('About 130g a day')
  expect(verdict()).toHaveTextContent('That’s in your range.')
})

it('takes "I honestly have no idea" as an answer, with nothing to compare', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('radio', { name: 'I honestly have no idea' }))
  expect(screen.getByRole('radio', { name: 'I honestly have no idea' })).toHaveAttribute('aria-checked', 'true')
  expect(verdict().textContent).toBe('')
})
