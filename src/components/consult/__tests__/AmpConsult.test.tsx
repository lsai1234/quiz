import { act, fireEvent, render, screen } from '@testing-library/react'
import { AmpConsult } from '../AmpConsult'
import { SCENES, initialFlow, resolveSceneDef, visibleScenes } from '@/lib/consult/flow'
import { EMPTY_ANSWERS } from '@/lib/consult/types'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { SHORT_LINK, answerCurrentScene, chooseRoute, heading, pickFirstOptionAndNext, pressNext } from './drive'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('AmpConsult', () => {
  it('opens straight on the goals scene, with the 1-minute version one tap away (plan Phase 6)', () => {
    render(<AmpConsult />)
    expect(heading()).toHaveTextContent('What are you after?')
    expect(screen.getByText('1/13 · Goals')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Speed run/ })).toBeNull()
    expect(screen.getByRole('button', { name: SHORT_LINK })).toBeInTheDocument()
  })

  it('takes the 1-minute version from scene one, and offers it nowhere else', () => {
    render(<AmpConsult />)
    chooseRoute('Speed run')
    expect(heading()).toHaveTextContent('What are you after?')
    expect(screen.getByText(/^1\/(\d+) · Goals$/).textContent).not.toBe('1/13 · Goals')
    expect(screen.queryByRole('button', { name: SHORT_LINK })).toBeNull()
    pickFirstOptionAndNext()
    expect(screen.queryByRole('button', { name: SHORT_LINK })).toBeNull()
  })

  it('clicks through every scene to the end on scripted answers', () => {
    const onComplete = jest.fn()
    render(<AmpConsult onComplete={onComplete} loadProducts={async () => MOCK_CATALOGUE} />)
    chooseRoute()
    const seen: string[] = []
    for (let i = 0; i < 12; i++) {
      seen.push(heading().textContent ?? '')
      pickFirstOptionAndNext()
    }
    // As the driver's young builder sees it: a builder's wording, the aim
    // answered along with training, and no "what's got harder" (that's for over-55s).
    const builder = { ...EMPTY_ANSWERS, route: 'deep' as const, goals: ['performance' as const], age: '18-24' as const }
    expect(seen).toEqual(visibleScenes(builder).filter((id) => id !== 'aim' && id !== 'protein').map((id) => resolveSceneDef(id, builder).copy.question))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(heading()).toHaveTextContent('Your charge profile')
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
    pickFirstOptionAndNext()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(heading()).toHaveTextContent('What are you after?')
    expect(onExit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onExit).toHaveBeenCalled()
  })

  it('switches to calm mode for the circuit check', () => {
    const { container } = render(<AmpConsult />)
    for (let i = 0; i < 10; i++) pickFirstOptionAndNext()
    expect(heading()).toHaveTextContent('Circuit check')
    expect(container.querySelector('.amp-consult')).toHaveAttribute('data-mode', 'calm')
    expect(screen.queryByText(/Tell Amp/)).toBeNull()
  })
})

describe('save & resume', () => {
  it('returns to the same scene with answers intact after a refresh', () => {
    const first = render(<AmpConsult />)
    pickFirstOptionAndNext()
    pickFirstOptionAndNext()
    expect(heading()).toHaveTextContent('What’s your training split?')
    first.unmount()

    render(<AmpConsult />)
    expect(heading()).toHaveTextContent('What’s your training split?')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('option', { name: '18–24' })).toHaveAttribute('aria-selected', 'true')
  })

  it('offers to resume when coming back in a new tab', () => {
    const first = render(<AmpConsult />)
    pickFirstOptionAndNext()
    first.unmount()
    sessionStorage.clear()

    render(<AmpConsult />)
    expect(heading()).toHaveTextContent('Pick up where you left off?')
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(heading()).toHaveTextContent('A bit about you')
  })

  it('starts fresh when asked, and forgets the old consult', () => {
    const first = render(<AmpConsult />)
    pickFirstOptionAndNext()
    first.unmount()
    sessionStorage.clear()

    render(<AmpConsult />)
    fireEvent.click(screen.getByRole('button', { name: 'Start fresh' }))
    chooseRoute()
    expect(heading()).toHaveTextContent('What are you after?')
    expect(screen.getByRole('button', { name: /^Performance/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not offer to resume a consult that never got past the first scene', () => {
    const first = render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }))
    first.unmount()
    sessionStorage.clear()
    render(<AmpConsult />)
    expect(heading()).not.toHaveTextContent('Pick up where you left off?')
  })
})

describe('Amp', () => {
  it('is on screen from the first scene, idle', () => {
    render(<AmpConsult />)
    expect(screen.getByRole('img', { name: 'Amp, idle' })).toBeInTheDocument()
  })

  it('watches as you answer', () => {
    render(<AmpConsult />)
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }))
    expect(screen.getByRole('img', { name: 'Amp, watching' })).toBeInTheDocument()
  })

  it('goes calm for the circuit check', () => {
    render(<AmpConsult />)
    for (let i = 0; i < 10; i++) pickFirstOptionAndNext()
    expect(screen.getByRole('img', { name: 'Amp, calm' })).toBeInTheDocument()
  })

  it('is charged once everything is in', async () => {
    render(<AmpConsult loadProducts={async () => MOCK_CATALOGUE} />)
    for (let i = 0; i < 12; i++) pickFirstOptionAndNext()
    expect(await screen.findByRole('img', { name: 'Amp, charged' }, { timeout: 5000 })).toBeInTheDocument()
  })
})

