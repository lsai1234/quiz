/**
 * The Article 9 gate, enforced on the server.
 *
 * The safety screen will not show its options without consent, but a browser is
 * not where a lawful basis is decided. Anything that stores or acts on quiz
 * answers runs them through `sanitiseHealthData` first, so a payload that
 * carries safety flags without a matching consent loses the flags rather than
 * being trusted — whether that came from an old client, a replayed request, or
 * someone posting to the API directly.
 *
 * The consent itself is recorded through `lib/legal/consent.ts`, on the same
 * append-only table as the checkout documents and with the same rule: the client
 * echoes a version, the server re-renders and hashes the document it actually
 * serves.
 */
import { HEALTH_DATA_VERSION, getHealthDataDocument } from './content'
import { consentedDocument, type ConsentedDocument } from './consent'
import type { HealthDataConsent, QuizAnswers } from '@/lib/types'

/**
 * Whether a submitted consent is one we can act on.
 *
 * Version-checked rather than merely present: consent to an earlier version of
 * the notice is not consent to this one, and silently accepting it would let a
 * material change to what we do with the data ride in on an old agreement.
 */
export function healthConsentIsCurrent(
  consent: HealthDataConsent | null | undefined,
  version = HEALTH_DATA_VERSION,
): boolean {
  return !!consent?.accepted && consent.version === version
}

/**
 * Quiz answers with the health data removed unless it is covered by a current
 * consent.
 *
 * Returns the original object when nothing needs stripping, so the common path
 * allocates nothing and callers can compare by identity if they want to know
 * whether anything was dropped.
 */
export function sanitiseHealthData<T extends Partial<QuizAnswers>>(answers: T): T {
  const hasFlags = (answers.safetyFlags ?? []).length > 0
  const consented = healthConsentIsCurrent(answers.healthDataConsent)
  if (consented || !hasFlags) return answers
  return { ...answers, safetyFlags: [] }
}

/** The health-data notice as it stands now, for the consent record. */
export function healthDataDocument(): ConsentedDocument {
  return consentedDocument(getHealthDataDocument())
}

/**
 * Withdraw the Article 9 consent, and deal with the consequences.
 *
 * Lives here rather than in the route so the behaviour is testable directly and
 * the handler stays thin — the interesting part of a withdrawal is not the HTTP.
 *
 * Three things happen, and the second is the one that matters:
 *
 *  1. The answers are deleted, not just the permission. Consent is what makes
 *     holding them lawful; without it there is no basis to keep them.
 *  2. Automatic substitution is switched off for every line. These answers are
 *     what the substitution safety check runs on, so continuing to swap without
 *     them is exactly the failure the safety snapshot exists to prevent. Falling
 *     back to `remove` is the documented safe option: the line comes off and the
 *     monthly drops, rather than something unverified being sent.
 *  3. The withdrawal is recorded like any other consent event. An append-only
 *     history that only ever records "yes" is not a history.
 */
export async function withdrawHealthConsent(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ substitutionsPaused: boolean }> {
  const { getQuiz, saveQuiz, getSubscription, saveSubscription } = await import('@/lib/db/hub-data')
  const { recordConsent } = await import('./consent')

  const quiz = await getQuiz<{ answers?: QuizAnswers }>(userId)
  if (quiz?.answers) {
    await saveQuiz(userId, {
      ...quiz,
      answers: { ...quiz.answers, safetyFlags: [], healthDataConsent: null },
    })
  }

  // `saveQuiz` upserts a subscriptions row with an empty `{}` document when
  // there is no plan yet, so "a row exists" is not "a plan exists" — someone who
  // took the quiz and never subscribed has one, with no `lines` on it at all.
  const subscription = await getSubscription(userId)
  const hasPlan = !!subscription?.id
  if (subscription) {
    await saveSubscription(userId, {
      ...subscription,
      defaultChangePolicy: 'remove',
      lines: (subscription.lines ?? []).map((line) => ({ ...line, changePolicy: 'remove' as const })),
      safetyConstraints: subscription.safetyConstraints
        ? { ...subscription.safetyConstraints, safetyFlags: [] }
        : subscription.safetyConstraints,
    })
  }

  await recordConsent({
    userId,
    context: 'health-data-withdrawn',
    documents: [healthDataDocument()],
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  })

  return { substitutionsPaused: hasPlan }
}
