import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { CupCounter } from '../scenes/CupCounter'
import { sceneDef } from '@/lib/consult/flow'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'

/** The cups as a physical stack (plan Phase 7.6). */
function Harness({ start }: { start: ConsultAnswers['caffeine'] }) {
  const [answers, setAnswers] = useState<ConsultAnswers>({ ...EMPTY_ANSWERS, caffeine: start })
  return <CupCounter scene={sceneDef('caffeine')} answers={answers} onAnswer={(p) => setAnswers((a) => ({ ...a, ...p }))} comfort={false} order={[]} onEdit={() => {}} />
}

const cup = (key: string, i: number) => document.querySelectorAll<HTMLElement>(`[data-stack="${key}"] [data-cup]`)[i]

it('stacks each drink on its own, the cups already there sitting still', () => {
  render(<Harness start={{ coffee: 3, tea: 1, energy: 0 }} />)
  expect(document.querySelectorAll('[data-stack]')).toHaveLength(2)
  expect(document.querySelectorAll('[data-stack="coffee"] [data-cup]')).toHaveLength(3)
  expect(cup('coffee', 2).style.transform).toBe('')
})

it('drops a new cup in from above, and it settles', () => {
  jest.useFakeTimers()
  try {
    render(<Harness start={{ coffee: 3, tea: 0, energy: 0 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a coffee' }))
    expect(cup('coffee', 3).style.transform).toMatch(/^translateY\(-\d/)
    act(() => {
      jest.advanceTimersByTime(1500)
    })
    expect(cup('coffee', 3).style.transform).toMatch(/^(translateY\(0(\.0)?px\))?$/)
  } finally {
    jest.useRealTimers()
  }
})

describe('under reduced motion', () => {
  const original = window.matchMedia
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...original(q), matches: q.includes('reduce') })) as typeof window.matchMedia
  })
  afterEach(() => {
    window.matchMedia = original
  })

  it('puts the cup straight in its place', () => {
    render(<Harness start={{ coffee: 3, tea: 0, energy: 0 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a coffee' }))
    expect(cup('coffee', 3).style.transform).toBe('')
  })
})
