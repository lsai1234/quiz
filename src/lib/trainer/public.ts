/** The trainer as members see them: everything but where alerts go. Client-safe. */
import type { TrainerProfile } from '@/lib/offer/settings'
import type { PublicTrainer } from './types'

export function publicTrainer(p: TrainerProfile, training = true): PublicTrainer {
  return { name: p.name, role: p.role, bio: p.bio, photoUrl: p.photoUrl, replyHours: p.replyHours, checksPlans: p.checksPlans && training }
}
