/**
 * The cup stack's physics (plan Phase 7.6): a few lines, no library.
 *
 *   fall    a cup dropped from above: gravity, one bounce (nothing in the
 *           consult bounces twice), then settled
 *   sway    a stack's lean: a damped spring back to upright
 *   knock   a cup landing on a stack of four or more sets it wobbling, more
 *           the taller it is
 *
 * Units are px and px/s for cups, degrees and degrees/s for stacks. Pure:
 * `CupCounter.tsx` steps it each frame and draws it.
 */

export const GRAVITY = 2600
/** How much of its speed a cup keeps when it bounces. */
export const BOUNCE = 0.4
/** Slower than this at the bottom, a cup has settled: after one bounce from any drop it'll be. */
export const SETTLE_SPEED = 200
/** A stack starts to wobble from this many cups. */
export const WOBBLE_FROM = 4
/** The lean's spring and damping, and the most it ever leans. */
export const SPRING = 220
export const DAMPING = 7
export const MAX_LEAN = 7

export interface Cup {
  /** Px above its resting place (0 is resting; negative is above). */
  y: number
  vy: number
  settled: boolean
}

export interface Stack {
  angle: number
  spin: number
}

export const dropped = (height: number): Cup => ({ y: -height, vy: 0, settled: false })
export const upright = (): Stack => ({ angle: 0, spin: 0 })

/** One step of a falling cup. `impact` is its speed when it hit the bottom this step, if it did. */
export function fall(c: Cup, dt: number): { cup: Cup; impact: number | null } {
  if (c.settled) return { cup: c, impact: null }
  let vy = c.vy + GRAVITY * dt
  let y = c.y + vy * dt
  if (y < 0) return { cup: { y, vy, settled: false }, impact: null }
  const impact = vy
  y = 0
  vy = -vy * BOUNCE
  if (Math.abs(vy) < SETTLE_SPEED) return { cup: { y: 0, vy: 0, settled: true }, impact }
  return { cup: { y, vy, settled: false }, impact }
}

/** One step of a stack's lean, back towards upright. */
export function sway(s: Stack, dt: number): Stack {
  const spin = s.spin + (-SPRING * s.angle - DAMPING * s.spin) * dt
  const angle = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, s.angle + spin * dt))
  return { angle, spin }
}

/**
 * A cup landing on a stack of `height` cups. Under four it lands solid; from
 * four, it knocks the stack, harder the taller it is and the harder it hit,
 * leaning the way it's already going (or `side` when upright).
 */
export function knock(s: Stack, height: number, impact: number, side: 1 | -1): Stack {
  if (height < WOBBLE_FROM) return s
  const dir = s.spin === 0 ? side : Math.sign(s.spin)
  const push = Math.min(1, impact / 900) * (8 + 6 * (height - WOBBLE_FROM))
  return { angle: s.angle, spin: s.spin + dir * push * 6 }
}

export const still = (s: Stack) => Math.abs(s.angle) < 0.05 && Math.abs(s.spin) < 0.5
