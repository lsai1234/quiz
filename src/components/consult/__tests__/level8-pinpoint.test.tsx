import { fireEvent, render, screen, within } from '@testing-library/react'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { initialFlow, type FlowState } from '@/lib/consult/flow'
import { saveConsult } from '@/lib/consult/persist'
import { trainingDays } from '@/lib/consult/training'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { resetQuizArm } from '@/lib/experiments/client'
import { AmpConsult } from '../AmpConsult'
import { SWIPE_AT } from '../pinpoint/formats'
import { PINPOINT_SCENES, answerCurrentScene, answerPinpoint, chooseRoute, heading, playPinpoint, pressNext, sceneOnScreen } from './drive'

/**
 * Pinpoint on screen (plan v5, phase 2): the route, the follow-ups, the
 * round, hunches and verdicts, Back, comfort mode, and the review.
 */

// jsdom has no PointerEvent, so a swipe would carry no coordinates. A
// stand-in built on MouseEvent carries them, as a browser's would.
beforeAll(() => {
  if (!('PointerEvent' in window)) {
    class PointerEventStandIn extends MouseEvent {
      pointerId: number
      pointerType: string
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
        this.pointerType = init.pointerType ?? 'touch'
      }
    }
    ;(window as unknown as { PointerEvent: typeof PointerEventStandIn }).PointerEvent = PointerEventStandIn
  }
})

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetQuizArm()
})

/** Sam: tired, short on sleep, four coffees. Every core screen answered. */
const SAM: Partial<ConsultAnswers> = {
  route: 'pinpoint',
  goals: ['energy'],
  age: '35-44',
  sex: 'male',
  training: trainingDays(['gym', 'rest', 'rest', 'gym', 'rest', 'rest', 'rest']),
  energy: 3,
  sleep: { bed: 60, wake: 7 * 60, quality: 'ok' },
  daylight: 'some',
  caffeine: { coffee: 4, tea: 0, energy: 0 },
  plate: ['poultry', 'eggs', 'dairy', 'greens', 'fruit', 'wholegrains'],
  body: [],
  shelf: [],
  comfortOffered: true,
  pinpoint: { steps: [], stopped: false },
}

const at = (sceneId: FlowState['sceneId'], answers: Partial<ConsultAnswers> = {}): FlowState => ({
  ...initialFlow('p1', 0, { route: 'pinpoint' }),
  sceneId,
  answers: { ...EMPTY_ANSWERS, ...SAM, ...answers },
})

describe('the route choice', () => {
  it('offers three routes, Pinpoint first and recommended, and says why', () => {
    render(<AmpConsult />)
    const routes = within(screen.getByRole('radiogroup', { name: 'Route' })).getAllByRole('radio')
    expect(routes.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^Pinpoint · Recommended/),
      expect.stringMatching(/^Deep charge/),
      expect.stringMatching(/^Speed run/),
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Why Pinpoint?' }))
    expect(screen.getByText(/which tired you are/)).toBeInTheDocument()
  })
})

/** The round's counter line, as read. */
const counter = () => document.querySelector('[data-counter]')?.textContent ?? ''

