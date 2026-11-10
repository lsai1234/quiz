/** The trainer as members see them: everything but where alerts go. Client-safe. */
import type { TrainerProfile } from '@/lib/offer/settings'
import type { PublicTrainer } from './types'

const clip = (id: string | null | undefined) => (id ? `/api/media/${id}` : null)

/** `video`: the video phase is on, so their own videos show. */
export function publicTrainer(p: TrainerProfile, training = true, video = false): PublicTrainer {
  return {
    name: p.name,
    role: p.role,
    bio: p.bio,
    photoUrl: p.photoUrl,
    replyHours: p.replyHours,
    checksPlans: p.checksPlans && training,
    answersOn: p.answersOn || null,
    // Only what they've confirmed they hold.
    qualifications: p.qualificationsConfirmed && p.qualifications ? p.qualifications : null,
    introVideo: video ? clip(p.introVideo) : null,
    welcomeVideo: video ? clip(p.welcomeVideo) : null,
  }
}
