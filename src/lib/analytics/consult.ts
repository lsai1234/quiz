/**
 * Typed Amp Consult events (build H12), over `track()`.
 *
 * Nothing here carries an answer. Scene ids, positions, times and counts —
 * never what anyone said, and never anything from the circuit check beyond
 * whether it stopped the consult. A stop there is recorded as `circuit`, never
 * as pregnancy or a kidney or liver condition: that would be health data
 * against a session id, and the funnel only needs to know the check stopped it.
 *
 * Every consult event also carries the visitor's consult arm (`consultArm`:
 * consult, quiz or both, from `consultArmFor`), so the hub can read the A/B by
 * assignment rather than only by which door was used.
 */
import { track, type EventProps } from './events'
import type { Route, SceneId } from '@/lib/consult/types'
import type { StopReason } from '@/lib/consult/circuit'
import { consultArmFor } from '@/lib/experiments/consult'
import { getQuizArmState } from '@/lib/experiments/client'

/** How a stop is recorded: which gate, never which answer. */
export type ConsultStopKind = 'under-18' | 'circuit' | 'declined'

export function stopKindOf(reason: StopReason): ConsultStopKind {
  return reason === 'pregnancy' || reason === 'kidney-liver' ? 'circuit' : reason
}

function consultEvent(event: Parameters<typeof track>[0], props: EventProps): void {
  track(event, { ...props, consultArm: consultArmFor(getQuizArmState().heroOffer) })
}

export const consultFunnel = {
  /** The route was chosen: top of the funnel. */
  start(p: { route: Route }) {
    consultEvent('consult_start', { route: p.route })
  },
  sceneView(p: { sceneId: SceneId; index: number; total: number; route: Route }) {
    consultEvent('consult_scene_view', { sceneId: p.sceneId, index: p.index, total: p.total, route: p.route })
  },
  /** Moved on from a scene: time on it, and how many times they touched its element. */
  sceneComplete(p: { sceneId: SceneId; index: number; msOnScene: number; interactions: number }) {
    consultEvent('consult_scene_complete', { sceneId: p.sceneId, index: p.index, msOnScene: p.msOnScene, interactions: p.interactions })
  },
  sceneBack(p: { from: SceneId; to: SceneId; via: 'back' | 'jump' }) {
    consultEvent('consult_scene_back', { from: p.from, to: p.to, via: p.via })
  },
  comfort(p: { on: boolean; via: 'auto' | 'offer' | 'toggle' }) {
    consultEvent('consult_comfort', { on: p.on, via: p.via })
  },
  stop(p: { reason: StopReason }) {
    consultEvent('consult_stop', { reason: stopKindOf(p.reason) })
  },
  /** Everything collected: analysis started. */
  complete(p: { route: Route; msTotal: number }) {
    consultEvent('consult_complete', { route: p.route, msTotal: p.msTotal })
  },
  /** "See my stack": handed over to the results page. */
  handoff(p: { route: Route; stackSize: number }) {
    consultEvent('consult_handoff', { route: p.route, stackSize: p.stackSize })
  },
  abandon(p: { lastSceneId: SceneId }) {
    consultEvent('consult_abandon', { lastSceneId: p.lastSceneId })
  },
  /** "Want me to pinpoint it?" taken from a Speed run or Deep charge review. */
  upgrade(p: { from: 'speed' | 'deep' }) {
    consultEvent('consult_upgrade', { from: p.from })
  },
  /** "Did Amp get you?" on Fully charged, and how many patterns it had found. */
  gotYou(p: { answer: GotYou; found: number }) {
    consultEvent('consult_got_you', { answer: p.answer, found: p.found })
  },
}

export type GotYou = 'spot-on' | 'mostly' | 'not-really'
