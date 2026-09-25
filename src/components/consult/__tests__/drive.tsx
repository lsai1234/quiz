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

export function answerCurrentScene(): void {
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
  answerCurrentScene()
  pressNext()
}
