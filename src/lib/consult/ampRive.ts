import type { AmpState } from './motion'

/**
 * Amp in Rive (build U5): the contract between the code and the animation file.
 *
 * The designer builds one artboard with one state machine and the inputs
 * below; the code only ever sets those inputs. Nothing else about the file is
 * assumed, so the animation can be reworked without touching the consult.
 *
 *   Artboard       "Amp"
 *   State machine  "Amp"
 *   Inputs         state   number  0 idle · 1 watching · 2 thinking · 3 reading · 4 calm · 5 charged
 *                  lean    number  -100 (left) … 100 (right), for watching
 *                  (U6 adds its reaction triggers here)
 *
 * The file lives at `public/consult/amp.riv` and must be under 150KB (a test
 * checks). It's switched on with NEXT_PUBLIC_AMP_RIVE=1 once it's in.
 *
 * No flicker: the CSS Amp is always drawn first and stays until Rive has
 * drawn its first frame, then crossfades out. The runtime (~300KB gzipped
 * with its WASM) loads after the page is idle, never on the first scene's
 * critical path, and not at all under reduced motion — the still CSS Amp is
 * the right Amp there anyway.
 */

export const AMP_RIVE = {
  src: '/consult/amp.riv',
  artboard: 'Amp',
  stateMachine: 'Amp',
  inputs: { state: 'state', lean: 'lean' },
} as const

export const AMP_STATE_CODE: Record<AmpState, number> = {
  idle: 0,
  watching: 1,
  thinking: 2,
  reading: 3,
  calm: 4,
  charged: 5,
}

/** The `.riv` file's size budget, in bytes. */
export const AMP_RIV_BUDGET = 150 * 1024

export const ampRiveEnabled = (): boolean => process.env.NEXT_PUBLIC_AMP_RIVE === '1'