describe('the round', () => {
  it('opens on what Amp has so far, then asks, with a counter you can trust', () => {
    render(<AmpConsult initial={at('pinpoint')} />)
    expect(heading()).toHaveTextContent('Here’s what I’ve got so far')
    expect(screen.getByRole('img', { name: /Amp’s leads so far/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Let’s go' }))
    expect(counter()).toMatch(/^Question 1 · (about \d+ more|nearly there)$/)
    expect(screen.queryByRole('button', { name: /^(Next|Continue)$/ })).toBeNull()
  })

  it('moves on in place, reacting hot and cold, and Back takes the answer back', () => {
    render(<AmpConsult initial={at('pinpoint', { pinpoint: { steps: [], stopped: false, started: true } })} />)
    const first = heading().textContent
    answerPinpoint()
    expect(counter()).toMatch(/^Question 2 · |^I think I’ve got something$/)
    expect(screen.getByText(/^(Thought so\.|Warmer\.|Interesting\.|Noted\.|Ah\. Not .*)$/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(heading().textContent).toBe(first)
    expect(counter()).toMatch(/^Question 1 · (about \d+ more|nearly there)$/)
  })

  it('puts a strong lead to you, and That’s me locks it in', () => {
    render(<AmpConsult initial={at('pinpoint', { pinpoint: { steps: [{ kind: 'probe', probe: 'eleven-pm', answer: { main: 'a' }, stage: 'follow-rest' }, { kind: 'probe', probe: 'tired-then-awake', answer: { main: 'me' }, stage: 'pinpoint' }], stopped: false, started: true } })} />)
    expect(heading()).toHaveTextContent('Wired and tired')
    expect(screen.getByText('Is that you?')).toBeInTheDocument()
    expect(screen.getByText('4 caffeinated drinks a day')).toBeInTheDocument()
    expect(document.querySelector('[data-reticle="locked"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'That’s me' }))
    expect(screen.getByText('Knew it. Locked in.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^What I’m thinking:/ }))
    const sheet = screen.getByRole('dialog', { name: 'What I’m thinking' })
    expect(within(sheet).getByText('Wired and tired')).toBeInTheDocument()
    expect(within(sheet).getByText('You said so')).toBeInTheDocument()
  })

  it('offers to build now from question five, and finishes on what it found', () => {
    const steps = ['snooze', 'weekend-lie-in', 'phone-in-bed', 'clocks-back', 'sweet-fix'].map((probe) => ({ kind: 'probe' as const, probe, answer: { main: probe === 'snooze' ? 'never' : 'not' }, stage: 'pinpoint' as const }))
    render(<AmpConsult initial={at('pinpoint', { pinpoint: { steps, stopped: false, started: true } })} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Build my stack now' })[0])
    expect(heading()).toHaveTextContent(/Pinpointed|Nothing stood out/)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(heading()).toHaveTextContent('Circuit check')
  })

  it('answers a scenario with a swipe right', () => {
    render(<AmpConsult initial={at('pinpoint', { pinpoint: { steps: [], stopped: false, started: true } })} />)
    // Find a scenario card, answering others until one shows.
    for (let i = 0; i < 6 && !document.querySelector('[data-swipe-card]'); i++) answerPinpoint()
    const card = document.querySelector('[data-swipe-card]') as HTMLElement
    const before = heading().textContent + (screen.queryByText(/^Question \d+/)?.textContent ?? '')
    card.getBoundingClientRect = () => ({ width: 300, height: 100, left: 0, top: 0, right: 300, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 10, button: 0 })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 10 + 300 * (SWIPE_AT + 0.1) })
    fireEvent.pointerUp(card, { pointerId: 1 })
    expect(heading().textContent + (screen.queryByText(/^Question \d+/)?.textContent ?? '')).not.toBe(before)
  })
})

describe('the feel of it', () => {
  it('says why it’s asking, in a line', () => {
    render(<AmpConsult initial={at('pinpoint', { pinpoint: { steps: [], stopped: false, started: true } })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Why I’m asking' }))
    expect(screen.getByText(/^It (tells .* apart from .*|checks whether it’s .*)\.$/)).toBeInTheDocument()
  })

  it('crosses off what an answer rules out', () => {
    const steps = [
      { kind: 'probe' as const, probe: 'workday-daylight', answer: { main: 'not' }, stage: 'pinpoint' as const },
      { kind: 'probe' as const, probe: 'dark-commute', answer: { main: 'not' }, stage: 'pinpoint' as const },
    ]
    render(<AmpConsult initial={at('pinpoint', { pinpoint: { steps, stopped: false, started: true } })} />)
    expect(screen.getByText('Indoor life', { selector: 'span' })).toHaveStyle({ textDecoration: 'line-through' })
    expect(screen.getByText(/^Ah\. Not indoor life, then\.$/)).toBeInTheDocument()
  })

  it('leans in on a hunch, and lights up at That’s me', () => {
    render(<AmpConsult initial={at('pinpoint', { pinpoint: { steps: [{ kind: 'probe', probe: 'eleven-pm', answer: { main: 'a' }, stage: 'follow-rest' }, { kind: 'probe', probe: 'tired-then-awake', answer: { main: 'me' }, stage: 'pinpoint' }], stopped: false, started: true } })} />)
    expect(document.querySelector('[data-amp-state]')).toHaveAttribute('data-amp-state', 'hunch')
    fireEvent.click(screen.getByRole('button', { name: 'That’s me' }))
    expect(document.querySelector('[data-amp-state]')).toHaveAttribute('data-amp-reaction', 'eureka')
  })
})

describe('follow-ups inside the core screens', () => {
  it('asks one after a section when it’s worth it, then moves on by itself', () => {
    render(<AmpConsult initial={at('daylight')} />)
    pressNext()
    expect(sceneOnScreen()).toBe('follow-rest')
    expect(screen.getByText(/^Quick follow-up\./)).toBeInTheDocument()
    answerPinpoint()
    expect(sceneOnScreen()).toBe('caffeine')
  })

  it('never shows on the other routes', () => {
    render(<AmpConsult initial={at('daylight', { route: 'deep' })} />)
    pressNext()
    expect(sceneOnScreen()).toBe('caffeine')
  })
})

describe('comfort mode', () => {
  it('never moves on by itself: a tap selects, Next commits', () => {
    render(<AmpConsult initial={at('pinpoint', { comfort: true, pinpoint: { steps: [], stopped: false, started: true } })} />)
    for (let i = 0; i < 8 && !screen.queryByRole('radio', { name: 'That’s me' }); i++) answerPinpoint('yes', true)
    const before = heading().textContent + (screen.queryByText(/^Question \d+/)?.textContent ?? '')
    fireEvent.click(screen.getByRole('radio', { name: 'That’s me' }))
    expect(screen.getByRole('radio', { name: 'That’s me' })).toHaveAttribute('aria-checked', 'true')
    expect(heading().textContent + (screen.queryByText(/^Question \d+/)?.textContent ?? '')).toBe(before)
    fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0])
    expect(heading().textContent + (screen.queryByText(/^Question \d+/)?.textContent ?? '')).not.toBe(before)
  })
})

describe('a whole Pinpoint consult', () => {
  it('runs from the route choice to the handoff, and the review shows what was pinpointed', async () => {
    const onHandoff = jest.fn()
    render(<AmpConsult onHandoff={onHandoff} loadProducts={async () => MOCK_CATALOGUE} />)
    chooseRoute('Pinpoint')
    for (let i = 0; i < 40 && sceneOnScreen() !== 'circuit'; i++) {
      if (PINPOINT_SCENES.includes(sceneOnScreen() ?? '')) playPinpoint()
      else {
        answerCurrentScene()
        pressNext()
      }
    }
    expect(heading()).toHaveTextContent('Circuit check')
    answerCurrentScene()
    pressNext()
    expect(heading()).toHaveTextContent("Here's what I've got")
    expect(screen.getByText('What I pinpointed')).toBeInTheDocument()
    // Not quite takes it out, and it's gone from the review.
    const first = screen.getAllByRole('button', { name: 'Not quite? Take it out' })[0]
    const name = first.closest('div')!.querySelector('p')!.textContent!
    fireEvent.click(first)
    expect(screen.queryByText(name)).toBeNull()
    pressNext()
    fireEvent.click(await screen.findByRole('button', { name: 'See my stacks' }, { timeout: 5000 }))
    expect(onHandoff).toHaveBeenCalled()
  })

  it('resumes mid-round on exactly the same question', () => {
    const state = { ...at('pinpoint', { pinpoint: { steps: [{ kind: 'probe' as const, probe: 'eleven-pm', answer: { main: 'b' }, stage: 'pinpoint' as const }], stopped: false, started: true } }), history: ['goals' as const, 'shelf' as const] }
    const first = render(<AmpConsult initial={state} />)
    const shown = heading().textContent
    first.unmount()
    saveConsult({ ...state, consultId: 'c_resume' })
    sessionStorage.setItem('chrgd-consult-active', 'c_resume')
    render(<AmpConsult />)
    if (screen.queryByRole('button', { name: 'Resume' })) fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(heading().textContent).toBe(shown)
  })
})
