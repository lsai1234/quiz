/**
 * Amp's rig (Amp Consult and offer plan, Phase 7.2): the handful of numbers
 * that pose the SVG character, and how the consult sets them from what's on
 * screen. Pure, so every pose can be tested without a browser.
 *
 *   droop   0–1  eyelids lowering as the bedtime being dragged gets later
 *   squint  0–1  narrowed eyes while the sun is being moved
 *   glow    0–1  the light behind him, following the energy level being set
 *   mood         Pinpoint's model, read: curious while it's unsure, leaning
 *                in once a lead passes 0.5 (`spark`, a confirmed hunch, is
 *                the existing `eureka` reaction)
 *
 * The live parts that need a clock or the pointer (eyes following the finger,
 * blinks, squash and stretch) are `ampLife.ts`'s, loaded later.
 */

import { focus } from './pinpoint/choose'
import { isIn, leads } from './pinpoint/leads'
import type { AmpState } from './motion'
import type { ConsultAnswers, SceneId } from './types'

export type AmpMood = 'curious' | 'leaning'

/** Fired on Next, so Amp can stretch (`ampLife.ts`). */
export const AMP_NEXT_EVENT = 'amp:next'

export interface AmpRig {
  droop?: number
  squint?: number
  glow?: number
  mood?: AmpMood | null
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** 21:00 or earlier is wide awake; 01:00 or later, lids half down. */
export function droopFor(bed: number): number {
  const fromNine = (bed - 21 * 60 + 24 * 60) % (24 * 60)
  // Past 09:00 counts as "very late", not "early evening".
  return fromNine > 12 * 60 ? 1 : clamp01(fromNine / (4 * 60))
}

/** How open his eyes are, 0 (shut) to 1: the state's own pose, then the rig's. */
export function eyeOpen(state: AmpState, rig: AmpRig = {}): number {
  const base = state === 'calm' ? 0.55 : state === 'hunch' ? 0.65 : 1
  const lowered = Math.max((rig.droop ?? 0) * 0.55, (rig.squint ?? 0) * 0.65)
  return Math.round(Math.max(0.2, base - lowered) * 100) / 100
}

export type Mouth = 'smile' | 'grin' | 'flat' | 'o'

export function mouthFor(state: AmpState, mood: AmpMood | null | undefined): Mouth {
  if (state === 'charged') return 'grin'
  if (state === 'calm') return 'flat'
  if (state === 'thinking' || state === 'reading' || mood === 'curious') return 'o'
  return 'smile'
}

/** Pinpoint's model, as a mood: unsure, or leaning in. */
export function moodFor(a: ConsultAnswers): AmpMood | null {
  const top = Math.max(0, ...leads(a).filter(isIn).map((l) => l.p))
  if (top >= 0.5) return 'leaning'
  return focus(a) < 0.35 ? 'curious' : null
}

const PINPOINT: SceneId[] = ['follow-move', 'follow-rest', 'follow-fuel', 'pinpoint']

/**
 * The rig for what's on screen: the live reactions belong to the scene whose
 * input is moving them, and only while it's being touched where that's what
 * the plan says (the sun).
 */
export function rigFor(scene: SceneId, a: ConsultAnswers, touching: boolean): AmpRig {
  switch (scene) {
    case 'sleep':
      return a.sleep ? { droop: droopFor(a.sleep.bed) } : {}
    case 'energy':
      return a.energy !== null ? { glow: a.energy / 10 } : {}
    case 'daylight':
      return touching ? { squint: 1 } : {}
    default:
      return PINPOINT.includes(scene) ? { mood: moodFor(a) } : {}
  }
}
