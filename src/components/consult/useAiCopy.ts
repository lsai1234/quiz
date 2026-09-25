'use client'

import { useCallback, useEffect, useRef } from 'react'
import { COPY_BUDGET_MS, NEVER_AI, summariseForCopy, validateSceneCopy, type AiSceneCopy } from '@/lib/consult/ai/copy'
import { isAnswered, resolveSceneDef, sceneAfter, type FlowState, type SceneDef } from '@/lib/consult/flow'
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
 */

const key = (scene: SceneId, answers: ConsultAnswers) => `${scene}|${summariseForCopy(answers)}`

export async function fetchSceneCopy(scene: SceneDef, answers: ConsultAnswers, previous?: SceneId | null, signal?: AbortSignal): Promise<AiSceneCopy | null> {
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
    const data = (await res.json()) as { copy?: unknown }
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

  const ready = state.phase === 'scenes' && isAnswered(state.sceneId, state.answers)
  const next = ready ? sceneAfter(state.sceneId, state.answers) : null
  const summary = summariseForCopy(state.answers)

  useEffect(() => {
    if (!enabled || !next || NEVER_AI.includes(next)) return
    const k = key(next, state.answers)
    if (cache.current.has(k) || inflight.current.has(k)) return
    inflight.current.add(k)
    const scene = resolveSceneDef(next, state.answers)
    // The scene being answered now is the one the next scene reacts to (V4).
    void fetcher(scene, state.answers, state.sceneId).then((copy) => {
      inflight.current.delete(k)
      cache.current.set(k, copy)
    })
    // `summary` stands in for the answers: it's all the words depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, next, summary, fetcher])

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

  return { words }
}
