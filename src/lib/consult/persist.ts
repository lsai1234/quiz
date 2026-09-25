/**
 * Save & resume (build S11).
 *
 * The consult is saved on the device, under its consult ID, after every
 * change. Two ways back in:
 *
 *   - A refresh, or a trip away and back in the same tab, returns straight to
 *     the same scene with every answer intact. The tab remembers which consult
 *     it was running (`sessionStorage`), so there is nothing to ask.
 *   - Coming back later — a new tab, the next day — offers a resume prompt,
 *     because somebody else may be holding the phone and "pick up where you
 *     left off?" is theirs to answer.
 *
 * ── What is not saved ───────────────────────────────────────────────────────
 * The circuit check's answers. They are health data (pregnancy, medicines,
 * heart, kidney and liver), the check is never skippable, and it is the last
 * scene — so a resumed consult simply asks them again. Nothing is lost, and a
 * shared family tablet never holds somebody's medicines in local storage.
 *
 * ── How long ────────────────────────────────────────────────────────────────
 * A week, the same as the quiz: well past "I'll finish this after dinner",
 * well short of forever. Older saves are dropped on read.
 *
 * Every storage call is wrapped. Safari's private mode throws rather than
 * returning null, and a consult that can't start because storage is missing
 * would be far worse than one that can't resume.
 */

import { SCRIPT_VERSION, type FlowState } from './flow'

export const CONSULT_STORAGE_KEY = 'chrgd-consult'
export const CONSULT_SESSION_KEY = 'chrgd-consult-active'
export const CONSULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface Saved {
  v: 1
  savedAt: number
  state: FlowState
}

function local(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function session(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** The state as it is written to disk: without the circuit check's answers. */
export function forStorage(state: FlowState): FlowState {
  const answers = { ...state.answers, circuit: null }
  // If they were on the circuit check or past it, resume on the circuit check.
  const past = state.sceneId === 'circuit' || state.phase !== 'scenes'
  return {
    ...state,
    answers,
    phase: past ? 'scenes' : state.phase,
    sceneId: past ? 'circuit' : state.sceneId,
  }
}

export function saveConsult(state: FlowState, now = Date.now()): void {
  const saved: Saved = { v: 1, savedAt: now, state: forStorage(state) }
  try {
    local()?.setItem(CONSULT_STORAGE_KEY, JSON.stringify(saved))
    session()?.setItem(CONSULT_SESSION_KEY, state.consultId)
  } catch {
    // Storage full or unavailable: the consult still works, it just won't resume.
  }
}

/** The saved consult, if there is a fresh one written by this version of the script. */
export function loadConsult(now = Date.now()): FlowState | null {
  try {
    const raw = local()?.getItem(CONSULT_STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Saved
    if (saved?.v !== 1 || typeof saved.savedAt !== 'number' || now - saved.savedAt > CONSULT_TTL_MS) {
      clearConsult()
      return null
    }
    if (saved.state?.scriptVersion !== SCRIPT_VERSION) {
      // The scenes changed underneath the save. Resuming could land on a scene
      // that no longer exists; starting fresh is the honest failure.
      clearConsult()
      return null
    }
    return saved.state
  } catch {
    return null
  }
}

export function clearConsult(): void {
  try {
    local()?.removeItem(CONSULT_STORAGE_KEY)
    session()?.removeItem(CONSULT_SESSION_KEY)
  } catch {
    // Nothing to do.
  }
}

/** Whether this tab was already running this consult (a refresh, not a return). */
export function isSameSession(consultId: string): boolean {
  try {
    return session()?.getItem(CONSULT_SESSION_KEY) === consultId
  } catch {
    return false
  }
}

/** Whether this tab has a consult in progress — the hero uses it to reopen the consult on refresh. */
export function hasActiveConsultSession(): boolean {
  const saved = loadConsult()
  return Boolean(saved && isSameSession(saved.consultId))
}

/** Worth offering to resume: they got past the first scene. */
export function isResumable(state: FlowState | null): state is FlowState {
  return Boolean(state && state.history.length > 0)
}
