'use client'

/**
 * The arm this browser is in, mirrored from the server.
 *
 * `/api/config` resolves the arm (it has the cookie and the settings); this is
 * where the answer lands so the quiz can read it synchronously. Mounted once
 * per page load by `PortalSync`, which the root layout already renders — so the
 * arm is resolved while the visitor is still looking at the hero, long before
 * Act 2 mounts. No extra request, no flash, no cost to first paint.
 *
 * Default is `v1` and stays `v1` if the config call never answers. An
 * experiment must never be the reason a quiz breaks.
 */

import { useSyncExternalStore } from 'react'
import type { QuizArm, QuizExperimentConfig } from './assignment'
import { DEFAULT_QUIZ_EXPERIMENT } from './assignment'

interface ArmState {
  arm: QuizArm
  /** Whether the server has actually answered yet. */
  resolved: boolean
  /** The parts of the experiment config the client legitimately needs. */
  aiSteer: boolean
  budget: QuizExperimentConfig['budget']
}

let state: ArmState = {
  arm: 'v1',
  resolved: false,
  aiSteer: DEFAULT_QUIZ_EXPERIMENT.aiSteer,
  budget: DEFAULT_QUIZ_EXPERIMENT.budget,
}

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function setQuizArm(next: Partial<ArmState> & { arm: QuizArm }): void {
  state = { ...state, ...next, resolved: true }
  emit()
}

export function getQuizArmState(): ArmState {
  return state
}

export function getQuizArm(): QuizArm {
  return state.arm
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Server snapshot is the default state so SSR and the first client render
 *  agree — the arm only ever changes after mount. */
const SERVER_SNAPSHOT: ArmState = {
  arm: 'v1',
  resolved: false,
  aiSteer: DEFAULT_QUIZ_EXPERIMENT.aiSteer,
  budget: DEFAULT_QUIZ_EXPERIMENT.budget,
}

export function useQuizArmState(): ArmState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_SNAPSHOT)
}

/** For tests. */
export function resetQuizArm(): void {
  state = { ...SERVER_SNAPSHOT }
  emit()
}
