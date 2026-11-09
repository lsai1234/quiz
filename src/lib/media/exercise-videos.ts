/**
 * Which uploaded video shows on which exercise or activity (server-only),
 * set in Founders Hub → Training. A video shows to every member on that
 * exercise straight away: on its page, in workout mode as a silent loop, and
 * as a play mark in the session list. Replaced or removed any time.
 */
import { kvGet, kvSet } from '@/lib/db/kv'
import { isTutorialTarget } from '@/lib/training/tutorials'
import { getMedia, isMediaId, mediaUrl } from './store'

const KEY = 'training-exercise-videos'

/** Exercise id → media id. */
export async function exerciseVideoIds(): Promise<Record<string, string>> {
  return (await kvGet<Record<string, string>>(KEY)) ?? {}
}

/** Exercise id → the address it plays from. */
export async function exerciseVideos(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const [ex, id] of Object.entries(await exerciseVideoIds())) if (isMediaId(id) && isTutorialTarget(ex)) out[ex] = mediaUrl(id)
  return out
}

/** Put a ready video on an exercise, or take it off (null). The old one is deleted. */
export async function setExerciseVideo(exerciseId: string, mediaId: string | null): Promise<Record<string, string>> {
  if (!isTutorialTarget(exerciseId)) throw new Error('Unknown exercise')
  const all = await exerciseVideoIds()
  const old = all[exerciseId]
  if (mediaId) {
    const m = await getMedia(mediaId)
    if (!m || m.state !== 'ready' || m.kind !== 'exercise') throw new Error('That video isn’t ready')
    all[exerciseId] = mediaId
  } else delete all[exerciseId]
  await kvSet(KEY, all)
  if (old && old !== mediaId) {
    const { deleteMedia } = await import('./store')
    await deleteMedia(old)
  }
  return all
}
