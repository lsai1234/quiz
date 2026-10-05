import { kvGet, kvSet } from '@/lib/db/kv'
import { QUIZ_STEPS } from '@/lib/quiz-flow'
import { questionById } from '@/lib/quiz-v2/bank'
import type { QuizArm } from '@/lib/experiments/assignment'
import { listEventsSince } from './repo'
import { buildQuizFunnel, QUIZ_FUNNEL_EVENTS, type FunnelStep } from './funnel'
import { backfillSessions, contextRecordedSince, earliestSession, listSessions, SESSION_CAP } from './sessions'
import {
  buildReport,
  keepRow,
  resolveRange,
  type RangeKey,
  type Report,
  type SegmentFilter,
} from './report'

/**
 * The Analytics page's data, assembled and cached. Server-only.
 *
 * The visit rows make the report itself cheap; what this adds is the one part
 * that still needs events — the question-by-question ladder, which only the
 * step views can tell — and a few minutes of caching on the views a founder
 * opens most, for the reason `funnel-cache.ts` gives.
 */

/** How long a computed report stands. Shown on the page, with a Recount. */
const TTL_MS = 3 * 60_000

/** The ladder reads events; past this many it describes the most recent ones. */
const LADDER_EVENT_CAP = 60_000

export interface LadderStep extends FunnelStep {
  label: string
}

export interface Ladder {
  arm: QuizArm
  label: string
  started: number
  completed: number
  steps: LadderStep[]
}

export interface AnalyticsPayload {
  asOf: string
  report: Report
  /** Question by question, one ladder per quiz version that had visitors. */
  ladders: Ladder[]
  /** The ladder's read reached its cap and covers the most recent visits only. */
  ladderSampled: boolean
  /** Older visits are still being rebuilt from their events. */
  importing: boolean
}

/** A step id as a founder would recognise it: the question, not the key. */
export function stepLabel(id: string): string {
  const v1 = QUIZ_STEPS.find((s) => s.id === id)
  if (v1) return v1.q
  const v2 = questionById(id)
  if (v2) return v2.prompt
  return id
}

const ARM_LABEL: Record<QuizArm, string> = { v1: 'Original quiz', v2: 'Adaptive quiz' }

export async function analyticsReport(options: {
  range: RangeKey
  filters?: SegmentFilter[]
  includeInternal?: boolean
  fresh?: boolean
}): Promise<AnalyticsPayload> {
  const filters = options.filters ?? []
  const includeInternal = options.includeInternal ?? false

  // Rebuilding history from old events, a few seconds at a time, until done.
  // A no-op once it has finished.
  const history = await backfillSessions()

  // Only the unfiltered views are cached: they are what the page opens on,
  // and a cache row per filter combination would grow without end.
  const key = filters.length === 0 ? `analytics:report:${options.range}:${includeInternal ? 'all' : 'visitors'}` : null
  if (key && !options.fresh && history.done) {
    try {
      const hit = await kvGet<AnalyticsPayload>(key)
      if (hit?.asOf && Date.now() - Date.parse(hit.asOf) < TTL_MS) return hit
    } catch {
      /* compute it */
    }
  }

  const now = Date.now()
  const earliest = options.range === 'all' ? await earliestSession() : null
  const range = resolveRange(options.range, now, earliest ? Date.parse(earliest) : null)
  const toIso = new Date(range.to).toISOString()
  const fromIso = range.from === null ? null : new Date(range.from).toISOString()

  const [rows, previousRows, events, contextSince] = await Promise.all([
    listSessions(fromIso, toIso),
    range.previous ? listSessions(new Date(range.previous.from).toISOString(), new Date(range.previous.to).toISOString()) : Promise.resolve(null),
    listEventsSince(fromIso ?? new Date(0).toISOString(), LADDER_EVENT_CAP, { events: QUIZ_FUNNEL_EVENTS, until: toIso }),
    contextRecordedSince(),
  ])

  const report = buildReport({
    rows,
    previousRows,
    range,
    filters,
    includeInternal,
    labelForStep: stepLabel,
    capped: rows.length >= SESSION_CAP,
    contextSince,
  })

  // The ladder answers the same question as the rest of the page, so it counts
  // the same visits: the filters and the founders' own visits apply to it too.
  const kept = new Set(rows.filter((r) => keepRow(r, filters, includeInternal)).map((r) => r.session_id))
  const ladderEvents = events.filter((e) => e.sessionId !== null && kept.has(e.sessionId))
  const ladders: Ladder[] = (['v1', 'v2'] as const)
    .map((arm) => {
      const f = buildQuizFunnel(ladderEvents, arm)
      return {
        arm,
        label: ARM_LABEL[arm],
        started: f.started,
        completed: f.completed,
        steps: f.steps.map((s) => ({ ...s, label: stepLabel(s.stepId) })),
      }
    })
    .filter((l) => l.started > 0 || l.steps.length > 0)

  const payload: AnalyticsPayload = {
    asOf: new Date(now).toISOString(),
    report,
    ladders,
    ladderSampled: events.length >= LADDER_EVENT_CAP,
    importing: !history.done,
  }

  if (key && history.done) {
    try {
      await kvSet(key, payload)
    } catch {
      /* still right; costs the read again next time */
    }
  }
  return payload
}