describe('the phone’s back gesture (plan Phase 6)', () => {
  /** The browser's back: what a back swipe sends the page. */
  const gesture = () => act(() => void window.dispatchEvent(new PopStateEvent('popstate', { state: null })))

  it('adds one browser history entry per screen, and the gesture goes back a screen', () => {
    render(<AmpConsult />)
    const start = window.history.length
    pickFirstOptionAndNext()
    pickFirstOptionAndNext()
    expect(window.history.length).toBe(start + 2)
    expect(heading()).toHaveTextContent('What’s your training split?')
    gesture()
    expect(heading()).toHaveTextContent('A bit about you')
    gesture()
    expect(heading()).toHaveTextContent('What are you after?')
    // Scene one: nothing of ours left, so the next gesture leaves the page.
    gesture()
    expect(heading()).toHaveTextContent('What are you after?')
  })

  it('keeps the Back button and the gesture in step', async () => {
    render(<AmpConsult />)
    pickFirstOptionAndNext()
    pickFirstOptionAndNext()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(heading()).toHaveTextContent('A bit about you')
    // The Back button took its entry off the browser's history too (jsdom
    // delivers that pop a moment later): it is not read as a second Back.
    await act(async () => new Promise((r) => setTimeout(r, 20)))
    expect(heading()).toHaveTextContent('A bit about you')
    gesture()
    expect(heading()).toHaveTextContent('What are you after?')
  })

  it('leaves the history alone for a fixed-state run (the workshop, tests)', () => {
    const start = window.history.length
    render(<AmpConsult initial={initialFlow('c', 0)} />)
    pickFirstOptionAndNext()
    expect(window.history.length).toBe(start)
  })
})

describe('shared-element flights (plan Phase 7.1)', () => {
  const animate = jest.fn(() => ({ finished: new Promise(() => {}) }) as unknown as Animation)
  beforeEach(() => {
    animate.mockClear()
    ;(Element.prototype as unknown as { animate: unknown }).animate = animate
  })
  afterEach(() => {
    delete (Element.prototype as { animate?: unknown }).animate
    document.querySelectorAll('.amp-flight').forEach((e) => e.remove())
  })

  const atSleep = () => ({
    ...initialFlow('c_fly', 0, { goals: ['energy'], age: '35-44', comfortOffered: true }),
    sceneId: 'sleep' as const,
    history: ['goals' as const, 'about' as const, 'training' as const, 'energy' as const],
  })

  it('flies the answer from the scene into its slot (Amp, until the day ring) as the next scene arrives', async () => {
    render(<AmpConsult initial={atSleep()} />)
    await act(async () => new Promise((r) => setTimeout(r, 0)))
    answerCurrentScene()
    pressNext()
    const token = document.querySelector('.amp-flight')
    expect(token?.textContent).toMatch(/^\d\d:\d\d–\d\d:\d\d$/)
    expect(animate).toHaveBeenCalled()
    expect(heading()).toHaveTextContent('How often are you outside in daylight?')
  })

  it('flies nothing for a scene off the ring, or under reduced motion', async () => {
    const { unmount } = render(<AmpConsult initial={{ ...atSleep(), sceneId: 'goals', history: [] }} />)
    pickFirstOptionAndNext()
    await act(async () => new Promise((r) => setTimeout(r, 0)))
    pickFirstOptionAndNext()
    expect(document.querySelector('.amp-flight')).toBeNull()
    unmount()
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ ...original(q), matches: q.includes('reduce') })) as typeof window.matchMedia
    try {
      render(<AmpConsult initial={atSleep()} />)
      await act(async () => new Promise((r) => setTimeout(r, 0)))
      answerCurrentScene()
      pressNext()
      expect(document.querySelector('.amp-flight')).toBeNull()
    } finally {
      window.matchMedia = original
    }
  })
})

describe('Amp, alive, in the consult (plan Phase 7.2)', () => {
  const at = (sceneId: 'sleep' | 'energy' | 'goals', answers: Parameters<typeof initialFlow>[2]) => ({
    ...initialFlow('c_amp', 0, { goals: ['energy'], age: '35-44', comfortOffered: true, ...answers }),
    sceneId,
    history: ['goals' as const],
  })
  const ampEl = () => document.querySelector<HTMLElement>('[data-amp-state]')!

  it('droops his lids on a late bedtime, and glows with the energy level', () => {
    const { unmount } = render(<AmpConsult initial={at('sleep', { sleep: { bed: 60, wake: 8 * 60, quality: null } })} />)
    expect(Number(ampEl().style.getPropertyValue('--amp-eye'))).toBeLessThan(0.6)
    unmount()
    render(<AmpConsult initial={at('energy', { energy: 9 })} />)
    expect(document.querySelector('[data-amp-glow]')).toHaveStyle({ opacity: '0.9' })
  })

  it('tells him when Next is pressed, so he can stretch', () => {
    const heard = jest.fn()
    window.addEventListener('amp:next', heard)
    render(<AmpConsult />)
    pickFirstOptionAndNext()
    window.removeEventListener('amp:next', heard)
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
