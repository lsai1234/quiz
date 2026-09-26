/**
 * Motion presets for the Amp Consult (build S3).
 *
 * Every animation in the consult pulls from this file. Components never write
 * a duration or an easing curve of their own — `consult-tokens.test.ts` fails
 * on one — they read the CSS variables `motionVars()` puts on the consult root,
 * or the class names `sceneEnterClass()` hands back.
 *
 * The rules this encodes (from the build plan):
 *   - Scenes slide in the direction of travel; back slides the other way.
 *   - One spring preset for everything that enters. Nothing bounces twice.
 *   - Direct manipulation is live: dragged things follow the finger with no
 *     transition at all, so nothing here applies while a drag is in progress.
 *   - The charge-up is the only full-screen animation.
 *   - Haptic ticks on dial steps, day taps and the charge-up (where the
 *     platform has a vibration motor and a browser that exposes it).
 *   - Reduced motion gets instant changes with the same layout.
 */

import type { CSSProperties } from 'react'

/** The one spring. Damping ratio ≈ 0.74: a single small overshoot (~3%) and
 *  settled before a second one is visible. */
export const SPRING = { stiffness: 220, damping: 22, mass: 1 } as const

export const DURATION = {
  /** A press registering. */
  tap: 110,
  /** A colour or border changing state. */
  state: 180,
  /** A tile, card or line arriving. */
  enter: 420,
  /** A whole scene sliding in. */
  scene: 480,
  /** The charge-up at the end. The only full-screen animation. */
  chargeUp: 2600,
  /** How long Amp keeps watching after the last touch. */
  watch: 900,
} as const

/** Everything that is not a spring: colour changes and fades. */
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** How far a pressed control sinks. */
export const PRESS_SCALE = 0.97

/** The gap between items that arrive one after another. */
export const STAGGER = 45

export type Direction = 'forward' | 'back'

/**
 * Position of the spring at time `t` (seconds), from 0 towards 1.
 * The standard closed form for an underdamped mass-spring-damper released
 * from rest.
 */
export function springAt(t: number, spring: { stiffness: number; damping: number; mass: number } = SPRING): number {
  const { stiffness, damping, mass } = spring
  const omega0 = Math.sqrt(stiffness / mass)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  if (zeta >= 1) {
    // Critically damped (or over): no oscillation at all.
    return 1 - (1 + omega0 * t) * Math.exp(-omega0 * t)
  }
  const omegaD = omega0 * Math.sqrt(1 - zeta * zeta)
  const envelope = Math.exp(-zeta * omega0 * t)
  return 1 - envelope * (Math.cos(omegaD * t) + ((zeta * omega0) / omegaD) * Math.sin(omegaD * t))
}

/**
 * The spring as a CSS `linear()` easing, sampled over `durationMs`.
 * Sampled rather than hand-tuned so the curve a scene uses and the number in
 * `SPRING` can never disagree.
 */
export function springEasing(durationMs: number = DURATION.scene, samples = 32): string {
  const seconds = durationMs / 1000
  const points: string[] = []
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * seconds
    const v = i === samples ? 1 : springAt(t)
    points.push(String(Math.round(v * 1000) / 1000))
  }
  return `linear(${points.join(', ')})`
}

/**
 * The CSS variables every consult animation reads. Set once on the root.
 * With `reduced`, every duration collapses to zero, so each change is instant
 * and the layout is unchanged.
 */
export function motionVars(reduced: boolean): CSSProperties {
  const ms = (n: number) => `${reduced ? 0 : n}ms`
  return {
    '--amp-spring': springEasing(DURATION.scene),
    '--amp-ease-out': EASE_OUT,
    '--amp-duration-tap': ms(DURATION.tap),
    '--amp-duration-state': ms(DURATION.state),
    '--amp-duration-enter': ms(DURATION.enter),
    '--amp-duration-scene': ms(DURATION.scene),
    '--amp-duration-charge': ms(DURATION.chargeUp),
    '--amp-press-scale': reduced ? '1' : String(PRESS_SCALE),
  } as CSSProperties
}

