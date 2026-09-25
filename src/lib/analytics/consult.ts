/**
 * Typed Amp Consult events (build H12), over `track()`.
 *
 * Nothing here carries an answer. Scene ids, positions, times and counts —
 * never what anyone said, and never anything from the circuit check beyond
 * whether it stopped the consult and which kind of stop it was, which is what
 * the funnel needs and all it needs.
 */
import { track } from './events'
import type { Route, SceneId } from '@/lib/consult/types'
import type { StopReason } from '@/lib/consult/circuit'

export const consultFunnel = {
  /** The route was chosen: top of the funnel. */
  start(p: { route: Route }) {
    track('consult_start', { route: p.route })
  },
  sceneView(p: { sceneId: SceneId; index: number; total: number; route: Route }) {
    track('consult_scene_view', { sceneId: p.sceneId, index: p.index, total: p.total, route: p.route })
  },
  /** Moved on from a scene: time on it, and how many times they touched its element. */
  sceneComplete(p: { sceneId: SceneId; index: number; msOnScene: number; interactions: number }) {
    track('consult_scene_complete', { sceneId: p.sceneId, index: p.index, msOnScene: p.msOnScene, interactions: p.interactions })
  },
  sceneBack(p: { from: SceneId; to: SceneId; via: 'back' | 'jump' }) {
    track('consult_scene_back', { from: p.from, to: p.to, via: p.via })
  },
  comfort(p: { on: boolean; via: 'offer' | 'toggle' }) {
    track('consult_comfort', { on: p.on, via: p.via })
  },
  stop(p: { reason: StopReason }) {
    track('consult_stop', { reason: p.reason })
  },
  /** Everything collected: analysis started. */
  complete(p: { route: Route; msTotal: number }) {
    track('consult_complete', { route: p.route, msTotal: p.msTotal })
  },
  /** "See my stacks": handed over to the results page. */
  handoff(p: { route: Route; stackSize: number }) {
    track('consult_handoff', { route: p.route, stackSize: p.stackSize })
  },
  abandon(p: { lastSceneId: SceneId }) {
    track('consult_abandon', { lastSceneId: p.lastSceneId })
  },
}
