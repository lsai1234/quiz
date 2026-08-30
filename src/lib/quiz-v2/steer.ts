'use client'

import { useCallback, useRef, useState } from 'react'
import { funnel } from '@/lib/analytics/quiz'
import { planNext, rankCandidates } from './planner'
import { answerQuestion } from './interview'
import { questionById } from './bank'
import { buildSteerRequest, parseSteerResult, type SteerResult } from './ai'
import type { InterviewState } from './types'

/**
 * The AI steer — the client half.
 *
 * ── The one rule ────────────────────────────────────────────────────────────
 * Nothing on screen ever waits for this. Not with a spinner, not with a
 * skeleton, not for 200ms. The planner has already decided what to show and has
 * already shown it. `prefetch` returns void and there is deliberately no way to
 * await it — an API that could be awaited would eventually be awaited.
 *
 * ── The timing, precisely ───────────────────────────────────────────────────
 * The request fires the instant an answer is committed, against the state that
 * answer produced. The planner immediately renders the next question from that
 * same state without waiting, so the reply — arriving a second or so later,
 * while the user reads — is in hand for the decision AFTER that. One question
 * ahead, with the round trip hidden entirely inside think-time.
 *
 * ── Why a late reply is harmless rather than discarded ──────────────────────
 * A preference list is only ever advisory, and `planNext` matches it against
 * questions that are eligible right now. A list computed one answer ago still
 * contains ids that are still eligible; the one question that has since been
 * consumed is simply skipped. So an old list degrades to "the model's next
 * choice" rather than to a wrong question, and there is no need to throw it
 * away.
 *
 * The reflection is different: it names what the last answer told us, so it is
 * wrong rather than merely stale once another answer has landed. That one is
 * gated on the exact position it was written for.
 *
 * A slow steer therefore does not make the quiz slower. It makes it less
 * clever, silently — and `quiz_ai_steer` is how we find out that is happening.
 */

/** Past this the reply cannot be in time for anything. */
const TIMEOUT_MS = 2500

interface Landed {
  /** `asked.length` this was computed at. */
  at: number
  prefer: string[]
  reflection: string | null
}

export interface Steer {
  /** Ids to prefer, best first. Safe to use at any age — see the note above. */
  prefer: string[]
  /** Shown only when it describes the answer the user just gave. */
  reflection: string | null
  /** Fire the request for the question after next. Never await this. */
  prefetch: (stateAfterAnswer: InterviewState) => void
}

export function useSteer(state: InterviewState, enabled: boolean): Steer {
  const [landed, setLanded] = useState<Landed | null>(null)
  /** The position a request is out for, so the same one is not fired twice. */
  const inFlightFor = useRef<number | null>(null)

  const prefetch = useCallback((next: InterviewState) => {
    if (!enabled) return
    const at = next.asked.length
    if (inFlightFor.current === at) return

    const candidates = rankCandidates(next).map((q) => q.question)
    // With fewer than two there is no ordering to make, and rewording one
    // question is not worth a request.
    if (candidates.length < 2) return

    /*
     * Is there a planned decision left for this reply to land on?
     *
     * A steer fired now arrives while the user is on the screen about to
     * render, and is applied to the decision AFTER that one. If that decision
     * is a fixed screen there is nothing to re-order and the call buys nothing.
     *
     * Measured across 21 representative runs, 1.9 of every 6.8 calls were
     * exactly this — mostly the opening, where goals → safety → dosing are all
     * fixed and no amount of ranking changes what comes next, plus the tail
     * where the only thing left is already-taking and then the review. Better
     * than a quarter of the spend, bought nothing.
     */
    const upcoming = planNext(next).question
    if (!upcoming) return
    if (upcoming.fixed) {
      // An empty answer is what the renderer commits for these anyway, so this
      // peek is the real next state rather than a guess.
      const after = planNext(answerQuestion(next, upcoming, [])).question
      if (!after || after.fixed) return
    }

    inFlightFor.current = at
    const startedAt = performance.now()
    const lastId = next.asked[next.asked.length - 1]
    const request = buildSteerRequest(next, candidates, lastId ? questionById(lastId) ?? null : null)
    const allowed = candidates.map((q) => q.id)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    void (async () => {
      let result: SteerResult | null = null
      let reason: 'ok' | 'timeout' | 'invalid' | 'nokey' | 'error' = 'error'
      try {
        const res = await fetch('/api/quiz/next-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        })
        if (res.ok) {
          const data = await res.json()
          if (data?.unavailable) {
            reason = 'nokey'
          } else {
            result = parseSteerResult(data, allowed)
            reason = result ? 'ok' : 'invalid'
          }
        }
      } catch (err) {
        reason = (err as Error)?.name === 'AbortError' ? 'timeout' : 'error'
      } finally {
        clearTimeout(timer)
        if (inFlightFor.current === at) inFlightFor.current = null
      }

      funnel.aiSteer({
        used: !!result,
        latencyMs: Math.round(performance.now() - startedAt),
        reason,
        applied: !result ? 'none'
          : result.order.length && Object.keys(result.copy).length ? 'both'
          : result.order.length ? 'order'
          : 'copy',
      })

      if (!result) return
      setLanded({ at, prefer: result.order, reflection: result.reflection })
    })()
  }, [enabled])

  return {
    prefer: landed?.prefer ?? [],
    // Only when it is about the answer they just gave.
    reflection: landed && landed.at === state.asked.length ? landed.reflection : null,
    prefetch,
  }
}
