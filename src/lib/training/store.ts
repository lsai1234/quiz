/**
 * Where a member's training plan lives: one key-value document per account
 * (`training:<userId>`), so no schema change. Deleted with the account and
 * included in its data export (`lib/db/erasure`). Server-only.
 */
import { kvDelete, kvGet, kvListPrefix, kvSet } from '@/lib/db/kv'
import type { ReadinessRecord, TrainingPlan } from './types'

export interface TrainingRecord {
  v: 1
  userId: string
  /** That they did the readiness check, and when; never their answers. */
  readiness: ReadinessRecord | null
  plan: TrainingPlan | null
  /** AI builds today, for the daily cap (`AI_BUILDS_PER_DAY`). */
  aiBuilds?: { day: string; count: number }
}

const PREFIX = 'training:'
const key = (userId: string) => PREFIX + userId

export async function getTraining(userId: string): Promise<TrainingRecord> {
  const r = await kvGet<TrainingRecord>(key(userId))
  if (r && r.v === 1 && r.userId === userId) return r
  return { v: 1, userId, readiness: null, plan: null }
}

export async function saveTraining(record: TrainingRecord): Promise<void> {
  await kvSet(key(record.userId), record)
}

/** Erasure. True when there was something to delete. */
export async function deleteTraining(userId: string): Promise<boolean> {
  const had = (await kvGet<TrainingRecord>(key(userId))) !== undefined
  await kvDelete(key(userId))
  return had
}

/** For the founders' numbers: how many members have a plan. */
export async function countPlans(limit = 5000): Promise<number> {
  const { sampleMemberIds } = await import('@/lib/samples/registry')
  const samples = await sampleMemberIds()
  return (await kvListPrefix<TrainingRecord>(PREFIX, limit)).filter((r) => r.value?.plan && !samples.has(r.value.userId)).length
}

/** Every real member's plan (never the samples), for the daily job's training emails. */
export async function realPlans(limit = 5000): Promise<TrainingPlan[]> {
  const { sampleMemberIds } = await import('@/lib/samples/registry')
  const samples = await sampleMemberIds()
  return (await kvListPrefix<TrainingRecord>(PREFIX, limit))
    .map((r) => r.value?.plan)
    .filter((p): p is TrainingPlan => Boolean(p && !samples.has(p.userId)))
}

/** Plans waiting for the trainer's check, the longest wait first: real members, or only the samples (Test views). */
export async function plansToCheck(limit = 5000, which: 'real' | 'samples' = 'real'): Promise<TrainingPlan[]> {
  const { sampleMemberIds } = await import('@/lib/samples/registry')
  const samples = await sampleMemberIds()
  return (await kvListPrefix<TrainingRecord>(PREFIX, limit))
    .filter((r) => samples.has(r.value?.userId ?? '') === (which === 'samples'))
    .map((r) => r.value?.plan)
    .filter((p): p is TrainingPlan => Boolean(p && p.check?.state === 'waiting'))
    .sort((a, b) => Date.parse(a.check!.since) - Date.parse(b.check!.since))
}

/** The trainer has checked it. Null when there's no plan waiting. */
export async function markPlanChecked(userId: string, by: string, now = new Date()): Promise<TrainingPlan | null> {
  const record = await getTraining(userId)
  if (!record.plan || record.plan.check?.state !== 'waiting') return null
  const plan: TrainingPlan = { ...record.plan, check: { ...record.plan.check, state: 'checked', at: now.toISOString(), by: by.slice(0, 120) } }
  await saveTraining({ ...record, plan })
  return plan
}
