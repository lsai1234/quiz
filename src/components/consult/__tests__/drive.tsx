import { fireEvent, screen } from '@testing-library/react'
import { SCENES } from '@/lib/consult/flow'

/**
 * Drives the consult in tests: answers whatever scene is on screen the way a
 * person would — the real widget where one is built, the first scripted option
 * where the scene is still a placeholder — and presses Next.
 */

export function heading(): HTMLElement {
  return screen.getByRole('heading', { level: 1 })
}

export function currentScene() {
  return SCENES.find((s) => s.copy.question === heading().textContent)
}

export const ROUTE_QUESTION = 'How much time have you got?'

/** On the route choice, take the deep charge (every scene). */
export function chooseRoute(route: 'Deep charge' | 'Speed run' = 'Deep charge'): void {
  if (heading().textContent === ROUTE_QUESTION) fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${route}`) }))
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
      fireEvent.click(screen.getByRole('button', { name: /^Monday/ }))
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
      fireEvent.click(screen.getByRole('radio', { name: 'Hardly ever' }))
      return
    case 'cup-counter':
      fireEvent.click(screen.getByRole('button', { name: 'None' }))
      return
    case 'plate-picker':
      fireEvent.click(screen.getByRole('button', { name: /^Oily fish/ }))
      return
    case 'body-map':
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

export function pickFirstOptionAndNext(): void {
  chooseRoute()
  answerCurrentScene()
  pressNext()
}
