/**
 * Amp's life (plan Phase 7.2): what needs the pointer or a clock, kept out of
 * the first scene and loaded by `Amp` once the page has been touched or gone
 * idle. Never attached under reduced motion.
 *
 *   eyes     follow the finger (or the mouse) while it's moving, then drift
 *            back to the middle
 *   blinks   every few seconds, now and then twice; never while hidden
 *   squash   a squash on any tap in the consult, a bigger stretch on Next
 *            (`AMP_NEXT_EVENT`), on top of whatever pose he's holding
 *
 * Everything is written as CSS variables and attributes on Amp's own element,
 * so a frame of this never re-renders React.
 */

import { AMP_NEXT_EVENT } from '@/lib/consult/amp-rig'
import { DURATION, springEasing } from '@/lib/consult/motion'

/** How far the finger has to be for his eyes to turn all the way. */
const FULL_GAZE_PX = 140
/** Eyes drift back to the middle this long after the pointer stops. */
const GAZE_REST_MS = 1600

const SQUASH: Keyframe[] = [
  { transform: 'scale(1, 1)' },
  { transform: 'scale(1.1, 0.88)', offset: 0.25 },
  { transform: 'scale(0.96, 1.05)', offset: 0.6 },
  { transform: 'scale(1, 1)' },
]
const STRETCH: Keyframe[] = [
  { transform: 'translateY(0) scale(1, 1)' },
  { transform: 'translateY(4%) scale(1.14, 0.84)', offset: 0.2 },
  { transform: 'translateY(-10%) scale(0.9, 1.14)', offset: 0.5 },
  { transform: 'translateY(0) scale(1, 1)' },
]

export function attachLife(el: HTMLElement): () => void {
  const face = el.querySelector<SVGElement>('.amp-face')
  const root = el.closest('.amp-consult') ?? document
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t)
      fn()
    }, ms)
    timers.add(t)
  }

  // ── Eyes ──
  let frame = 0
  let pointer: { x: number; y: number } | null = null
  let rest: ReturnType<typeof setTimeout> | null = null
  const look = () => {
    frame = 0
    if (!pointer) return
    const r = el.getBoundingClientRect()
    const dx = pointer.x - (r.left + r.width / 2)
    const dy = pointer.y - (r.top + r.height / 2)
    const dist = Math.hypot(dx, dy) || 1
    const reach = Math.min(1, dist / FULL_GAZE_PX)
    el.style.setProperty('--amp-gx', ((dx / dist) * reach).toFixed(2))
    el.style.setProperty('--amp-gy', ((dy / dist) * reach).toFixed(2))
  }
  const onPointer = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY }
    if (!frame) frame = requestAnimationFrame(look)
    if (rest) clearTimeout(rest)
    rest = setTimeout(() => {
      pointer = null
      el.style.removeProperty('--amp-gx')
      el.style.removeProperty('--amp-gy')
    }, GAZE_REST_MS)
  }
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('pointerdown', onPointer, { passive: true })

  // ── Blinks ──
  const blink = () => {
    if (document.visibilityState === 'visible') {
      el.setAttribute('data-blink', '')
      later(() => el.removeAttribute('data-blink'), 130)
      // Now and then, twice.
      if (Math.random() < 0.18) later(() => {
        el.setAttribute('data-blink', '')
        later(() => el.removeAttribute('data-blink'), 120)
      }, 260)
    }
    later(blink, 2600 + Math.random() * 3400)
  }
  later(blink, 1200 + Math.random() * 2000)

  // ── Squash and stretch ──
  const play = (frames: Keyframe[], scale: number) => {
    if (!face || typeof face.animate !== 'function') return
    face.animate(frames, { duration: DURATION.scene * scale, easing: springEasing(DURATION.scene), composite: 'add' })
  }
  const onTap = (e: Event) => {
    // A tap on Amp himself is a poke: the same squash, a touch bigger.
    play(SQUASH, el.contains(e.target as Node) ? 1.2 : 1)
  }
  const onNext = () => play(STRETCH, 1.2)
  root.addEventListener('pointerdown', onTap, { passive: true })
  window.addEventListener(AMP_NEXT_EVENT, onNext)

  return () => {
    window.removeEventListener('pointermove', onPointer)
    window.removeEventListener('pointerdown', onPointer)
    root.removeEventListener('pointerdown', onTap)
    window.removeEventListener(AMP_NEXT_EVENT, onNext)
    if (frame) cancelAnimationFrame(frame)
    if (rest) clearTimeout(rest)
    for (const t of timers) clearTimeout(t)
    el.removeAttribute('data-blink')
    el.style.removeProperty('--amp-gx')
    el.style.removeProperty('--amp-gy')
  }
}
