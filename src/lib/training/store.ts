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
  return (await kvListPrefix<TrainingRecord>(PREFIX, limit)).filter((r) => r.value?.plan).length
}
