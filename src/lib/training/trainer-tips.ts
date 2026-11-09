/**
 * The trainer's tips (server-only): a coaching note on each exercise or
 * activity, written once in Founders Hub → Training and shown to every
 * member as "[Name]'s tip": on the exercise, and one tap away in workout
 * mode. The trainer's own words, never written by AI.
 */
import { kvGet, kvSet } from '@/lib/db/kv'
import { isTutorialTarget } from './tutorials'

const KEY = 'training-trainer-tips'
export const TIP_MAX = 280

export function cleanTip(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.replace(/[\u0000-\u0008\u000b-\u001f<>]/g, '').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, TIP_MAX) : null
}

export async function getTrainerTips(): Promise<Record<string, string>> {
  const raw = (await kvGet<Record<string, unknown>>(KEY)) ?? {}
  const out: Record<string, string> = {}
  for (const [id, tip] of Object.entries(raw)) {
    const clean = cleanTip(tip)
    if (clean && isTutorialTarget(id)) out[id] = clean
  }
  return out
}

/** Set or clear one tip. Throws for an exercise that isn't in the library. */
export async function setTrainerTip(id: string, tip: string | null): Promise<Record<string, string>> {
  if (!isTutorialTarget(id)) throw new Error('Unknown exercise')
  const all = await getTrainerTips()
  const clean = cleanTip(tip)
  if (clean) all[id] = clean
  else delete all[id]
  await kvSet(KEY, all)
  return all
}
