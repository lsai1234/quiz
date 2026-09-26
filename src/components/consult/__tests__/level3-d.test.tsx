import { act, fireEvent, render, screen } from '@testing-library/react'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { withoutExcluded } from '@/lib/consult/exclusions'
import { DURATION } from '@/lib/consult/motion'
import { forgetFinished } from '@/lib/consult/session'
import { useQuizStore } from '@/lib/store'
import { Act1Hero } from '@/components/scroll/Act1Hero'
import { ConsultNote } from '@/components/stack-review/ConsultNote'
import { AmpConsult } from '../AmpConsult'
import { chooseRoute, heading, pickFirstOptionAndNext, pressNext } from './drive'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  forgetFinished()
  useQuizStore.getState().reset()
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response) as typeof fetch
})

describe('H9 exclusions carry into extras', () => {
  const bloodThinners = { consultId: 'c_x00001', excluded: ['fish-oil', 'vitamin-k', 'ginkgo', 'turmeric', 'rx-interaction'] as const, pharmacistNote: true }

  it('can’t offer omega-3 after "blood thinners"', () => {
    const offered = withoutExcluded(MOCK_CATALOGUE, { ...bloodThinners, excluded: [...bloodThinners.excluded] })
    expect(offered.find((p) => p.id === 'chrgd-omega-3')).toBeUndefined()
    expect(offered.find((p) => p.id === 'chrgd-vitamin-d3-k2')).toBeUndefined()
    expect(offered.find((p) => p.id === 'chrgd-menopause-complete')).toBeUndefined()
    expect(offered.find((p) => p.id === 'chrgd-whey-protein')).toBeDefined()
  })

  it('leaves a quiz stack’s extras alone', () => {
    expect(withoutExcluded(MOCK_CATALOGUE, null)).toHaveLength(MOCK_CATALOGUE.length)
  })

  it('keeps the pharmacist note on the results page', () => {
    render(<ConsultNote exclusions={{ ...bloodThinners, excluded: [...bloodThinners.excluded] }} />)
    expect(screen.getByRole('note')).toHaveTextContent(/pharmacist/)
  })

  it('carries the exclusions from the consult into the store the results page reads', async () => {
    jest.useFakeTimers()
    render(<AmpConsult loadProducts={async () => MOCK_CATALOGUE} />)
    chooseRoute()
    for (let i = 0; i < 11; i++) pickFirstOptionAndNext()
    fireEvent.click(screen.getByRole('checkbox', { name: /^Use my answers here/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Blood-thinning medicine' }))
    pressNext()
    await act(async () => {
      await Promise.resolve()
    })
    const ex = useQuizStore.getState().consultExclusions
    expect(ex?.excluded).toEqual(expect.arrayContaining(['fish-oil', 'vitamin-k']))
    expect(ex?.pharmacistNote).toBe(true)
    jest.useRealTimers()
  })
})

describe('H10 change my answers', () => {
  it('links from the results page back to the review', () => {
    render(<ConsultNote exclusions={{ consultId: 'c_x00001', excluded: [], pharmacistNote: false }} />)
    expect(screen.getByRole('link', { name: 'Change my answers' })).toHaveAttribute('href', '/quizv2?review=1')
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('round-trips: reopens the review with every answer, and hands back an updated stack', async () => {
    jest.useFakeTimers()
    const first = render(<AmpConsult loadProducts={async () => MOCK_CATALOGUE} onHandoff={jest.fn()} />)
    chooseRoute()
    for (let i = 0; i < 12; i++) pickFirstOptionAndNext()
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      jest.advanceTimersByTime(DURATION.chargeUp)
    })
    fireEvent.click(screen.getByRole('button', { name: 'See my stacks' }))
    const before = useQuizStore.getState().stackBlueprint!.id
    first.unmount()

    const onHandoff = jest.fn()
    render(<AmpConsult reopen loadProducts={async () => MOCK_CATALOGUE} onHandoff={onHandoff} />)
    expect(heading()).toHaveTextContent("Here's what I've got")
    const cards = screen.getAllByRole('button', { name: /\. Change$/ })
    expect(cards).toHaveLength(10)
    expect(cards.every((c) => !/not answered/.test(c.getAttribute('aria-label') ?? ''))).toBe(true)

    pressNext()
    // The circuit check kept its answers for this session.
    expect(heading()).toHaveTextContent('Circuit check')
    expect(screen.getByRole('switch', { name: 'None of these' })).toHaveAttribute('aria-checked', 'true')
    pressNext()
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      jest.advanceTimersByTime(DURATION.chargeUp)
    })
    fireEvent.click(screen.getByRole('button', { name: 'See my stacks' }))
    expect(onHandoff).toHaveBeenCalledTimes(1)
    // The same consult, updated — not a new one.
    expect(useQuizStore.getState().stackBlueprint!.id).toBe(before)
    jest.useRealTimers()
  })
})

describe('H11 the hero honours the rollout', () => {
  const hero = (offer: 'quiz-only' | 'both' | 'consult-only') =>
    render(<Act1Hero onEnterQuiz={jest.fn()} onEnterConsult={jest.fn()} offer={offer} reducedMotion />)

  it('offers both by default', () => {
    render(<Act1Hero onEnterQuiz={jest.fn()} onEnterConsult={jest.fn()} reducedMotion />)
    expect(screen.getByText('Everyday wellness')).toBeInTheDocument()
    expect(screen.getByTestId('enter-consult')).toBeInTheDocument()
  })

  it('hides the consult when switched off', () => {
    hero('quiz-only')
    expect(screen.queryByTestId('enter-consult')).toBeNull()
    expect(screen.getByText('Performance + wellness')).toBeInTheDocument()
  })

  it('shows the consult alone on its side of a split', () => {
    hero('consult-only')
    expect(screen.getByTestId('enter-consult')).toBeInTheDocument()
    expect(screen.queryByText('Everyday wellness')).toBeNull()
  })
})
