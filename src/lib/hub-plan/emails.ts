/**
 * The hub membership's three emails, through the outbox like every other
 * (deduped, and held to the test allowlist until we go live):
 *
 *   hub-plan-welcome    it started: the price and when the next payment is
 *   hub-plan-moved      a stack order moved the next payment back
 *   hub-plan-cancelled  it was cancelled, or refunded inside 14 days
 *
 * Never throw: the membership has changed either way.
 */
import { appBaseUrl } from '@/lib/notify'
import { emailShell } from '@/lib/notify/brand'
import type { RenderedEmail, TemplateId } from '@/lib/notify/types'
import { HUB_PLAN_COPY as C, shortDate } from './copy'
import type { HubPlan } from './plan'

function shell(input: { subject: string; preheader: string; heading: string; intro: string; paragraphs: string[]; cta: string; hub: string; base: string }): RenderedEmail {
  return {
    subject: input.subject,
    ...emailShell({
      preheader: input.preheader,
      heading: input.heading,
      intro: input.intro,
      paragraphs: input.paragraphs,
      cta: { label: input.cta, url: input.hub },
      links: { base: input.base, optOutUrl: null },
      marketing: null,
    }),
  }
}

export function welcomeEmail(plan: Pick<HubPlan, 'monthly' | 'nextChargeAt' | 'freeUntil'>, firstName: string | null, links: { hub: string; base: string }, now: Date): RenderedEmail {
  const free = plan.freeUntil && Date.parse(plan.freeUntil) > now.getTime()
  const terms = plan.nextChargeAt
    ? free
      ? C.welcomeTermsFree(plan.monthly, shortDate(plan.nextChargeAt))
      : C.welcomeTerms(plan.monthly, shortDate(plan.nextChargeAt))
    : null
  return shell({
    subject: C.welcomeSubject,
    preheader: C.welcomePreheader,
    heading: C.welcomeHeading,
    intro: C.welcomeIntro(firstName),
    paragraphs: terms ? [terms] : [],
    cta: C.welcomeCta,
    ...links,
  })
}

export function movedEmail(plan: Pick<HubPlan, 'monthly'>, chargeAt: string, links: { hub: string; base: string }): RenderedEmail {
  return shell({
    subject: C.movedSubject,
    preheader: C.movedPreheader,
    heading: C.movedHeading,
    intro: C.movedIntro(plan.monthly, shortDate(chargeAt)),
    paragraphs: [],
    cta: C.movedCta,
    ...links,
  })
}

export function cancelledEmail(plan: Pick<HubPlan, 'monthly' | 'endsAt'>, refunded: boolean, links: { hub: string; base: string }): RenderedEmail {
  return shell({
    subject: C.cancelledSubject,
    preheader: C.cancelledPreheader,
    heading: C.cancelledHeading,
    intro: refunded || !plan.endsAt ? C.refundedIntro(plan.monthly) : C.cancelledIntro(shortDate(plan.endsAt)),
    paragraphs: [],
    cta: C.cancelledCta,
    ...links,
  })
}

async function send(plan: HubPlan, template: TemplateId, dedupeKey: string, render: (links: { hub: string; base: string }) => RenderedEmail): Promise<void> {
  if (!plan.email) return
  try {
    const { queueNotification, deliverIfAutomatic } = await import('@/lib/notify/outbox')
    const base = appBaseUrl()
    const queued = await queueNotification({ userId: plan.userId, email: plan.email, template, dedupeKey, rendered: render({ hub: `${base}/myhub`, base }) })
    await deliverIfAutomatic(queued)
  } catch (err) {
    console.error(`[hub-plan] ${template} email failed:`, err)
  }
}

export async function sendWelcomeEmail(plan: HubPlan, firstName: string | null, now = new Date()): Promise<void> {
  await send(plan, 'hub-plan-welcome', `hub-plan-welcome:${plan.userId}:${plan.startedAt ?? ''}`, (links) => welcomeEmail(plan, firstName, links, now))
}

export async function sendMovedEmail(plan: HubPlan, orderId: string): Promise<void> {
  if (!plan.nextChargeAt) return
  const chargeAt = plan.nextChargeAt
  await send(plan, 'hub-plan-moved', `hub-plan-moved:${plan.userId}:${orderId}`, (links) => movedEmail(plan, chargeAt, links))
}

export async function sendCancelledEmail(plan: HubPlan, refunded: boolean): Promise<void> {
  await send(plan, 'hub-plan-cancelled', `hub-plan-cancelled:${plan.userId}:${plan.cancelledAt ?? ''}`, (links) => cancelledEmail(plan, refunded, links))
}
