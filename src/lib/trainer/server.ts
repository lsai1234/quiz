/** Ask your trainer, for the member's hub: what they see, and asking. Server-only. */
import type { UserRecord } from '@/lib/db/users'
import { hubAccess, isOpen } from '@/lib/hub/access'
import { getOfferSettings } from '@/lib/offer/store'
import { coachingOn, trainerLive, type TrainerProfile } from '@/lib/offer/settings'
import { askedToday, ensureWelcome, getThread, MEDIAN_FLOOR, readByTrainer, replyStats, unreadForMember, type ReplyStats } from './store'
import { publicTrainer } from './public'
import type { LibraryEntry, MemberTrainerView, TrainerThread } from './types'

export { publicTrainer }

export function viewOf(
  thread: TrainerThread | null,
  profile: TrainerProfile,
  live: boolean,
  open: boolean,
  now = new Date(),
  extra: { coaching?: boolean; stats?: ReplyStats | null; video?: boolean; library?: LibraryEntry[] } = {},
): MemberTrainerView {
  if (!live) return { live: false, open, trainer: null, messages: [], waiting: false, left: 0, dailyLimit: 0, unread: 0 }
  return {
    live: true,
    open,
    trainer: publicTrainer(profile, true, Boolean(extra.video)),
    // Who sent an answer, and how the trainer sorted a question, are the Founders Hub's business.
    messages: (thread?.messages ?? []).map(({ by: _by, tag: _tag, ...m }) => m),
    waiting: Boolean(thread?.waiting),
    left: open ? Math.max(0, profile.dailyLimit - askedToday(thread, now)) : 0,
    dailyLimit: profile.dailyLimit,
    unread: unreadForMember(thread),
    readByTrainer: readByTrainer(thread),
    // The measured reply time, once there are enough answers to say it honestly.
    replyStat: extra.stats && extra.stats.medianHours !== null && extra.stats.answered >= MEDIAN_FLOOR ? { medianHours: extra.stats.medianHours, answered: extra.stats.answered } : null,
    coaching: Boolean(extra.coaching),
    video: Boolean(extra.video),
    library: extra.video ? (extra.library ?? []) : [],
    aiDrafts: Boolean(extra.video && profile.aiDrafts),
  }
}

export async function memberTrainerView(user: Pick<UserRecord, 'id' | 'email'>, now = new Date()): Promise<MemberTrainerView> {
  const settings = await getOfferSettings()
  const live = trainerLive(settings)
  if (!live) return viewOf(null, settings.trainer, false, false, now)
  const [access, stats] = await Promise.all([hubAccess(user, now), replyStats(settings.trainer.replyHours, now)])
  const coaching = coachingOn(settings, 'coaching')
  // The trainer's welcome, once, as their hub opens.
  if (coaching && isOpen(access)) await ensureWelcome({ userId: user.id, email: user.email, firstName: firstNameOf((user as { name?: string | null }).name) }, settings.trainer.welcome, now)
  const thread = await getThread(user.id)
  const video = coachingOn(settings, 'video')
  const { shownLibrary } = await import('./content')
  return viewOf(thread, settings.trainer, true, isOpen(access), now, { coaching, stats, video, library: video ? await shownLibrary() : [] })
}

export const firstNameOf = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || null
