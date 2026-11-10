/**
 * The results page's proof about the trainer (video phase), server-only: only
 * what's true and measured. Their intro video, the qualifications they've
 * confirmed, the reply time measured over enough answers, one real exchange
 * a member said yes to sharing, and how many members train with a plan once
 * there are enough to say it. Each part is left out until it's there.
 * Worked out at most every five minutes.
 */
import type { OfferSettings } from '@/lib/offer/settings'

/** Members training with a plan, said only from this many. */
export const MEMBERS_FLOOR = 50

export interface HubProof {
  introVideo: string | null
  qualifications: string | null
  reply: { medianHours: number; answered: number } | null
  exchange: { question: string; answer: string; about: string | null } | null
  members: number | null
  /** The coaching tools are on: draw workout mode in the preview. */
  workout: boolean
}

let cache: { at: number; key: string; proof: HubProof | null } | null = null

export async function hubProof(settings: OfferSettings, now = new Date()): Promise<HubProof | null> {
  const { coachingOn, trainerLive } = await import('@/lib/offer/settings')
  if (!trainerLive(settings) || !coachingOn(settings, 'video')) return null
  // A test view sees the sample inbox's exchange, so it never shares the cache with customers.
  const { currentTestView } = await import('@/lib/samples/session')
  const testView = Boolean(await currentTestView())
  const key = JSON.stringify([settings.trainer, settings.services, testView])
  if (cache && cache.key === key && now.getTime() - cache.at < 300_000) return cache.proof

  const [{ replyStats, MEDIAN_FLOOR }, { shownFeatured }, { countPlans }, { publicTrainer }] = await Promise.all([
    import('@/lib/trainer/store'),
    import('@/lib/trainer/content'),
    import('@/lib/training/store'),
    import('@/lib/trainer/public'),
  ])
  const [stats, featured, plans] = await Promise.all([replyStats(settings.trainer.replyHours, now), shownFeatured(testView), countPlans()])
  const t = publicTrainer(settings.trainer, settings.services.training, true)
  const proof: HubProof = {
    introVideo: t.introVideo ?? null,
    qualifications: t.qualifications ?? null,
    reply: stats.medianHours !== null && stats.answered >= MEDIAN_FLOOR ? { medianHours: stats.medianHours, answered: stats.answered } : null,
    exchange: featured ? { question: featured.question, answer: featured.answer, about: featured.about } : null,
    members: plans >= MEMBERS_FLOOR ? plans : null,
    workout: coachingOn(settings, 'coaching'),
  }
  cache = { at: now.getTime(), key, proof }
  return proof
}

/** Tests and a settings change that must show at once. */
export function forgetProof(): void {
  cache = null
}
