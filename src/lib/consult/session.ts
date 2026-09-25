'use client'

/**
 * The last finished consult, for "change my answers" (build H10).
 *
 * Held two ways. In memory for this page session — including the circuit
 * check's answers, so a round trip from the results page and back loses
 * nothing. And on the device through the ordinary save, which keeps
 * everything except the circuit check: after a reload, those are asked again,
 * as they are for any resumed consult.
 */

import type { FlowState } from './flow'
import { loadConsult } from './persist'

let finished: FlowState | null = null

export function rememberFinished(state: FlowState): void {
  finished = { ...state, phase: 'done' }
}

export function forgetFinished(): void {
  finished = null
}

/** The finished consult to reopen: this session's if there is one, else the device's. */
export function finishedConsult(): FlowState | null {
  if (finished) return finished
  const saved = loadConsult()
  return saved && saved.phase === 'done' ? saved : null
}

/** A finished consult, reopened on its review screen with every answer in place. */
export function reopenAtReview(state: FlowState): FlowState {
  return {
    ...state,
    phase: 'scenes',
    sceneId: 'review',
    returnTo: null,
    direction: 'back',
    history: state.history.filter((s) => s !== 'review' && s !== 'circuit'),
  }
}
