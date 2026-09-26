/**
 * The AI audit log (plan p.11, "Guardrail layers → Oversight").
 *
 * One line per AI call: which route, which scene, which model, how long it
 * took and how it came out. Never what anyone typed, said or photographed —
 * the log exists to answer "is the AI working, and is it fast enough?"
 * (V1's 1.5s) without becoming a second store of personal data.
 *
 * Stored by day in the key-value table; days older than the retention are
 * dropped as new ones are written. Writing never throws: a logging failure
 * must not fail the call it was logging.
 */

import { kvDelete, kvGet, kvSet } from '@/lib/db/kv'

export type AiRoute = 'copy' | 'understand' | 'explain' | 'scan' | 'voice' | 'health'
export type AiOutcome = 'ok' | 'fallback' | 'held' | 'unavailable' | 'busy' | 'error'

export interface AiAuditEntry {
  at: number
  route: AiRoute
  /** The scene, glossary term or upload kind. Never user content. */
  subject?: string
  model: string
  ms: number
  outcome: AiOutcome
  /** Why it was held or fell back, as a short code ("medical", "image"). */
  reason?: string
}

export const AI_LOG_RETENTION_DAYS = 30
/** Enough for a busy day; beyond it the oldest lines of the day go first. */
const MAX_PER_DAY = 5000

const day = (at: number) => new Date(at).toISOString().slice(0, 10)
const logKey = (d: string) => `consult-ai-log:${d}`

export async function recordAi(entry: AiAuditEntry): Promise<void> {
  try {
    const k = logKey(day(entry.at))
    const lines = (await kvGet<AiAuditEntry[]>(k)) ?? []
    lines.push(entry)
    await kvSet(k, lines.slice(-MAX_PER_DAY))
    // Retention: the day that just fell out of the window.
    await kvDelete(logKey(day(entry.at - (AI_LOG_RETENTION_DAYS + 1) * 86_400_000)))
  } catch {
    // Never let the log break the call.
  }
}

/** The last `days` days of the log, newest first. */
export async function readAiLog(days = 7, now = Date.now()): Promise<AiAuditEntry[]> {
  const out: AiAuditEntry[] = []
  for (let i = 0; i < Math.min(days, AI_LOG_RETENTION_DAYS); i++) {
    out.push(...((await kvGet<AiAuditEntry[]>(logKey(day(now - i * 86_400_000)))) ?? []))
  }
  return out.sort((a, b) => b.at - a.at)
}

export interface AiRouteSummary {
  route: AiRoute
  calls: number
  ok: number
  fallback: number
  held: number
  unavailable: number
  error: number
  /** Median and 95th-percentile time, over calls that reached the model. */
  p50: number | null
  p95: number | null
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : null)

export function summariseAiLog(entries: AiAuditEntry[]): AiRouteSummary[] {
  const by = new Map<AiRoute, AiAuditEntry[]>()
  for (const e of entries) by.set(e.route, [...(by.get(e.route) ?? []), e])
  return [...by.entries()]
    .map(([route, list]) => {
      const count = (o: AiOutcome) => list.filter((e) => e.outcome === o).length
      const timed = list.filter((e) => e.outcome === 'ok' || e.outcome === 'fallback' || e.outcome === 'error').map((e) => e.ms).sort((a, b) => a - b)
      return {
        route,
        calls: list.length,
        ok: count('ok'),
        fallback: count('fallback'),
        held: count('held'),
        unavailable: count('unavailable'),
        error: count('error') + count('busy'),
        p50: pct(timed, 0.5),
        p95: pct(timed, 0.95),
      }
    })
    .sort((a, b) => b.calls - a.calls)
}
