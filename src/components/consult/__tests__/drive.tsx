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

export const ROUTE_QUESTION = 'How much time have you got?'

/** On the route choice, take the deep charge (every scene). */
export function chooseRoute(route: 'Deep charge' | 'Speed run' = 'Deep charge'): void {
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
      fireEvent.click(screen.getByRole('switch', { name: 'None of these' }))
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
