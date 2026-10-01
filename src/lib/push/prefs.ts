/**
 * Which orders the founders hear about. Shared by both founders — it is a
 * question about the business ("do renewals count as news?"), not about a phone.
 */
import { kvGet, kvSet } from '@/lib/db/kv'

export interface PushPrefs {
  /** A paid one-off order from the shop or the quiz, free ones included. */
  orders: boolean
  /** A new subscription's first box. */
  subscribers: boolean
  /**
   * Every renewal. Off to start with: it is one notification per member per
   * month, and a buzz that is always routine stops being read.
   */
  renewals: boolean
}

export const DEFAULT_PREFS: PushPrefs = { orders: true, subscribers: true, renewals: false }

const KV_KEY = 'push:prefs'

export async function getPushPrefs(): Promise<PushPrefs> {
  const stored = await kvGet<Partial<PushPrefs>>(KV_KEY)
  return { ...DEFAULT_PREFS, ...(stored ?? {}) }
}

export async function setPushPrefs(patch: Partial<PushPrefs>): Promise<PushPrefs> {
  const next = { ...(await getPushPrefs()) }
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof PushPrefs)[]) {
    if (typeof patch[key] === 'boolean') next[key] = patch[key]
  }
  await kvSet(KV_KEY, next)
  return next
}
