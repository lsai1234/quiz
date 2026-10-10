import { act, fireEvent, render, screen } from '@testing-library/react'
import { useQuizStore } from '@/lib/store'
import { GOALS_DATA, WELLBEING_DATA } from '@/lib/quiz-goals'
import { emptyInterview } from '@/lib/quiz-v2/types'
import { Act1Hero, HERO_GOALS, PICK_BEAT_MS } from '../Act1Hero'

/**
 * The hero asks the quiz's first question, so what matters is the handoff: a
 * tap here has to arrive in either quiz as that same answer, on the goals
 * screen, with nothing asked twice.
 */

beforeEach(() => {
  localStorage.clear()
  useQuizStore.getState().reset()
})

const hero = (props: Partial<React.ComponentProps<typeof Act1Hero>> = {}) => {
  const onEnterQuiz = jest.fn()
  render(<Act1Hero onEnterQuiz={onEnterQuiz} reducedMotion {...props} />)
  return onEnterQuiz
}

describe('the goals on the front page', () => {
  it('are the quiz’s own goals, in the quiz’s own words', () => {
    const quiz = new Map([...GOALS_DATA, ...WELLBEING_DATA].map((g) => [g.id, g.label]))
    hero()
    for (const g of HERO_GOALS) {
      expect(screen.getByRole('button', { name: quiz.get(g.id) })).toBeInTheDocument()
    }
  })

  it('open the track whose grid each goal lives in', () => {
    const wellbeing = new Set(WELLBEING_DATA.map((g) => g.id))
    for (const g of HERO_GOALS) {
      expect(g.track).toBe(wellbeing.has(g.id) ? 'wellbeing' : 'performance')
    }
  })

  it('give both halves of the audience the same number of answers', () => {
    const tracks = HERO_GOALS.map((g) => g.track)
    expect(tracks.filter((t) => t === 'performance')).toHaveLength(tracks.length / 2)
  })
})

describe('tapping a goal', () => {
  it('starts the quiz with that goal chosen and its track set', () => {
    const onEnterQuiz = hero()
    fireEvent.click(screen.getByRole('button', { name: 'Sleep better' }))
    expect(onEnterQuiz).toHaveBeenCalledTimes(1)
    const { answers } = useQuizStore.getState()
    expect(answers.track).toBe('wellbeing')
    expect(answers.goals).toEqual(['sleep-better'])
    expect(answers.primaryGoal).toBe('sleep-better')
  })

  it('starts from the top, not from wherever a previous run stopped', () => {
    const s = useQuizStore.getState()
    s.setStep(5)
    s.setAnswer('track', 'performance')
    s.setGoals(['muscle', 'energy'])
    s.setAnswer('wellbeingAnswers', { sleep: 'falling' } as never)
    s.setInterview(emptyInterview(10))

    hero()
    fireEvent.click(screen.getByRole('button', { name: 'Less stress' }))

    const after = useQuizStore.getState()
    expect(after.step).toBe(0)
    expect(after.interview).toBeNull()
    expect(after.answers.goals).toEqual(['less-stress'])
    expect(after.answers.wellbeingAnswers).toEqual({})
  })

  it('lets the charge land before the quiz takes over, and only once', () => {
    jest.useFakeTimers()
    try {
      const onEnterQuiz = hero({ reducedMotion: false })
      const muscle = screen.getByRole('button', { name: 'Build muscle' })
      fireEvent.click(muscle)
      expect(muscle).toHaveAttribute('data-state', 'picked')
      expect(screen.getByRole('button', { name: 'Get lean' })).toHaveAttribute('data-state', 'other')

      // A second tap mid-pour changes nothing.
      fireEvent.click(screen.getByRole('button', { name: 'Get lean' }))
      expect(useQuizStore.getState().answers.goals).toEqual(['muscle'])

      expect(onEnterQuiz).not.toHaveBeenCalled()
      act(() => { jest.advanceTimersByTime(PICK_BEAT_MS) })
      expect(onEnterQuiz).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('does not wait under reduced motion', () => {
    const onEnterQuiz = hero({ reducedMotion: true })
    fireEvent.click(screen.getByRole('button', { name: 'Get lean' }))
    expect(onEnterQuiz).toHaveBeenCalledTimes(1)
  })
})

describe('the way past the eight', () => {
  it('opens the quiz on its own chooser, with nothing chosen', () => {
    useQuizStore.getState().setAnswer('track', 'performance')
    const onEnterQuiz = hero({ reducedMotion: false })
    fireEvent.click(screen.getByRole('button', { name: /See every goal/ }))
    expect(onEnterQuiz).toHaveBeenCalledTimes(1)
    expect(useQuizStore.getState().answers.track).toBeNull()
    expect(useQuizStore.getState().answers.goals).toEqual([])
  })

  it('still offers the shop to somebody who came for one tub', () => {
    hero()
    expect(screen.getByRole('link', { name: /browse the whole shop/i })).toHaveAttribute('href', '/shop')
  })
})
