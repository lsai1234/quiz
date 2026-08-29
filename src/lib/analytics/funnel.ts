/**
 * Quiz funnel — where people fall off.
 *
 * Counts SESSIONS, not events. A visitor who backtracks and re-answers a
 * question fires `quiz_step_view` three times; counting events would make that
 * step look popular when it is actually the one confusing people. One session
 * counted once per step is the only measure that says anything true about
 * drop-off.
 *
 * The steps come from whatever the events themselves report rather than from a
 * hard-coded list, because the quiz's step order is conditional (tracks, drinks
 * mode, the deep-dive branch) — a fixed ladder would show phantom drop-off at
 * every step a given cohort legitimately skipped. Ordering uses each step's
 * median reported index, which survives those branches.
 *
 * Pure — the caller reads the events and hands them in, so this is testable
 * without a database and reusable by anything that has events.
 */
import type { StoredEvent } from './repo'
import type { QuizArm } from '@/lib/experiments/assignment'

export interface FunnelStep {
  stepId: string
  /** Sessions that reached this step. */
  sessions: number
  /** Sessions lost between the previous step and this one. */
  dropped: number
  /** Share of the previous step's sessions lost here (0–1). */
  dropOffPct: number
  /** Share of everyone who started the quiz still here (0–1). */
  ofStartPct: number
  /** Median seconds spent on the step, from `quiz_step_complete`. */
  medianSeconds: number | null
}

export interface QuizFunnel {
  /** Sessions that started the quiz. */
  started: number
  steps: FunnelStep[]
  /** Sessions that finished every question. */
  completed: number
  /** Sessions that saw their built stack. */
  reachedReveal: number
  /** Sessions that started checkout. */
  startedCheckout: number
  /** Sessions with a server-verified purchase. */
  purchased: number
  /** purchased ÷ started (0–1). */
  conversionPct: number
  /** The step losing the most sessions — where to look first. */
  worstStep: { stepId: string; dropped: number; dropOffPct: number } | null
  /** Where sessions that abandoned were last seen, worst first. */
  abandonedAt: { stepId: string; sessions: number }[]
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : 0)

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Sessions that fired a given event at least once. */
function sessionsWith(events: StoredEvent[], name: string): Set<string> {
  const out = new Set<string>()
  for (const e of events) {
    if (e.event === name && e.sessionId) out.add(e.sessionId)
  }
  return out
}

/**
 * The arm each session was in.
 *
 * Every event carries an `arm` prop (stamped in `track`), but a session's very
 * first event can fire before `/api/config` has answered, and the unresolved
 * default is `v1`. So the rule is: a session is v2 if ANY of its events says
 * v2. `v1` is what you get when nothing was decided; `v2` is only ever set
 * deliberately, so it is the trustworthy half of the pair.
 */
export function sessionArms(events: StoredEvent[]): Map<string, QuizArm> {
  const arms = new Map<string, QuizArm>()
  for (const e of events) {
    if (!e.sessionId) continue
    const arm = e.props.arm
    if (arm === 'v2') arms.set(e.sessionId, 'v2')
    else if (arm === 'v1' && !arms.has(e.sessionId)) arms.set(e.sessionId, 'v1')
  }
  return arms
}

/** Only the events belonging to sessions in `arm`. Sessions with no arm at all
 *  (events recorded before the experiment shipped) count as v1. */
export function filterByArm(events: StoredEvent[], arm: QuizArm): StoredEvent[] {
  const arms = sessionArms(events)
  return events.filter((e) => e.sessionId != null && (arms.get(e.sessionId) ?? 'v1') === arm)
}

/**
 * @param arm Restrict to one arm of the quiz experiment. Omit for everyone,
 *            which is what the main dashboard shows.
 */
export function buildQuizFunnel(events: StoredEvent[], arm?: QuizArm): QuizFunnel {
  if (arm) events = filterByArm(events, arm)
  const started = sessionsWith(events, 'quiz_start')
  const completed = sessionsWith(events, 'quiz_complete')
  const reveal = sessionsWith(events, 'stack_reveal_view')
  const checkout = sessionsWith(events, 'checkout_start')
  const purchased = sessionsWith(events, 'purchase')

  // Per step: which sessions saw it, and where it sits in the sequence.
  const seen = new Map<string, Set<string>>()
  const indices = new Map<string, number[]>()
  const times = new Map<string, number[]>()

  for (const e of events) {
    const stepId = typeof e.props.stepId === 'string' ? e.props.stepId : null
    if (!stepId) continue

    if (e.event === 'quiz_step_view') {
      if (e.sessionId) seen.set(stepId, (seen.get(stepId) ?? new Set()).add(e.sessionId))
      if (typeof e.props.index === 'number') indices.set(stepId, [...(indices.get(stepId) ?? []), e.props.index])
    } else if (e.event === 'quiz_step_complete' && typeof e.props.msOnStep === 'number') {
      times.set(stepId, [...(times.get(stepId) ?? []), e.props.msOnStep / 1000])
    }
  }

  const ordered = [...seen.keys()].sort((a, b) => (median(indices.get(a) ?? []) ?? 0) - (median(indices.get(b) ?? []) ?? 0))

  let previous = started.size || (seen.get(ordered[0])?.size ?? 0)
  const steps: FunnelStep[] = ordered.map((stepId) => {
    const sessions = seen.get(stepId)?.size ?? 0
    // A step can't gain sessions; if it appears to, the previous step was simply
    // skipped by some cohort, so report no drop rather than a negative one.
    const dropped = Math.max(0, previous - sessions)
    const step: FunnelStep = {
      stepId,
      sessions,
      dropped,
      dropOffPct: pct(dropped, previous),
      ofStartPct: pct(sessions, started.size || sessions),
      medianSeconds: median(times.get(stepId) ?? []),
    }
    previous = sessions
    return step
  })

  const worst = steps.reduce<FunnelStep | null>((w, s) => (!w || s.dropped > w.dropped ? s : w), null)

  // `quiz_abandon` reports the last step a leaver saw — the same question asked
  // from the other end, and a useful cross-check on the drop-off above.
  const abandonCounts = new Map<string, Set<string>>()
  for (const e of events) {
    if (e.event !== 'quiz_abandon') continue
    const stepId = typeof e.props.lastStepId === 'string' ? e.props.lastStepId : null
    if (!stepId || !e.sessionId) continue
    abandonCounts.set(stepId, (abandonCounts.get(stepId) ?? new Set()).add(e.sessionId))
  }

  return {
    started: started.size,
    steps,
    completed: completed.size,
    reachedReveal: reveal.size,
    startedCheckout: checkout.size,
    purchased: purchased.size,
    conversionPct: pct(purchased.size, started.size),
    worstStep: worst && worst.dropped > 0 ? { stepId: worst.stepId, dropped: worst.dropped, dropOffPct: worst.dropOffPct } : null,
    abandonedAt: [...abandonCounts.entries()]
      .map(([stepId, s]) => ({ stepId, sessions: s.size }))
      .sort((a, b) => b.sessions - a.sessions),
  }
}
