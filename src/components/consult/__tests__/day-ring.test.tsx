import { act, render, screen } from '@testing-library/react'
import { DayRing } from '../DayRing'
import { AmpConsult } from '../AmpConsult'
import { initialFlow } from '@/lib/consult/flow'
import { trainingDays } from '@/lib/consult/training'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { answerCurrentScene, pressNext } from './drive'

/** The day ring on screen (plan Phase 7.3). */
const A: ConsultAnswers = {
  ...EMPTY_ANSWERS,
  sleep: { bed: 23 * 60, wake: 7 * 60, quality: 'ok' },
  caffeine: { coffee: 3, tea: 0, energy: 0 },
  training: trainingDays(['gym', 'rest', 'gym', 'rest', 'gym', 'rest', 'rest']),
  daylight: 'hardly',
  energy: 6,
}

it('draws a mark for each answer, each its own flight slot, and says the ring in words', () => {
  render(<DayRing answers={A} />)
  const ring = screen.getByRole('img', { name: /^Your day: sleep 23:00 to 07:00, 3 caffeinated drinks a day/ })
  for (const slot of ['sleep', 'caffeine', 'training', 'daylight', 'energy']) expect([slot, ring.querySelector(`[data-flight-slot="${slot}"]`)]).not.toEqual([slot, null])
  // Three cups as a tally; three training days of seven filled.
  expect(ring.querySelectorAll('[data-flight-slot="caffeine"] circle')).toHaveLength(3)
  expect(ring.querySelectorAll('[data-flight-slot="training"] circle')).toHaveLength(7)
})

it('plots nothing it hasn’t been told', () => {
  render(<DayRing answers={{ ...EMPTY_ANSWERS, energy: 3 }} />)
  const ring = screen.getByRole('img')
  expect(ring.querySelectorAll('[data-flight-slot]')).toHaveLength(1)
  expect(ring).toHaveAccessibleName('Your day: afternoon energy 3 out of 10')
})

it('in its larger size, labels the hours and lists the day beside it', () => {
  render(<DayRing answers={A} size="lg" />)
  expect(screen.getByText('00')).toBeInTheDocument()
  expect(screen.getByText('18')).toBeInTheDocument()
  expect(screen.getByRole('list', { name: 'Your day, in words' })).toHaveTextContent('Sleep 23:00 to 07:00')
  expect(screen.getByRole('list', { name: 'Your day, in words' })).toHaveTextContent('Hardly any daylight')
})

it('sits round Amp in the consult, filling in as they answer', async () => {
  const state = { ...initialFlow('c_ring', 0, { goals: ['energy'], age: '35-44', comfortOffered: true }), sceneId: 'sleep' as const, history: ['goals' as const, 'about' as const] }
  render(<AmpConsult initial={state} />)
  await act(async () => new Promise((r) => setTimeout(r, 0)))
  expect(document.querySelector('[data-day-ring="sm"]')).not.toBeNull()
  answerCurrentScene()
  expect(screen.getByRole('img', { name: /^Your day: sleep / })).toBeInTheDocument()
  pressNext()
  expect(document.querySelector('[data-day-ring="sm"] [data-flight-slot="sleep"]')).not.toBeNull()
})

it('keeps the circuit check calm: Amp on his own, no ring', async () => {
  const state = { ...initialFlow('c_ring', 0, { ...A, goals: ['energy'], age: '35-44', comfortOffered: true }), sceneId: 'circuit' as const, history: ['goals' as const] }
  render(<AmpConsult initial={state} />)
  await act(async () => new Promise((r) => setTimeout(r, 0)))
  expect(document.querySelector('[data-day-ring]')).toBeNull()
})
