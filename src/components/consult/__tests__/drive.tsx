import { fireEvent, screen, within } from '@testing-library/react'
import { SCENES } from '@/lib/consult/flow'

/**
 * Drives the consult in tests: answers whatever scene is on screen the way a
 * person would — the real widget where one is built, the first scripted option
 * where the scene is still a placeholder — and presses Next.
 */

export function heading(): HTMLElement {
  return screen.getByRole('heading', { level: 1 })
}

/** The scene on screen, by its question — its own, or a journey's wording of it. */
export function currentScene() {
  const q = heading().textContent
  return SCENES.find((s) => s.copy.question === q || s.variants?.some((v) => v.copy?.question === q))
}

export const ROUTE_QUESTION = 'How well should I get to know you?'

/** On the route choice, take the deep charge (every scene). */
export function chooseRoute(route: 'Deep charge' | 'Speed run' | 'Pinpoint' = 'Deep charge'): void {
  if (heading().textContent === ROUTE_QUESTION) fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${route}`) }))
}

/** "Same most weeks": tap a day, then what's done on it. */
export function setDay(day: string, activity: 'Gym' | 'Cardio' | 'Sport' = 'Gym'): void {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${day}:`) }))
  fireEvent.click(within(screen.getByRole('group', { name: `${day}: what you do` })).getByRole('button', { name: new RegExp(`^${activity}`) }))
}

export function answerCurrentScene(): void {
  if (heading().textContent === ROUTE_QUESTION) return chooseRoute()
  const scene = currentScene()
  if (!scene) return
  switch (scene.interaction) {
    case 'goal-tiles':
      fireEvent.click(screen.getByRole('button', { name: /^Performance/ }))
      return
    case 'age-wheel':
      fireEvent.click(screen.getByRole('option', { name: '18–24' }))
      fireEvent.click(screen.getByRole('radio', { name: 'Prefer not to say' }))
      return
    case 'training-week':
      setDay('Monday', 'Gym')
      if (screen.queryByRole('radiogroup', { name: 'How hard do most sessions feel?' })) {
        fireEvent.click(screen.getByRole('radio', { name: 'Steady' }))
      }
      return
    case 'shelf-check':
      fireEvent.click(screen.getByRole('button', { name: 'Nothing yet' }))
      return
    case 'charge-dial':
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Afternoon energy' }), { key: 'Home' })
      return
    case 'sleep-window':
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Bedtime' }), { key: 'ArrowRight' })
      fireEvent.click(screen.getByRole('radio', { name: 'OK' }))
      return
    case 'sun-arc':
      fireEvent.click(screen.getByRole('radio', { name: /^Rarely/ }))
      return
    case 'cup-counter':
      fireEvent.click(screen.getByRole('button', { name: 'None' }))
      return
    case 'plate-picker':
      fireEvent.click(screen.getByRole('button', { name: /^Oily fish/ }))
      return
    case 'aim-tiles':
      fireEvent.click(screen.getByRole('radio', { name: /^Build muscle/ }))
      return
    case 'changes-picker':
      return
    case 'body-map':
      return
    case 'circuit-check':
      fireEvent.click(screen.getByRole('checkbox', { name: /^Use my answers here/ }))
      fireEvent.click(screen.getByRole('radio', { name: 'None of these' }))
      return
    case 'review':
      return
  }
  const first = scene.placeholder?.options[0]
  if (first) fireEvent.click(screen.getByRole(scene.placeholder!.multi ? 'button' : 'radio', { name: first.label }))
}

export function pressNext(): void {
  const next = screen.getAllByRole('button').find((b) => /^(Next|Looks right|Continue|Back to review)$/.test(b.textContent ?? ''))!
  fireEvent.click(next)
}

/**
 * One scene per call — except that the driver answers as a young builder
 * (Performance, 18–24), whose consult adds "What are you training for?"
 * after training. It's answered in the same call, so a count of calls still
 * lands on the same scene for every journey. The journey tests drive it on
 * its own.
 */
export function pickFirstOptionAndNext(): void {
  chooseRoute()
  answerCurrentScene()
  pressNext()
  if (currentScene()?.id === 'aim') {
    answerCurrentScene()
    pressNext()
  }
}

/* ── Pinpoint (plan v5) ─────────────────────────────────────────────────── */

export const PINPOINT_SCENES = ['follow-move', 'follow-rest', 'follow-fuel', 'pinpoint']

/** The scene on screen, by its marker: Pinpoint's headings change with every question. */
export function sceneOnScreen(): string | null {
  return document.querySelector('[data-scene]')?.getAttribute('data-scene') ?? null
}

/**
 * Answer whatever Pinpoint is showing, once: "That's me" (or its nearest) to
 * a question, `verdict` to a hunch, Keep going at the checkpoint, Let's go
 * at the start. Returns what it did.
 */
export function answerPinpoint(verdict: 'yes' | 'no' = 'yes', comfort = false): string {
  const did = answerPinpointOnce(verdict)
  // Comfort mode holds a single-tap answer until Next.
  if (comfort && ['scenario', 'how-often', 'this-or-that'].includes(did)) {
    const next = screen.queryAllByRole('button', { name: /^Next$/ }).find((b) => b.closest('[data-scene]'))
    if (next) fireEvent.click(next)
  }
  return did
}

function answerPinpointOnce(verdict: 'yes' | 'no'): string {
  const button = (name: RegExp) => screen.queryAllByRole('button', { name }).find((b) => b.getAttribute('role') !== 'radio')
  const go = button(/^Let’s go$/)
  if (go) return fireEvent.click(go), 'start'
  const hunch = button(verdict === 'yes' ? /^That’s me$/ : /^Not me$/)
  if (hunch) return fireEvent.click(hunch), 'verdict'
  const more = button(/^Keep going$/)
  if (more) return fireEvent.click(more), 'checkpoint'
  const me = screen.queryByRole('radio', { name: 'That’s me' })
  if (me) return fireEvent.click(me), 'scenario'
  const often = screen.queryByRole('radio', { name: 'Most days' })
  if (often) return fireEvent.click(often), 'how-often'
  const slider = screen.queryByRole('slider')
  if (slider) {
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.click(screen.getAllByRole('button', { name: /^Next$/ }).find((b) => b.closest('[data-scene]'))!)
    return 'day-line'
  }
  const yes = screen.queryAllByRole('radio', { name: 'Yes' })
  if (yes.length) {
    for (const row of screen.getAllByRole('radiogroup')) {
      const y = within(row).queryByRole('radio', { name: 'Yes' })
      if (y && y.getAttribute('aria-checked') !== 'true') fireEvent.click(y)
    }
    return 'quick-fire'
  }
  const pair = screen.queryAllByRole('radiogroup')[0]
  if (pair) return fireEvent.click(within(pair).getAllByRole('radio')[0]), 'this-or-that'
  return 'nothing'
}

/** Play the round (and any follow-up on screen) through to the end, then Continue. */
export function playPinpoint(verdict: 'yes' | 'no' = 'yes', max = 60): string[] {
  const did: string[] = []
  for (let i = 0; i < max && PINPOINT_SCENES.includes(sceneOnScreen() ?? ''); i++) {
    const next = screen.queryAllByRole('button', { name: /^Continue$/ }).find((b) => b.getAttribute('role') !== 'radio')
    if (next) {
      fireEvent.click(next)
      did.push('continue')
      continue
    }
    did.push(answerPinpoint(verdict))
  }
  return did
}
