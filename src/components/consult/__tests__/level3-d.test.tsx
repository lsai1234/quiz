import { act, fireEvent, render, screen } from '@testing-library/react'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { pharmacistNoteFor, withoutExcluded } from '@/lib/consult/exclusions'
import { PERSONAS } from '@/lib/consult/personas'
import { runStackEngine } from '@/lib/consult/engine'
import { stopReason } from '@/lib/consult/circuit'
import { DURATION } from '@/lib/consult/motion'
import { forgetFinished } from '@/lib/consult/session'
import { handoffToRestore, restoreResultsPage } from '@/lib/consult/results'
import { CHANGE_ANSWERS_HASH } from '@/lib/consult/results-tab'
import { resetQuizArm, setQuizArm } from '@/lib/experiments/client'
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
    for (let i = 0; i < 10; i++) pickFirstOptionAndNext()
    fireEvent.click(screen.getByRole('checkbox', { name: /^Use my answers here/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Yes, some do' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Blood-thinning medicine' }))
    pressNext()
    // Then the review, which is last now.
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
    expect(cards).toHaveLength(12)
    expect(cards.every((c) => !/not answered/.test(c.getAttribute('aria-label') ?? ''))).toBe(true)
    // The circuit check kept its answers for this session, so the review can
    // go straight on: it's the last screen now.
    expect(screen.getByRole('button', { name: /^Circuit check: None of these apply/ })).toBeInTheDocument()
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

describe('Phase 1: the note and the link, for customers', () => {
  afterEach(() => resetQuizArm())

  it('says prescription medicine for the prescription rules, and names weight-loss medication for its own', () => {
    const { rerender } = render(<ConsultNote exclusions={{ consultId: 'c_x00001', excluded: ['rx-interaction', 'vitamin-k'], pharmacistNote: true }} />)
    expect(screen.getByRole('note')).toHaveTextContent(/You told us you take prescription medicine, so/)
    expect(screen.getByRole('note')).not.toHaveTextContent(/weight-loss/)

    rerender(<ConsultNote exclusions={{ consultId: 'c_x00001', excluded: ['fat-burner', 'stimulant'], pharmacistNote: true }} />)
    expect(screen.getByRole('note')).toHaveTextContent(/You told us you’re using weight-loss medication/)
    expect(screen.getByRole('note')).not.toHaveTextContent(/prescription medicine/)

    rerender(<ConsultNote exclusions={{ consultId: 'c_x00001', excluded: ['fat-burner', 'rx-interaction', 'stimulant'], pharmacistNote: true }} />)
    expect(screen.getByRole('note')).toHaveTextContent(/prescription medicine, including weight-loss medication/)
  })

  it('words the note for the medicine each persona actually named', () => {
    for (const p of PERSONAS) {
      if (stopReason(p.answers)) continue
      const engine = runStackEngine(p.answers, MOCK_CATALOGUE)
      if (!engine.flags.pharmacistNote) continue
      const flags = p.answers.circuit?.flags ?? []
      const rx = flags.includes('blood-thinners') || flags.includes('other-prescription')
      const weight = flags.includes('weight-meds')
      expect([p.id, pharmacistNoteFor(engine.excludedIngredients)]).toEqual([p.id, rx && weight ? 'both' : weight ? 'weight-meds' : 'prescription'])
    }
  })

  it('sends a customer back into the consult on this page, never to the founder-gated /quizv2', () => {
    setQuizArm({ arm: 'v1', heroOffer: 'both', resolved: true })
    render(<ConsultNote exclusions={{ consultId: 'c_x00001', excluded: [], pharmacistNote: false }} />)
    expect(screen.getByRole('link', { name: 'Change my answers' })).toHaveAttribute('href', CHANGE_ANSWERS_HASH)
  })
})

describe('Phase 1: a hard reload on the results page', () => {
  it('rebuilds the stack, the exclusions and the pharmacist note from the saved handoff', async () => {
    jest.useFakeTimers()
    const first = render(<AmpConsult loadProducts={async () => MOCK_CATALOGUE} onHandoff={jest.fn()} />)
    chooseRoute()
    for (let i = 0; i < 10; i++) pickFirstOptionAndNext()
    fireEvent.click(screen.getByRole('checkbox', { name: /^Use my answers here/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Yes, some do' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Blood-thinning medicine' }))
    pressNext()
    pressNext()
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      jest.advanceTimersByTime(DURATION.chargeUp)
    })
    fireEvent.click(screen.getByRole('button', { name: 'See my stacks' }))
    const before = useQuizStore.getState()
    const stack = before.stackBlueprint!.slots.map((s) => s.selectedProductId)
    first.unmount()
    jest.useRealTimers()

    // The reload: the store keeps only what it persists.
    const answers = before.answers
    useQuizStore.setState({ stackBlueprint: null, consultExclusions: null, identity: null, stackReady: false })
    expect(answers.consultExcluded).toEqual(expect.arrayContaining(['vitamin-k']))

    const payload = handoffToRestore()
    expect(payload).not.toBeNull()
    restoreResultsPage(payload!, MOCK_CATALOGUE)
    const after = useQuizStore.getState()
    expect(after.stackBlueprint!.slots.map((s) => s.selectedProductId)).toEqual(stack)
    expect(after.consultExclusions).toMatchObject({ pharmacistNote: true, excluded: expect.arrayContaining(['vitamin-k', 'fish-oil']) })
  })

  it('never rebuilds a consult’s results for a quiz taken since, or in another tab', () => {
    sessionStorage.setItem('chrgd-consult-results', 'c_x00001')
    useQuizStore.setState({ answers: { ...useQuizStore.getState().answers, answerSource: 'quiz' } as never })
    expect(handoffToRestore()).toBeNull()
    sessionStorage.clear()
    expect(handoffToRestore()).toBeNull()
  })
})

describe('H11 the hero honours the rollout', () => {
  const hero = (offer: 'quiz-only' | 'both' | 'consult-only') =>
    render(<Act1Hero onEnterQuiz={jest.fn()} onEnterConsult={jest.fn()} offer={offer} reducedMotion />)

  it('offers the quiz only by default, as the home page did before the consult', () => {
    render(<Act1Hero onEnterQuiz={jest.fn()} onEnterConsult={jest.fn()} reducedMotion />)
    expect(screen.getByText('Everyday wellness')).toBeInTheDocument()
    expect(screen.queryByTestId('enter-consult')).toBeNull()
    expect(screen.getByText('What’s your goal?')).toBeInTheDocument()
  })

  it('offers both when the rollout says so', () => {
    hero('both')
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
