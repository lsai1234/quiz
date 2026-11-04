/**
 * Check-ins in the kv store, one document per box: `checkin:<guide token>`.
 * No schema change. The record holds the address the emails go to, so it is
 * deleted with the account (`deleteCheckInsFor`) and a year after its last
 * activity (`sweepCheckIns`).
 */
import { kvDelete, kvGet, kvListPrefix, kvSet } from '@/lib/db/kv'
import { isGuideToken } from '@/lib/guide/store'
import type { CheckInRecord } from './model'

const PREFIX = 'checkin:'

export async function getCheckIns(token: string): Promise<CheckInRecord | null> {
  if (!isGuideToken(token)) return null
  const r = await kvGet<CheckInRecord>(PREFIX + token)
  return r && r.v === 1 && r.token === token ? r : null
}

export async function saveCheckIns(record: CheckInRecord): Promise<void> {
  if (!isGuideToken(record.token)) throw new Error('Invalid check-in token')
  await kvSet(PREFIX + record.token, record)
}

export async function listCheckIns(limit = 5000): Promise<CheckInRecord[]> {
  return (await kvListPrefix<CheckInRecord>(PREFIX, limit)).map((r) => r.value).filter((r) => r && r.v === 1)
}

export async function deleteCheckIns(token: string): Promise<void> {
  if (isGuideToken(token)) await kvDelete(PREFIX + token)
}

/** Erasure: every check-in record belonging to an account. */
export async function deleteCheckInsFor(userId: string): Promise<number> {
  const mine = (await listCheckIns()).filter((r) => r.userId === userId)
  for (const r of mine) await deleteCheckIns(r.token)
  return mine.length
}
