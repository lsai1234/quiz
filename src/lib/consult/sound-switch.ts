/**
 * UI sounds (plan Phase 7.6): off by default. This is only the switch; the
 * synth (`sound.ts`) is fetched the first time a sound plays, so with sounds
 * off nothing more is loaded. Kept per device, like reading aloud.
 */

import type { HapticKind } from './motion'

export type Cue = HapticKind | 'drop'

const KEY = 'amp-sounds'
let on: boolean | null = null

export function soundsOn(): boolean {
  if (on === null) {
    try {
      on = localStorage.getItem(KEY) === '1'
    } catch {
      on = false
    }
  }
  return on
}

export function setSounds(next: boolean): void {
  on = next
  try {
    localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    // A switch that doesn't stick past a reload is fine.
  }
  if (next) cue('select')
}

/** Play a sound for this moment, if sounds are on. */
export function cue(kind: Cue): void {
  if (!soundsOn()) return
  void import('./sound').then((m) => m.play(kind)).catch(() => undefined)
}
