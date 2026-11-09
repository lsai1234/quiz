/**
 * Who can open a training plan, and what we already know to set it up.
 * Server-only.
 *
 * Open to anyone with a monthly plan that hasn't been cancelled, and for 90
 * days after any order (one-off or not): the hub's own window. Matched on the
 * account, or on the email the order was placed with, so a one-off buyer who
 * makes an account later still gets in. Off for everyone while the founders'
 * switch is off (Settings → Offer → Box services).
 */
import type { UserRecord } from '@/lib/db/users'
import type { Goal, QuizAnswers } from '@/lib/types'
import type { RoutineDay } from '@/lib/routine'
import type { GuideSeed } from '@/lib/guide/build'
import { normaliseTrainingSeed, type TrainingSeed } from './seed'

export const HUB_DAYS = 90

export interface TrainingAccess {
  /** The founders' switch. */
  enabled: boolean
  allowed: boolean
  via: 'subscription' | 'order' | null
  /** When it closes, for an order; null for a monthly plan or no access. */
  until: string | null
}

type Who = Pick<UserRecord, 'id' | 'email'>

export async function trainingAccess(user: Who, now = new Date()): Promise<TrainingAccess> {
  const { getOfferSettings } = await import('@/lib/offer/store')
  const enabled = (await getOfferSettings()).services.training
  // The hub's own window: a plan that's running, or 90 days after an order or a cancelled plan.
  const { hubAccess } = await import('@/lib/hub/access')
  const a = await hubAccess(user, now)
  if (a.state === 'subscriber') return { enabled, allowed: enabled, via: 'subscription', until: null }
  if (a.state === 'member') return { enabled, allowed: enabled, via: 'order', until: `${a.until}T00:00:00.000Z` }
  return { enabled, allowed: false, via: null, until: null }
}

export interface TrainingStart {
  day: RoutineDay | null
  goals: Goal[]
  training: TrainingSeed | null
}

/**
 * What their order or plan already says about their training: the guide
 * seed's day and goals, and the quiz's training answers (on the seed, or with
 * a monthly plan's saved answers). A hub member who joined without an order:
 * the same, from the quiz they took after joining. Nothing about their health.
 */
export async function trainingStart(user: Who): Promise<TrainingStart> {
  const { getSubscription, getQuiz } = await import('@/lib/db/hub-data')
  const sub = await getSubscription(user.id)
  let seed: (GuideSeed & { training?: unknown }) | null = sub?.guideSeed ?? null
  let answers: Partial<QuizAnswers> | null = null
  if (sub) answers = (await getQuiz<{ answers?: Partial<QuizAnswers> }>(user.id))?.answers ?? null
  if (!seed) {
    const { latestPaidOrderFor } = await import('@/lib/orders/repo')
    seed = (await latestPaidOrderFor({ userId: user.id, email: user.email }))?.guideSeed ?? null
  }
  // A hub member with no order: what the quiz told us when they joined (`lib/hub-plan`).
  if (!seed) {
    const { getHubStart } = await import('@/lib/hub-plan/server')
    seed = (await getHubStart(user.id))?.seed ?? null
  }
  const fromAnswers = answers
    ? normaliseTrainingSeed({ types: answers.trainingType, experience: answers.trainingExperience, focus: answers.trainingFocus })
    : null
  return {
    day: seed?.day ?? null,
    goals: seed?.goals?.length ? seed.goals : (answers?.goals ?? []),
    training: normaliseTrainingSeed(seed?.training) ?? fromAnswers,
  }
}
