/**
 * The first-month intro-offer LADDER (replaces the random scratch-to-reveal).
 *
 * A single GLOBAL, sequential discount everyone sees, that steps down as orders
 * come in: the odd 50% off (a loss-leader, tiny quota) → then 25% for a while →
 * then 10% → then cycles back to 50%. So "up to 50% off your first order" is
 * always honestly advertisable, the big discount stays rare, and the everyday
 * offer (25% / 10%) is chosen to stay profitable even if the member cancels
 * after month one (there's no minimum term any more).
 *
 * This module is PURE — the state lives in the KV store (see intro-offer.ts).
 */

/** One rung of the ladder: a first-month discount and how many checkouts at it
 *  before dropping to the next rung. */
export interface IntroStage {
  /** First-month discount, 0–1 (e.g. 0.5 = 50% off month one). */
  discount: number
  /** Checkouts at this rung before advancing. */
  quota: number
}

/** Global ladder position: which rung, and how many checkouts logged at it. */
export interface LadderState {
  stageIndex: number
  count: number
}

export const INITIAL_LADDER_STATE: LadderState = { stageIndex: 0, count: 0 }

/** The stage at the current (wrapped) index. */
export function stageOf(stages: IntroStage[], state: LadderState): IntroStage | null {
  if (stages.length === 0) return null
  const i = ((state.stageIndex % stages.length) + stages.length) % stages.length
  return stages[i]
}

/** The discount everyone is currently shown. */
export function currentLadderDiscount(stages: IntroStage[], state: LadderState): number {
  return stageOf(stages, state)?.discount ?? 0
}

/** The biggest discount on the ladder — the honest "up to X% off" headline. */
export function headlineLadderDiscount(stages: IntroStage[]): number {
  return stages.reduce((max, s) => Math.max(max, s.discount), 0)
}

/**
 * Advance the ladder after one checkout: bump the count, and when the current
 * rung's quota is met, drop to the next rung (wrapping back to the loss-leader
 * after the last). Pure — returns the next state.
 */
export function advanceLadder(stages: IntroStage[], state: LadderState): LadderState {
  const stage = stageOf(stages, state)
  if (!stage) return state
  const index = ((state.stageIndex % stages.length) + stages.length) % stages.length
  const count = state.count + 1
  if (count >= stage.quota) return { stageIndex: (index + 1) % stages.length, count: 0 }
  return { stageIndex: index, count }
}

/** Whether a rate is one of the ladder's discounts (guards a tampered override). */
export function isLadderDiscount(rate: number, stages: IntroStage[]): boolean {
  return stages.some((s) => s.discount === rate)
}
