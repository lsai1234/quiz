/**
 * Tutorial videos: a link per exercise or activity, added by the founders over
 * time (Founders Hub → Training). Until one is added, the exercise says a
 * tutorial is coming. Links only, to the video hosts below or our own
 * storage, so nothing on a member's screen points anywhere unexpected.
 * Server-only.
 */
import { kvGet, kvSet } from '@/lib/db/kv'
import { ACTIVITY_KINDS } from './types'
import { isExerciseId } from './library'

const KEY = 'training-tutorials'

const HOSTS = [/^(www\.)?youtube\.com$/, /^youtu\.be$/, /^(www\.|player\.)?vimeo\.com$/, /\.public\.blob\.vercel-storage\.com$/]

/** A tutorial link we'll show, or null. */
export function cleanTutorialUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'https:') return null
    if (!HOSTS.some((h) => h.test(u.hostname))) return null
    return u.toString().slice(0, 500)
  } catch {
    return null
  }
}

export function isTutorialTarget(id: unknown): id is string {
  return isExerciseId(id) || (ACTIVITY_KINDS as readonly unknown[]).includes(id)
}

export async function getTutorials(): Promise<Record<string, string>> {
  const raw = (await kvGet<Record<string, unknown>>(KEY)) ?? {}
  const out: Record<string, string> = {}
  for (const [id, url] of Object.entries(raw)) {
    const clean = cleanTutorialUrl(url)
    if (clean && isTutorialTarget(id)) out[id] = clean
  }
  return out
}

/** Set or clear one link. Throws on a link we wouldn't show. */
export async function setTutorial(id: string, url: string | null): Promise<Record<string, string>> {
  if (!isTutorialTarget(id)) throw new Error('Unknown exercise')
  const all = await getTutorials()
  if (url === null || url.trim() === '') delete all[id]
  else {
    const clean = cleanTutorialUrl(url)
    if (!clean) throw new Error('Use an https link to YouTube, Vimeo or our own storage')
    all[id] = clean
  }
  await kvSet(KEY, all)
  return all
}
