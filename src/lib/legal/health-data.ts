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
