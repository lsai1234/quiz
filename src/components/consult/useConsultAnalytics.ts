'use client'

import { useCallback, useEffect, useRef } from 'react'
import { consultFunnel } from '@/lib/analytics/consult'
import { circuitOutcome } from '@/lib/consult/circuit'
import { visibleScenes, type FlowState } from '@/lib/consult/flow'
import type { SceneId } from '@/lib/consult/types'

/**
 * The consult's funnel, emitted from its flow state (build H12).
 *
 * Watches the phase and the scene and reports what changed: a scene viewed,
 * a scene completed (with its time and how many touches it took), a step
 * back, a stop, the end of collecting. Leaving mid-consult sends an abandon
 * from the last scene seen. `noteInteraction` is called on every answer, so
 * "time per interaction" can be read as time on scene over touches.
 */
export function useConsultAnalytics(state: FlowState, enabled: boolean) {
  const last = useRef<{ phase: FlowState['phase']; sceneId: SceneId; at: number; interactions: number } | null>(null)

  const noteInteraction = useCallback(() => {
    if (last.current) last.current.interactions++
  }, [])

  useEffect(() => {
    if (!enabled) return
    const now = Date.now()
    const route = state.answers.route ?? 'deep'
    const order = visibleScenes(state.answers)
    const prev = last.current

    const complete = (p: NonNullable<typeof prev>) =>
      consultFunnel.sceneComplete({
        sceneId: p.sceneId,
        index: order.indexOf(p.sceneId) + 1,
        msOnScene: now - p.at,
        interactions: p.interactions,
      })

    if (state.phase === 'scenes') {
      if (!prev || prev.phase === 'intro') consultFunnel.start({ route })
      if (!prev || prev.sceneId !== state.sceneId || prev.phase !== 'scenes') {
        if (prev && prev.phase === 'scenes' && prev.sceneId !== state.sceneId) {
          if (state.direction === 'forward') complete(prev)
          else consultFunnel.sceneBack({ from: prev.sceneId, to: state.sceneId, via: state.returnTo ? 'jump' : 'back' })
        }
        consultFunnel.sceneView({ sceneId: state.sceneId, index: order.indexOf(state.sceneId) + 1, total: order.length, route })
        last.current = { phase: 'scenes', sceneId: state.sceneId, at: now, interactions: 0 }
      }
      return
    }

    if (prev && prev.phase === 'scenes') {
      if (state.phase === 'analysis') {
        complete(prev)
        consultFunnel.complete({ route, msTotal: now - state.startedAt })
      } else if (state.phase === 'stop') {
        const outcome = circuitOutcome(state.answers)
        consultFunnel.stop({ reason: outcome.kind === 'stop' ? outcome.reason : 'declined' })
      }
    }
    last.current = { phase: state.phase, sceneId: state.sceneId, at: now, interactions: 0 }
  }, [enabled, state.phase, state.sceneId, state.direction, state.returnTo, state.answers, state.startedAt])

  // Leaving mid-consult: the last scene seen is where they dropped.
  useEffect(() => {
    if (!enabled) return
    const onHide = () => {
      if (last.current?.phase === 'scenes') consultFunnel.abandon({ lastSceneId: last.current.sceneId })
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [enabled])

  return { noteInteraction }
}
