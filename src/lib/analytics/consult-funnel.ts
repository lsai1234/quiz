/**
 * The Amp Consult funnel (build H12): drop-off per scene, time per
 * interaction, and consult → results → subscription against the quiz.
 *
 * Counts sessions, not events, for the same reason the quiz funnel does: a
 * visitor who goes back and forth on a scene fires its view three times, and
 * counting events would make the scene that confuses people look popular.
 *
 * Pure — the caller reads the events and hands them in.
 */
import type { StoredEvent } from './repo'

export interface ConsultSceneStep {
  sceneId: string
  sessions: number
  dropped: number
  dropOffPct: number
  medianSeconds: number | null
  /** Median touches on the scene's element before moving on. */
  medianInteractions: number | null
  /** Median seconds per touch: time on scene over touches, per session. */
  secondsPerInteraction: number | null
}

export interface DoorFunnel {
  started: number
  /** Consult: everything collected. Quiz: every question answered. */
  completed: number
  reachedResults: number
  startedCheckout: number
  purchased: number
  subscribed: number
  /** subscribed ÷ started (0–1). */
  subscriptionPct: number
  /** purchased ÷ started (0–1). */
  conversionPct: number
}

export interface ConsultFunnel extends DoorFunnel {
  scenes: ConsultSceneStep[]
  handedOver: number
  stopped: Record<string, number>
  worstScene: { sceneId: string; dropped: number; dropOffPct: number } | null
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : 0)

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function sessionsWith(events: StoredEvent[], name: string, within?: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const e of events) {
    if (e.event === name && e.sessionId && (!within || within.has(e.sessionId))) out.add(e.sessionId)
  }
  return out
}

const isSubscription = (e: StoredEvent) => typeof e.props.journey_variant === 'string' && e.props.journey_variant.endsWith('_subscription')

/** Start → finish → results → checkout → purchase → subscription, for the sessions that came in one door. */
function door(events: StoredEvent[], startEvent: string, completeEvent: string): DoorFunnel {
  const started = sessionsWith(events, startEvent)
  const purchased = sessionsWith(events, 'purchase', started)
  const subscribed = new Set(
    events.filter((e) => e.event === 'purchase' && e.sessionId && started.has(e.sessionId) && isSubscription(e)).map((e) => e.sessionId!),
  )
  return {
    started: started.size,
    completed: sessionsWith(events, completeEvent, started).size,
    reachedResults: sessionsWith(events, 'stack_reveal_view', started).size,
    startedCheckout: sessionsWith(events, 'checkout_start', started).size,
    purchased: purchased.size,
    subscribed: subscribed.size,
    subscriptionPct: pct(subscribed.size, started.size),
    conversionPct: pct(purchased.size, started.size),
  }
}

export function buildConsultFunnel(events: StoredEvent[]): ConsultFunnel {
  const base = door(events, 'consult_start', 'consult_complete')
  const started = sessionsWith(events, 'consult_start')

  const seen = new Map<string, Set<string>>()
  const index = new Map<string, number[]>()
  const secs = new Map<string, number[]>()
  const touches = new Map<string, number[]>()
  const perTouch = new Map<string, number[]>()
  const push = (m: Map<string, number[]>, k: string, v: number) => m.set(k, [...(m.get(k) ?? []), v])

  for (const e of events) {
    const sceneId = typeof e.props.sceneId === 'string' ? e.props.sceneId : null
    if (!sceneId || !e.sessionId) continue
    if (e.event === 'consult_scene_view') {
      seen.set(sceneId, (seen.get(sceneId) ?? new Set()).add(e.sessionId))
      if (typeof e.props.index === 'number') push(index, sceneId, e.props.index)
    } else if (e.event === 'consult_scene_complete' && typeof e.props.msOnScene === 'number') {
      const s = e.props.msOnScene / 1000
      push(secs, sceneId, s)
      if (typeof e.props.interactions === 'number') {
        push(touches, sceneId, e.props.interactions)
        if (e.props.interactions > 0) push(perTouch, sceneId, s / e.props.interactions)
      }
    }
  }

  const ordered = [...seen.keys()].sort((a, b) => (median(index.get(a) ?? []) ?? 0) - (median(index.get(b) ?? []) ?? 0))
  let previous = started.size || (seen.get(ordered[0])?.size ?? 0)
  const scenes: ConsultSceneStep[] = ordered.map((sceneId) => {
    const sessions = seen.get(sceneId)?.size ?? 0
    // A speed run skips scenes a deep charge sees; a scene can't gain sessions.
    const dropped = Math.max(0, previous - sessions)
    const step = {
      sceneId,
      sessions,
      dropped,
      dropOffPct: pct(dropped, previous),
      medianSeconds: median(secs.get(sceneId) ?? []),
      medianInteractions: median(touches.get(sceneId) ?? []),
      secondsPerInteraction: median(perTouch.get(sceneId) ?? []),
    }
    previous = sessions
    return step
  })
  const worst = scenes.reduce<ConsultSceneStep | null>((w, s) => (!w || s.dropped > w.dropped ? s : w), null)

  const stopped: Record<string, number> = {}
  const stopSessions = new Map<string, Set<string>>()
  for (const e of events) {
    if (e.event !== 'consult_stop' || !e.sessionId) continue
    const reason = typeof e.props.reason === 'string' ? e.props.reason : 'unknown'
    stopSessions.set(reason, (stopSessions.get(reason) ?? new Set()).add(e.sessionId))
  }
  for (const [reason, s] of stopSessions) stopped[reason] = s.size

  return {
    ...base,
    scenes,
    handedOver: sessionsWith(events, 'consult_handoff', started).size,
    stopped,
    worstScene: worst && worst.dropped > 0 ? { sceneId: worst.sceneId, dropped: worst.dropped, dropOffPct: worst.dropOffPct } : null,
  }
}

/** The two front doors, side by side: the consult and the quiz. */
export function compareDoors(events: StoredEvent[]): { consult: ConsultFunnel; quiz: DoorFunnel } {
  return { consult: buildConsultFunnel(events), quiz: door(events, 'quiz_start', 'quiz_complete') }
}
