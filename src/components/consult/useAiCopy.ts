'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { COPY_BUDGET_MS, NEVER_AI, summariseForCopy, validateSceneCopy, type AiSceneCopy } from '@/lib/consult/ai/copy'
import { isAnswered, resolveSceneDef, sceneAfter, visibleScenes, type FlowState, type SceneDef } from '@/lib/consult/flow'
import type { ConsultAnswers, SceneId } from '@/lib/consult/types'

/**
 * AI-worded scenes, on the client (build V2).
 *
 * The words for the NEXT scene are asked for as soon as the current one is
 * answered — while the person is still looking at it — so by the time they
 * press Next they are usually already here. A scene takes its AI words only if
 * they were in hand the moment it appeared; words that arrive late are kept
 * for next time, never swapped in under someone's eyes. Anything slow, failed
 * or invalid leaves the scripted copy, with no visible break.
 *
 * The first scene has no scene before it, so its words are asked for while
 * the route choice is on screen.
 *
 * Lost signal (V6): after `BREAKER` misses in a row the hook stops asking for
 * words for the rest of the visit — a down or slow service costs nothing more,
 * and the consult carries on in its scripted words. That only stops the
 * *wording*: "Tell Amp more", voice and uploads have fallbacks of their own
 * and stay. Only `unavailable` — the server saying it has no AI configured —
 * takes them away, since then there's nothing to answer them.
 */

/** The server has no AI configured: nothing to ask. */
export const UNAVAILABLE = 'unavailable' as const

/** Consecutive misses before the consult stops asking. */
export const BREAKER = 3

const key = (scene: SceneId, answers: ConsultAnswers) => `${scene}|${summariseForCopy(answers)}`

export async function fetchSceneCopy(scene: SceneDef, answers: ConsultAnswers, previous?: SceneId | null, signal?: AbortSignal): Promise<AiSceneCopy | null | typeof UNAVAILABLE> {
  try {
    const res = await fetch('/api/consult/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneId: scene.id, answers, previous: previous ?? null }),
      // `AbortSignal.timeout` is recent; without it there's no client-side cap,
      // and the server's own budget still ends the request.
      signal: signal ?? (typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(COPY_BUDGET_MS) : undefined),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { copy?: unknown; unavailable?: boolean }
    if (data.unavailable) return UNAVAILABLE
    // The browser validates too: it doesn't trust the network either.
    return data.copy ? validateSceneCopy(data.copy, scene) : null
  } catch {
    return null
  }
}

export function useAiCopy(state: FlowState, enabled: boolean, fetcher = fetchSceneCopy) {
  const cache = useRef(new Map<string, AiSceneCopy | null>())
  const inflight = useRef(new Set<string>())
  const visit = useRef<{ sceneId: SceneId | null; copy: AiSceneCopy | null }>({ sceneId: null, copy: null })
  const misses = useRef(0)
  const [aiDown, setAiDown] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  const ready = state.phase === 'scenes' && isAnswered(state.sceneId, state.answers)
  const next = state.phase === 'intro' ? visibleScenes(state.answers)[0] ?? null : ready ? sceneAfter(state.sceneId, state.answers) : null
  const summary = summariseForCopy(state.answers)

  useEffect(() => {
    if (!enabled || aiDown || unavailable || !next || NEVER_AI.includes(next)) return
    const k = key(next, state.answers)
    if (cache.current.has(k) || inflight.current.has(k)) return
    inflight.current.add(k)
    const scene = resolveSceneDef(next, state.answers)
    // The scene being answered now is the one the next scene reacts to (V4).
    // On the route choice there's no answered scene to react to.
    const previous = state.phase === 'intro' ? null : state.sceneId
    void fetcher(scene, state.answers, previous).then((result) => {
      inflight.current.delete(k)
      if (result === UNAVAILABLE) {
        setUnavailable(true)
        return
      }
      const copy = result
      cache.current.set(k, copy)
      misses.current = copy ? 0 : misses.current + 1
      if (misses.current >= BREAKER) setAiDown(true)
    })
    // `summary` stands in for the answers: it's all the words depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, aiDown, unavailable, next, summary, fetcher])

  /** The scene as shown this visit: its AI words if they were ready when it appeared. */
  const words = useCallback(
    (scene: SceneDef): SceneDef => {
      if (visit.current.sceneId !== scene.id) {
        visit.current = { sceneId: scene.id, copy: enabled ? cache.current.get(key(scene.id, state.answers)) ?? null : null }
      }
      const ai = visit.current.copy
      if (!ai || NEVER_AI.includes(scene.id)) return scene
      return { ...scene, copy: { ...scene.copy, question: ai.question, hint: ai.hint, labels: ai.labels, react: ai.react } }
    },
    [enabled, state.answers],
  )

  return { words, aiDown, unavailable }
}
