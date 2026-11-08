/**
 * Ask your trainer's two emails, through the outbox like every other (deduped,
 * and held to the test allowlist until we go live):
 *
 *   trainer-reply     to the member, when an answer is in their hub. It says
 *                     an answer is waiting, not what it says.
 *   trainer-question  to the trainer's own address (Settings → Member hub),
 *                     when a member's question starts a wait. Further
 *                     questions before an answer don't send another.
 */
import { appBaseUrl } from '@/lib/notify'
import { emailShell } from '@/lib/notify/brand'
import type { RenderedEmail } from '@/lib/notify/types'
import type { TrainerProfile } from '@/lib/offer/settings'
import { TRAINER_COPY as C } from './copy'
import type { TrainerMessage, TrainerThread } from './types'

export function replyEmail(name: string, firstName: string | null, links: { hub: string; base: string }): RenderedEmail {
  const shell = emailShell({
    preheader: C.replyPreheader,
    heading: C.replyHeading(name),
    intro: C.replyIntro(firstName, name),
    paragraphs: [C.medical],
    cta: { label: C.replyCta, url: links.hub },
    links: { base: links.base, optOutUrl: null },
    marketing: null,
  })
  return { subject: C.replySubject(name), ...shell }
}

export function questionEmail(firstName: string | null, about: string | null, links: { inbox: string; base: string }): RenderedEmail {
  const shell = emailShell({
    preheader: C.questionPreheader,
    heading: C.questionHeading,
    intro: C.questionIntro(firstName, about),
    paragraphs: [],
    cta: { label: C.questionCta, url: links.inbox },
    links: { base: links.base, optOutUrl: null },
    marketing: null,
  })
  return { subject: C.questionSubject(firstName), ...shell }
}

/** The member's email when a founder answers. Never throws: the answer is saved either way. */
export async function sendReplyEmail(thread: TrainerThread, message: TrainerMessage, trainer: TrainerProfile): Promise<void> {
  try {
    const { queueNotification, deliverIfAutomatic } = await import('@/lib/notify/outbox')
    const base = appBaseUrl()
    const queued = await queueNotification({
      userId: thread.userId,
      email: thread.email,
      template: 'trainer-reply',
      dedupeKey: `trainer-reply:${message.id}`,
      rendered: replyEmail(trainer.name, thread.firstName, { hub: `${base}/myhub/trainer`, base }),
    })
    await deliverIfAutomatic(queued)
  } catch (err) {
    console.error('[trainer] answer email failed:', err)
  }
}

/** The trainer's alert when a question starts a wait. Never throws. */
export async function sendQuestionEmail(thread: TrainerThread, message: TrainerMessage, trainer: TrainerProfile, wasWaiting: boolean): Promise<void> {
  if (!trainer.notifyEmail || wasWaiting) return
  try {
    const { queueNotification, deliverIfAutomatic } = await import('@/lib/notify/outbox')
    const base = appBaseUrl()
    const queued = await queueNotification({
      userId: null,
      email: trainer.notifyEmail,
      template: 'trainer-question',
      dedupeKey: `trainer-question:${message.id}`,
      rendered: questionEmail(thread.firstName, message.about, { inbox: `${base}/founderhub/trainer?member=${encodeURIComponent(thread.userId)}`, base }),
    })
    await deliverIfAutomatic(queued)
  } catch (err) {
    console.error('[trainer] question alert failed:', err)
  }
}

/** The member's email when the trainer checks their plan with a note. Never throws. */
export async function sendPlanNoteEmail(thread: TrainerThread, message: TrainerMessage, trainer: TrainerProfile): Promise<void> {
  try {
    const { queueNotification, deliverIfAutomatic } = await import('@/lib/notify/outbox')
    const base = appBaseUrl()
    const shell = emailShell({
      preheader: C.replyPreheader,
      heading: C.planEmailSubject(trainer.name),
      intro: C.planEmailIntro(thread.firstName, trainer.name),
      paragraphs: [C.medical],
      cta: { label: C.planEmailCta, url: `${base}/myhub/trainer` },
      links: { base, optOutUrl: null },
      marketing: null,
    })
    const queued = await queueNotification({
      userId: thread.userId,
      email: thread.email,
      template: 'trainer-reply',
      dedupeKey: `trainer-reply:${message.id}`,
      rendered: { subject: C.planEmailSubject(trainer.name), ...shell },
    })
    await deliverIfAutomatic(queued)
  } catch (err) {
    console.error('[trainer] plan note email failed:', err)
  }
}
