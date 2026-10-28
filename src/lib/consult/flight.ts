/**
 * Shared-element flights (Amp Consult and offer plan, Phase 7.1): when a scene
 * is answered, its answer flies into its place on the day ring as the next
 * scene arrives.
 *
 * FLIP, with the consult's one spring:
 *   First   where the answer was: the middle of the scene's interaction area
 *           (`[data-flight-source]`), at the token's natural size.
 *   Last    its slot (`[data-flight-slot="<slot>"]`) in the scene that has just
 *           arrived, measured where it will settle, not mid-slide.
 *   Invert  the token is laid out once, at the origin, and placed at First by
 *           a transform.
 *   Play    the transform runs to Last on the scene's own spring and duration,
 *           so token and scene land together; it fades as it arrives.
 *
 * Until the day ring exists (item 3) the consult's slot is Amp
 * (`data-flight-slot="amp"`, where the ring will sit); the workshop shows the
 * ring's five slots. Under reduced motion nothing flies. Imperative and tiny on
 * purpose: one element, two animations, removed when done. Loaded after scene
 * one, never on the first scene's path.
 */

import { DURATION, springEasing } from './motion'
import { summarise } from './summary'
import type { ConsultAnswers, SceneId } from './types'

/** The day ring's slots, in the order they go round (item 3). */
export type RingSlot = 'sleep' | 'caffeine' | 'training' | 'daylight' | 'energy'

/** The scenes whose answers have a place on the ring. */
export const FLIGHT_SLOT: Partial<Record<SceneId, RingSlot>> = {
  training: 'training',
  energy: 'energy',
  sleep: 'sleep',
  daylight: 'daylight',
  caffeine: 'caffeine',
}

export interface FlightToken {
  scene: SceneId
  slot: RingSlot
  /** The answer, short: "23:15–07:00", "3 a day". */
  label: string
}

/** The token a scene's answer flies as, or null when it has no place on the ring (or no answer). */
export function flightToken(scene: SceneId, a: ConsultAnswers): FlightToken | null {
  const slot = FLIGHT_SLOT[scene]
  if (!slot) return null
  const label = summarise(scene, a).split(' · ')[0]
  return label ? { scene, slot, label } : null
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The transforms for First and Last, for an element laid out at the origin
 * with `transform-origin: 0 0`: First at `size`, centred on `from`'s centre;
 * Last scaled to fit inside `to`, centred on it.
 */
export function flip(from: Box, to: Box, size: { width: number; height: number }): { first: string; last: string; scale: number } {
  const scale = Math.min(1, to.width / size.width, to.height / size.height)
  const fx = from.x + from.width / 2 - size.width / 2
  const fy = from.y + from.height / 2 - size.height / 2
  const lx = to.x + to.width / 2 - (size.width * scale) / 2
  const ly = to.y + to.height / 2 - (size.height * scale) / 2
  const r = (n: number) => Math.round(n * 10) / 10
  return { first: `translate(${r(fx)}px, ${r(fy)}px) scale(1)`, last: `translate(${r(lx)}px, ${r(ly)}px) scale(${r(scale * 100) / 100})`, scale }
}

/**
 * Where an element will settle: its box, less the slide of the scene it
 * arrives in (`[data-scene]`, mid-animation when it's measured).
 */
export function settledBox(el: Element): Box {
  const rect = el.getBoundingClientRect()
  const stage = el.closest('[data-scene]')
  let dx = 0
  let dy = 0
  if (stage && typeof DOMMatrixReadOnly !== 'undefined') {
    const t = getComputedStyle(stage).transform
    if (t && t !== 'none') {
      const m = new DOMMatrixReadOnly(t)
      dx = m.m41
      dy = m.m42
    }
  }
  return { x: rect.left - dx, y: rect.top - dy, width: rect.width, height: rect.height }
}

/**
 * Fly `token` from `from` into `target`. Returns the transform animation (or
 * null where the browser can't animate), and cleans up after itself.
 */
export function fly(token: FlightToken, from: Box, target: Element, root: HTMLElement = document.body): Animation | null {
  const el = document.createElement('div')
  el.className = 'amp-flight'
  el.dataset.flight = token.slot
  el.setAttribute('aria-hidden', 'true')
  el.textContent = token.label
  root.appendChild(el)
  if (typeof el.animate !== 'function') {
    el.remove()
    return null
  }
  const size = el.getBoundingClientRect()
  const { first, last } = flip(from, settledBox(target), { width: size.width, height: size.height })
  const move = el.animate([{ transform: first }, { transform: last }], { duration: DURATION.scene, easing: springEasing(DURATION.scene), fill: 'both' })
  // Visible for the flight, gone as it lands: the slot takes over.
  el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: DURATION.scene, fill: 'both' })
  const done = () => el.remove()
  move.finished.then(done, done)
  return move
}
