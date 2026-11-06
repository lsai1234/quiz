/** Ask your trainer, for the member's hub: what they see, and asking. Server-only. */
import type { UserRecord } from '@/lib/db/users'
import { hubAccess, isOpen } from '@/lib/hub/access'
import { getOfferSettings } from '@/lib/offer/store'
import { trainerLive, type TrainerProfile } from '@/lib/offer/settings'
import { askedToday, getThread, unreadForMember } from './store'
import { publicTrainer } from './public'
import type { MemberTrainerView, TrainerThread } from './types'

export { publicTrainer }

export function viewOf(thread: TrainerThread | null, profile: TrainerProfile, live: boolean, open: boolean, now = new Date()): MemberTrainerView {
  if (!live) return { live: false, open, trainer: null, messages: [], waiting: false, left: 0, dailyLimit: 0, unread: 0 }
  return {
    live: true,
    open,
    trainer: publicTrainer(profile),
    // Who sent an answer is the Founders Hub's business; the member sees the trainer.
    messages: (thread?.messages ?? []).map(({ by: _by, ...m }) => m),
    waiting: Boolean(thread?.waiting),
    left: open ? Math.max(0, profile.dailyLimit - askedToday(thread, now)) : 0,
    dailyLimit: profile.dailyLimit,
    unread: unreadForMember(thread),
  }
}

export async function memberTrainerView(user: Pick<UserRecord, 'id' | 'email'>, now = new Date()): Promise<MemberTrainerView> {
  const settings = await getOfferSettings()
  const live = trainerLive(settings)
  if (!live) return viewOf(null, settings.trainer, false, false, now)
  const [access, thread] = await Promise.all([hubAccess(user, now), getThread(user.id)])
  return viewOf(thread, settings.trainer, true, isOpen(access), now)
}

export const firstNameOf = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || null
