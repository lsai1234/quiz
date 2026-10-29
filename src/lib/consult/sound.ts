/**
 * The UI sounds themselves (plan Phase 7.6), synthesised with Web Audio: no
 * files, a few oscillators, quiet. Loaded only once sounds are switched on
 * (`sound-switch.ts`).
 *
 *   tick    a step on a slider or stepper: a short high blip
 *   select  a choice: a soft rising pop
 *   double  a hunch forming: two blips
 *   charge  a hunch confirmed, a scene charged: three notes up
 *   drop    a cup landing on the stack: a low knock
 */

import type { Cue } from './sound-switch'

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  ctx ??= new Ctx()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** One note: a frequency (sliding to `to`), a wave, how long and how loud. */
function note(a: AudioContext, at: number, f: number, to: number, ms: number, type: OscillatorType, loud: number) {
  const o = a.createOscillator()
  const g = a.createGain()
  const t = a.currentTime + at
  o.type = type
  o.frequency.setValueAtTime(f, t)
  o.frequency.exponentialRampToValueAtTime(to, t + ms / 1000)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(loud, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + ms / 1000 + 0.02)
}

export function play(kind: Cue): void {
  const a = audio()
  if (!a) return
  switch (kind) {
    case 'tick':
      return note(a, 0, 1400, 1200, 30, 'sine', 0.03)
    case 'select':
      return note(a, 0, 620, 880, 70, 'triangle', 0.05)
    case 'double':
      note(a, 0, 900, 900, 50, 'sine', 0.05)
      return note(a, 0.09, 1200, 1200, 60, 'sine', 0.05)
    case 'charge':
      ;[523, 659, 784].forEach((f, i) => note(a, i * 0.07, f, f * 1.01, 110, 'triangle', 0.05))
      return
    case 'drop':
      return note(a, 0, 220, 90, 120, 'sine', 0.09)
  }
}
