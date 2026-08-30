/**
 * Withdrawing the Article 9 consent.
 *
 * The privacy notice and the consent document both promise this works and say
 * what it does to a plan. These pin that the code keeps the promise — a
 * commitment in a legal document that the software does not honour is worse
 * than not having made it.
 */
import { createUser } from '@/lib/db/users'
import { saveQuiz, getQuiz, saveSubscription, getSubscription } from '@/lib/db/hub-data'
import { listConsents } from '@/lib/legal/consent'
import { HEALTH_DATA_VERSION } from '@/lib/legal/content'
import { healthConsentIsCurrent, withdrawHealthConsent as withdraw } from '@/lib/legal/health-data'
import type { QuizAnswers } from '@/lib/types'
import type { MemberSubscription } from '@/lib/recharge/types'

const consent = { accepted: true as const, version: HEALTH_DATA_VERSION, at: '2026-08-30T10:00:00.000Z' }

async function seed(email: string) {
  const user = await createUser({ email })
  await saveQuiz(user.id, {
    answers: { safetyFlags: ['pregnancy'], healthDataConsent: consent } as unknown as QuizAnswers,
  })
  await saveSubscription(user.id, {
    id: 'sub-1',
    status: 'active',
    defaultChangePolicy: 'auto-swap',
    safetyConstraints: { dietaryTags: [], noStimulants: false, safetyFlags: ['pregnancy'] },
    lines: [{ id: 'l1', productId: 'p1', changePolicy: 'auto-swap' }],
  } as unknown as MemberSubscription)
  return user
}

describe('withdrawing health-data consent', () => {
  it('deletes the answers, not just the permission', async () => {
    // Consent is what makes holding them lawful; without it there is no basis
    // to keep them.
    const user = await seed('withdraw@example.com')
    await withdraw(user.id)

    const quiz = await getQuiz<{ answers: QuizAnswers }>(user.id)
    expect(quiz?.answers.safetyFlags).toEqual([])
    expect(healthConsentIsCurrent(quiz?.answers.healthDataConsent)).toBe(false)
  })

  it('stops automatic substitutions rather than running them unchecked', async () => {
    // The withdrawn answers are what the substitution safety check runs on.
    // Carrying on swapping without them is the exact failure this area exists
    // to prevent, so every line falls back to "take it off my plan".
    const user = await seed('paused@example.com')
    await withdraw(user.id)

    const sub = await getSubscription(user.id)
    expect(sub?.defaultChangePolicy).toBe('remove')
    expect(sub?.lines.every((l) => l.changePolicy === 'remove')).toBe(true)
  })

  it('clears the flags off the constraints snapshot too', async () => {
    const user = await seed('snapshot@example.com')
    await withdraw(user.id)
    expect((await getSubscription(user.id))?.safetyConstraints?.safetyFlags).toEqual([])
  })

  it('records the withdrawal as its own event', async () => {
    // An append-only history that only ever records "yes" is not a history.
    const user = await seed('recorded@example.com')
    await withdraw(user.id)

    const records = await listConsents(user.id)
    const event = records.find((r) => r.context === 'health-data-withdrawn')
    expect(event).toBeDefined()
    expect(event!.documents.map((d) => d.id)).toEqual(['health-data'])
  })

  it('works for someone with no subscription', async () => {
    const user = await createUser({ email: 'noplan@example.com' })
    await saveQuiz(user.id, {
      answers: { safetyFlags: ['shellfish'], healthDataConsent: consent } as unknown as QuizAnswers,
    })
    await expect(withdraw(user.id)).resolves.not.toThrow()
    expect((await getQuiz<{ answers: QuizAnswers }>(user.id))?.answers.safetyFlags).toEqual([])
  })

  it('leaves the rest of the answers alone', async () => {
    const user = await createUser({ email: 'rest@example.com' })
    await saveQuiz(user.id, {
      answers: {
        name: 'Sam', goals: ['sleep-better'], safetyFlags: ['pregnancy'], healthDataConsent: consent,
      } as unknown as QuizAnswers,
    })
    await withdraw(user.id)

    const quiz = await getQuiz<{ answers: QuizAnswers }>(user.id)
    expect(quiz?.answers.name).toBe('Sam')
    expect(quiz?.answers.goals).toEqual(['sleep-better'])
  })
})
