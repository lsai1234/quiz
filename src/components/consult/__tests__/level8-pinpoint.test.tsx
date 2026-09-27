import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { consultFunnel } from '@/lib/analytics/consult'
import { DURATION } from '@/lib/consult/motion'
import { Analysis } from '../Analysis'
import { resetPinpointAi } from '../pinpoint/pinpointAi'
import { PROBE_BY_ID } from '@/lib/consult/pinpoint/library'
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
    expect(counter()).toMatch(/^Question 2 · |^Amp’s hunch$/)
    expect(screen.getByText(/^(Thought so\.|Warmer\.|Interesting\.|Noted\.|Ah\. Not .*|I think I’ve spotted a pattern\.)$/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(heading().textContent).toBe(first)
    expect(counter()).toMatch(/^Question 1 · (about \d+ more|nearly there)$/)
  })

  it('puts a strong lead to you, and That’s me locks it in', () => {
    render(<AmpConsult initial={at('pinpoint', { pinpoint: { steps: [{ kind: 'probe', probe: 'eleven-pm', answer: { main: 'a' }, stage: 'follow-rest' }, { kind: 'probe', probe: 'tired-then-awake', answer: { main: 'me' }, stage: 'pinpoint' }], stopped: false, started: true } })} />)
    expect(heading()).toHaveTextContent('Wired and tired')
    expect(screen.getByText('Does this sound like you?', { exact: true })).toBeInTheDocument()
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

  it('says what a hunch is: the pattern, why, and what each answer does', () => {
    render(<AmpConsult initial={at('pinpoint', { pinpoint: { steps: [{ kind: 'probe', probe: 'eleven-pm', answer: { main: 'a' }, stage: 'follow-rest' }, { kind: 'probe', probe: 'tired-then-awake', answer: { main: 'me' }, stage: 'pinpoint' }], stopped: false, started: true } })} />)
    expect(screen.getByText('I think I’ve spotted a pattern.')).toBeInTheDocument()
    expect(heading()).toHaveTextContent('Wired and tired')
    expect(screen.getByRole('list', { name: 'Why I think so' })).toBeInTheDocument()
    expect(screen.getByText(/If it’s you, I’ll build your stack around it/)).toBeInTheDocument()
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
    const name = first.closest('[data-pattern]')!.querySelector('p')!.textContent!
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

describe('the payoff (phase 4)', () => {
  const WIRED_STEPS = [
    { kind: 'probe' as const, probe: 'tired-then-awake', answer: { main: 'me' }, stage: 'pinpoint' as const },
    { kind: 'verdict' as const, pattern: 'wired' as const, verdict: 'yes' as const, stage: 'pinpoint' as const },
  ]
  const finished = (answers: Partial<ConsultAnswers> = {}): FlowState => ({
    ...at('review', {
      pinpoint: { steps: WIRED_STEPS, stopped: true, started: true },
      circuit: { flags: [], none: true },
      healthConsent: { accepted: true, version: 'x', at: 'x' },
      ...answers,
    }),
    consultId: 'c_payoff00001',
    phase: 'analysis',
  })

  beforeEach(() => {
    jest.useFakeTimers()
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response) as typeof fetch
  })
  afterEach(() => jest.useRealTimers())

  async function chargeUp(state: FlowState) {
    render(<Analysis state={state} onDone={jest.fn()} onBack={jest.fn()} loadProducts={async () => MOCK_CATALOGUE} />)
    await act(async () => {
      await Promise.resolve()
    })
  }

  it('joins the dots in the charge-up, in the same time', async () => {
    await chargeUp(finished())
    const steps = screen.getByRole('list', { name: 'Analysis steps' })
    expect(within(steps).getByText('Joining the dots')).toBeInTheDocument()
    expect(steps.querySelectorAll('li')).toHaveLength(5)
    const line = () => document.querySelector('path[data-drawn]')!
    expect(line()).toHaveAttribute('data-drawn', 'false')
    act(() => {
      jest.advanceTimersByTime(DURATION.chargeUp / 5 + 1)
    })
    expect(line()).toHaveAttribute('data-drawn', 'true')
    expect(screen.getByText('Wired and tired')).toBeInTheDocument()
    act(() => {
      jest.advanceTimersByTime(DURATION.chargeUp)
    })
    expect(screen.getByRole('heading', { name: 'Fully charged' })).toBeInTheDocument()
  })

  it('shows the profile on Fully charged: the pattern, what the stack does, what it kept out', async () => {
    await chargeUp(finished())
    act(() => {
      jest.advanceTimersByTime(DURATION.chargeUp * 2)
    })
    const card = document.querySelector('article[data-pattern="wired"]') as HTMLElement
    expect(card).toBeInTheDocument()
    expect(within(card).getByText('Pinpointed')).toBeInTheDocument()
    expect(within(card).getByText('What your stack does')).toBeInTheDocument()
    expect(within(card).getByText(/^Kept out: caffeine and stimulant pre-workouts, because/)).toBeInTheDocument()
    // Product wording only ever comes from the claims register.
    const { CLAIMS } = await import('@/lib/consult/claims')
    const wordings = new Set(Object.values(CLAIMS).map((c) => `${c.wording}.`))
    for (const li of Array.from(card.querySelectorAll('li'))) {
      const lines = Array.from(li.querySelectorAll('p')).slice(1)
      for (const l of lines) expect(wordings.has(l.textContent!)).toBe(true)
    }
    // The stacks follow.
    expect(screen.getByText('Essentials')).toBeInTheDocument()
  })

  it('asks "Did Amp get you?" once, and counts the answer', async () => {
    const got = jest.spyOn(consultFunnel, 'gotYou')
    await chargeUp(finished())
    act(() => {
      jest.advanceTimersByTime(DURATION.chargeUp * 2)
    })
    const group = screen.getByRole('radiogroup', { name: 'Did Amp get you?' })
    fireEvent.click(within(group).getByRole('radio', { name: 'Spot on' }))
    expect(got).toHaveBeenCalledWith({ answer: 'spot-on', found: 1 })
    expect(screen.getByText(/That’s what the stack is built on/)).toBeInTheDocument()
    fireEvent.click(within(group).getByRole('radio', { name: 'Mostly' }))
    expect(got).toHaveBeenCalledTimes(1)
    got.mockRestore()
  })

  it('shows none of it on the other routes', async () => {
    await chargeUp(finished({ route: 'deep' }))
    expect(screen.queryByText('Joining the dots')).toBeNull()
    act(() => {
      jest.advanceTimersByTime(DURATION.chargeUp * 2)
    })
    expect(screen.queryByText('What I pinpointed')).toBeNull()
  })
})

describe('the upgrade and the recheck (phase 4)', () => {
  it('offers Pinpoint on a Deep charge review, and keeps every answer', () => {
    const upgrade = jest.spyOn(consultFunnel, 'upgrade')
    render(<AmpConsult initial={{ ...at('review', { route: 'deep', pinpoint: null, circuit: { flags: [], none: true }, healthConsent: { accepted: true, version: 'x', at: 'x' } }), history: ['goals'] }} />)
    expect(screen.getByText('Want me to pinpoint it?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pinpoint it' }))
    expect(upgrade).toHaveBeenCalledWith({ from: 'deep' })
    expect(PINPOINT_SCENES).toContain(sceneOnScreen())
    upgrade.mockRestore()
  })

  it('never offers it on the Pinpoint route', () => {
    render(<AmpConsult initial={at('review', { circuit: { flags: [], none: true }, healthConsent: { accepted: true, version: 'x', at: 'x' } })} />)
    expect(screen.queryByText('Want me to pinpoint it?')).toBeNull()
  })

  it('marks a pattern for a recheck after an answer it rested on changes, and asks again', () => {
    render(
      <AmpConsult
        initial={{
          ...at('review', {
            caffeine: { coffee: 0, tea: 0, energy: 0 },
            sleep: { bed: 22 * 60, wake: 7 * 60, quality: 'restful' },
            energy: 8,
            pinpoint: { steps: [{ kind: 'probe', probe: 'tired-then-awake', answer: { main: 'me' }, stage: 'pinpoint' }, { kind: 'verdict', pattern: 'wired', verdict: 'yes', stage: 'pinpoint' }], stopped: true, started: true },
            circuit: { flags: [], none: true },
            healthConsent: { accepted: true, version: 'x', at: 'x' },
          }),
          history: ['goals'],
        }}
      />,
    )
    const card = document.querySelector('[data-pattern="wired"]') as HTMLElement
    expect(card).toHaveAttribute('data-recheck', 'true')
    expect(within(card).getByText(/changed an answer this rested on/)).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Recheck' }))
    expect(sceneOnScreen()).toBe('pinpoint')
  })
})

describe('the AI (phase 5)', () => {
  /** A fake /api/consult/pinpoint: words every question, and answers typed text with the first candidate. */
  function fakeAi(opts: { tell?: (body: Record<string, unknown>) => unknown } = {}) {
    const calls: Record<string, unknown>[] = []
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      if (String(url) !== '/api/consult/pinpoint') return { ok: true, json: async () => ({ fallback: true }) } as unknown as Response
      calls.push(body)
      // Each question worded in its own shape; typed text answers the first candidate with its first answer.
      const probe = PROBE_BY_ID[String(body.probe)]
      const words =
        !probe ? null
        : probe.format === 'this-or-that' ? { a: 'Amp’s own words, side a.', b: 'Amp’s own words, side b.' }
        : probe.format === 'quick-fire' ? { rows: Object.fromEntries(probe.items.map((i) => [i.key, `Amp’s own words, ${i.key}?`])) }
        : { text: `Amp’s own words for ${probe.id}.` }
      const first = (body.candidates as string[] | undefined)?.[0]
      const out =
        body.kind === 'probe'
          ? words ? { words } : { fallback: true }
          : body.kind === 'tell'
            ? opts.tell?.(body) ?? { picks: [{ probe: first, answer: PROBE_BY_ID[first!].items[0].options[0].key }] }
            : { fallback: true }
      return { ok: true, json: async () => out } as unknown as Response
    }) as typeof fetch
    return calls
  }
  const settle = () => act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

  beforeEach(() => resetPinpointAi())

  it('never rewords the questions: they’re always the script', async () => {
    const calls = fakeAi()
    render(<AmpConsult ai initial={at('pinpoint')} />)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Let’s go' }))
    await settle()
    expect(calls.some((c) => c.kind === 'probe')).toBe(false)
    expect(screen.queryByText(/^Amp’s own words/)).toBeNull()
  })

  it('offers no typing without the AI', () => {
    fakeAi()
    render(<AmpConsult ai={false} initial={at('pinpoint')} />)
    expect(screen.queryByRole('button', { name: 'Or tell me about a bad day' })).toBeNull()
  })

  it('reads a bad day into answers, and says how many it filled', async () => {
    const calls = fakeAi()
    render(<AmpConsult ai initial={at('pinpoint')} />)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Or tell me about a bad day' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dragging by 3pm, then awake at midnight' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to Amp' }))
    })
    const tell = calls.find((c) => c.kind === 'tell')!
    expect(tell.text).toBe('dragging by 3pm, then awake at midnight')
    expect(screen.queryByRole('dialog', { name: 'Tell me about a bad day' })).toBeNull()
    expect(screen.getByText('From what you told me: 1 answer filled in.')).toBeInTheDocument()
  })

  it('stops health details before anything is sent', async () => {
    const calls = fakeAi()
    render(<AmpConsult ai initial={at('pinpoint')} />)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Or tell me about a bad day' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my GP thinks it’s my thyroid' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to Amp' }))
    })
    expect(calls.some((c) => c.kind === 'tell')).toBe(false)
    expect(screen.getByText(/sounds like health information/)).toBeInTheDocument()
  })

  it('takes "it’s more complicated" as the closest answer, and moves on', async () => {
    fakeAi()
    render(<AmpConsult ai initial={at('pinpoint', { pinpoint: { steps: [], stopped: false, started: true } })} />)
    await settle()
    const first = heading().textContent
    const counterBefore = counter()
    fireEvent.click(screen.getByRole('button', { name: 'It’s more complicated' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'only after a heavy session' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to Amp' }))
    })
    expect(counter()).not.toBe(counterBefore)
    expect(heading().textContent === first && counter() === counterBefore).toBe(false)
  })

  it('says so when nothing matched, and leaves the question as it was', async () => {
    fakeAi({ tell: () => ({ picks: [] }) })
    render(<AmpConsult ai initial={at('pinpoint', { pinpoint: { steps: [], stopped: false, started: true } })} />)
    await settle()
    const before = counter()
    fireEvent.click(screen.getByRole('button', { name: 'It’s more complicated' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hard to say' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to Amp' }))
    })
    expect(screen.getByText(/couldn’t match that to an answer/)).toBeInTheDocument()
    expect(counter()).toBe(before)
  })
})

describe('what the notes point to (typed answers, read together)', () => {
  beforeEach(() => resetPinpointAi())

  it('leads the review’s offer with a hunch from the notes', async () => {
    const asked: Record<string, unknown>[] = []
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      if (String(url) === '/api/consult/pinpoint' && body.kind === 'notes') {
        asked.push(body)
        return { ok: true, json: async () => ({ hints: [{ pattern: (body.candidates as string[])[0], why: 'Energy swings week to week' }] }) } as unknown as Response
      }
      return { ok: true, json: async () => ({ fallback: true }) } as unknown as Response
    }) as typeof fetch
    render(
      <AmpConsult
        ai
        initial={{
          ...at('review', { route: 'deep', pinpoint: null, notes: { energy: 'Energy swings week to week: some weeks plenty, some weeks crashing' }, circuit: { flags: [], none: true }, healthConsent: { accepted: true, version: 'x', at: 'x' } }),
          history: ['goals'],
        }}
      />,
    )
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })
    expect(asked[0].notes).toEqual(['Energy swings week to week: some weeks plenty, some weeks crashing'])
    expect(document.querySelector('[data-note-hint]')).toHaveTextContent(/From what you told me, I’ve a hunch: .+ \(energy swings week to week\)\./)
  })
})
