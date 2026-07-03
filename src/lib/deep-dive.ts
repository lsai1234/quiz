'use client'

import { useQuizStore } from './store'
import {
  deepDiveKey,
  fallbackQuestions,
  type DynamicQuestion,
} from './ai-questions'

// Client-side orchestration for the AI deep-dive step. Generation is
// prefetched when the user leaves the lifestyle step, so the questions are
// normally ready before they arrive at deepDive — the quiz never waits on
// OpenAI. Every failure path lands on the static fallback bank, so the step
// always renders.

/** How long the deepDive step will show its loading state before giving up
 *  and rendering the fallback questions. */
export const DEEP_DIVE_WAIT_MS = 5000

/**
 * Kicks off question generation for the current answers if we don't already
 * have (or aren't already fetching) questions for this answer fingerprint.
 * Safe to call repeatedly — deduped via the fingerprint in the store.
 */
export function maybePrefetchDeepDive(): void {
  const { answers, deepDiveKey: currentKey, deepDiveStatus, setDeepDive } = useQuizStore.getState()
  const key = deepDiveKey(answers)
  if (currentKey === key && deepDiveStatus !== 'idle') return

  // Answers changed since the last generation — stale questions (and any
  // answers given to them) no longer apply.
  setDeepDive({ questions: null, status: 'loading', key })
  useQuizStore.getState().setAnswer('dynamicAnswers', {})

  void (async () => {
    let questions: DynamicQuestion[] | null = null
    try {
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.generated && Array.isArray(data.questions) && data.questions.length > 0) {
          questions = data.questions as DynamicQuestion[]
        }
      }
    } catch {
      // fall through to fallback
    }

    // Only apply if this request is still the current one (the user may have
    // back-edited answers meanwhile, starting a newer fetch) and the fallback
    // hasn't already been shown (never swap questions out from under the user).
    const s = useQuizStore.getState()
    if (s.deepDiveKey !== key || s.deepDiveStatus !== 'loading') return
    s.setDeepDive({ questions: questions ?? fallbackQuestions(answers.track), status: 'ready' })
  })()
}

/** Gives up waiting on generation and shows the static fallback questions. */
export function applyDeepDiveFallback(): void {
  const s = useQuizStore.getState()
  if (s.deepDiveStatus === 'ready') return
  s.setDeepDive({
    questions: fallbackQuestions(s.answers.track),
    status: 'ready',
    key: s.deepDiveKey ?? deepDiveKey(s.answers),
  })
}