/** The class a scene enters with. Nothing when motion is reduced. */
export function sceneEnterClass(direction: Direction, reduced: boolean): string {
  if (reduced) return ''
  return direction === 'forward' ? 'amp-anim-scene-forward' : 'amp-anim-scene-back'
}

/** Inline delay for the `index`-th item in a staggered group. */
export function staggerStyle(index: number, reduced: boolean): CSSProperties {
  return reduced ? {} : { animationDelay: `${index * STAGGER}ms` }
}

/** A transition for a property that animates between states (not a drag). */
export function stateTransition(...properties: string[]): string {
  return properties
    .map((p) => `${p} var(--amp-duration-state) var(--amp-ease-out)`)
    .join(', ')
}

/** A spring transition for a property that moves (a thumb settling on a step). */
export function springTransition(...properties: string[]): string {
  return properties
    .map((p) => `${p} var(--amp-duration-enter) var(--amp-spring)`)
    .join(', ')
}

/** The long, one-off growth of the charge-up (the profile, the battery). */
export function chargeTransition(...properties: string[]): string {
  return properties
    .map((p) => `${p} var(--amp-duration-charge) var(--amp-spring)`)
    .join(', ')
}

export type HapticKind = 'tick' | 'select' | 'charge'

const HAPTIC_PATTERN: Record<HapticKind, number | number[]> = {
  tick: 6,
  select: 12,
  charge: [12, 40, 18, 40, 30],
}

/**
 * A haptic tick, where the device can give one. Android Chrome exposes the
 * vibration motor; iOS Safari does not, and this is then a no-op. Wrapped,
 * because some browsers throw when vibrate is called without a user gesture.
 */
export function haptic(kind: HapticKind): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(HAPTIC_PATTERN[kind])
  } catch {
    // Ignored: a missing tick is not worth an error.
  }
}

/* ── Amp's moods ────────────────────────────────────────────────────────── */

export type AmpState = 'idle' | 'watching' | 'thinking' | 'reading' | 'calm' | 'charged'

/**
 * The placeholder Amp's animation per state (S10). Keyframes live in
 * `consult.css`; timing hangs off the same duration variables as everything
 * else, so reduced motion stills him too. Watching and calm are poses, not
 * loops: watching leans (set inline), calm is simply still.
 */
export const AMP_ANIMATION: Record<AmpState, string | undefined> = {
  idle: 'amp-breathe calc(var(--amp-duration-charge) * 1.6) ease-in-out infinite',
  watching: undefined,
  thinking: 'amp-flicker calc(var(--amp-duration-charge) / 2) linear infinite',
  reading: undefined,
  calm: undefined,
  charged: 'amp-burst var(--amp-duration-scene) var(--amp-spring) both',
}

/**
 * Micro-reactions (U6): short one-shots on top of whatever state Amp is in,
 * each set off by an answer — never by a clock. See `ampReactionTo` in
 * `reactions.ts` for what triggers which. Each ends on its own animationend,
 * so there's no timer to tidy up either.
 *
 *   flex   a day set to gym: a quick flex
 *   sun    the daylight answer moves: a warm glow, as if he's caught the sun
 *   burst  the charge dial hits full: a burst of light
 */
export type AmpReaction = 'flex' | 'sun' | 'burst'

export const AMP_REACTION: Record<AmpReaction, string> = {
  flex: 'amp-flex var(--amp-duration-scene) var(--amp-spring) 1',
  sun: 'amp-sun calc(var(--amp-duration-scene) * 1.5) var(--amp-ease-out) 1',
  burst: 'amp-full var(--amp-duration-scene) var(--amp-spring) 1',
}

/** The scan line across Amp while he reads an upload. */
export const AMP_SCAN = 'amp-scan var(--amp-duration-charge) linear infinite'
