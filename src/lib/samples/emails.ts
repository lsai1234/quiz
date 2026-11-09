/**
 * Every email, drawn with sample data for Test views (server-only). The real
 * templates and, where an email is built from an order or a plan, the real
 * queueing code run inside `captureEmails`, so what shows is exactly what a
 * member would get. Nothing is stored in the outbox and nothing is sent.
 */
import { appBaseUrl } from '@/lib/notify'
import type { RenderedEmail, TemplateId } from '@/lib/notify/types'

export interface SampleEmail {
  template: TemplateId
  /** What it's for, in a few words. */
  label: string
  subject: string
  html: string
  text: string
}

const LABELS: Record<TemplateId, string> = {
  'order-confirmation': 'Order confirmation (one-off)',
  'subscription-confirmation': 'Plan started (monthly)',
  'stack-guide': 'Stack guide',
  'check-in': 'Amp check-in',
  'deal-open': 'A member price has opened',
  'order-link-code': 'Join an order: the code',
  'trainer-reply': 'Ask your trainer: an answer is waiting',
  'trainer-question': 'To the trainer: a question is waiting',
  'training-day': 'Training day (opt-in)',
  'training-recap': 'First-week recap (opt-in)',
  'hub-plan-welcome': 'Hub membership started',
  'hub-plan-moved': 'Hub membership: payment moved',
  'hub-plan-cancelled': 'Hub membership cancelled',
  'order-item-update': 'Order item update (free gift withheld)',
  'product-substituted': 'Product swapped on a plan',
  'product-removed': 'Product taken off a plan',
  'price-change-notice': 'Price change notice',
  'terms-updated': 'Terms updated',
  'payment-failed': 'Card declined',
  'exit-receipt': 'Plan ended: receipt',
  'exit-charge-failed': 'Plan ended: settlement not taken',
  'exit-scheduled': 'Leaving on the next free date',
  'exit-return-requested': 'Cancelled in 14 days: send it back',
  'password-reset': 'Password reset',
  'password-changed': 'Password changed',
}

export async function sampleEmails(now = new Date()): Promise<SampleEmail[]> {
  const base = appBaseUrl()
  const { captureEmails } = await import('@/lib/notify/outbox')
  const { buildSampleMember } = await import('./members')
  const { getSampleOrders, getSampleSubscription } = await import('./registry')
  const out: SampleEmail[] = []
  const add = (template: TemplateId, r: RenderedEmail) => out.push({ template, label: LABELS[template], subject: r.subject, html: r.html, text: r.text })

  const oneOff = await buildSampleMember('oneoff-day10', now)
  const monthly = await buildSampleMember('monthly-active', now)
  const order = (await getSampleOrders(oneOff.user.id))[0]
  const sub = await getSampleSubscription(monthly.user.id)

  const { emails } = await captureEmails(async () => {
    const commerce = await import('@/lib/notify/commerce')
    const billing = await import('@/lib/notify/billing')
    if (order) {
      await commerce.queueOrderConfirmation(order)
      await commerce.queueBonusWithheld({ ...order, bonus: { productId: order.lines[0].productId, title: order.lines[0].title, status: 'withheld', reason: 'first order only' } } as typeof order)
    }
    if (sub) {
      await commerce.queueSubscriptionConfirmation(monthly.user.id, sub, { firstPayment: Math.round(sub.flatMonthly * 100) })
      await billing.queuePaymentFailedEmail(monthly.user.id, sub, 'in_sample')
      await billing.queueScheduledExitEmail(monthly.user.id, sub, 2)
      await billing.queueReturnRequestedEmail(monthly.user.id, sub, { refund: sub.flatMonthly, deadline: new Date(now.getTime() + 14 * 86_400_000).toISOString(), reference: 'SAMPLE-EXIT' })
      await billing.queueExitEmail(monthly.user.id, { ...sub, status: 'cancelled' }, { settlement: 0, paid: true, waiverExplanation: 'You had paid for everything you received.', shippedTotal: sub.flatMonthly * 3, paidTotal: sub.flatMonthly * 3 })
      await billing.queueExitEmail(monthly.user.id, { ...sub, status: 'cancelled', stripeSubscriptionId: 'sub_sample_failed' }, { settlement: 12.5, paid: false, shippedTotal: sub.flatMonthly * 3, paidTotal: sub.flatMonthly * 2 })
    }
    const { startLink } = await import('@/lib/hub/link-order')
    await startLink({ id: oneOff.user.id, email: oneOff.user.email }, 'other-address@sample.chrgd.test')
  })
  for (const e of emails) {
    const t = e.template === 'exit-receipt' && /not|couldn/i.test(e.rendered.subject) ? 'exit-charge-failed' : e.template
    if (!out.some((o) => o.template === t)) add(t, e.rendered)
  }

  // Built straight from the templates, with sample values.
  const [{ getGuide }, { guideLinks }, { stackGuideEmail }, { checkInEmail }, trainer, hubPlan, templates] = await Promise.all([
    import('@/lib/guide/store'),
    import('@/lib/guide/issue'),
    import('@/lib/guide/email'),
    import('@/lib/checkin/email'),
    import('@/lib/trainer/emails'),
    import('@/lib/hub-plan/emails'),
    import('@/lib/notify/templates'),
  ])
  const guide = oneOff.guide ? await getGuide(oneOff.guide) : null
  if (guide) {
    add('stack-guide', stackGuideEmail(guide, guideLinks(guide.token, base), { baseUrl: base }, { url: `${base}/myhub` }))
    add('check-in', checkInEmail({ firstName: 'Alex' }, { checkIn: `${base}/checkin/${guide.token}`, stop: `${base}/checkin/${guide.token}?stop=1`, base }))
  }
  const { dealsFor } = await import('@/lib/deals/server')
  const deals = await buildSampleMember('deals-open', now).then((m) => dealsFor(m.user, now))
  const deal = deals.deals.find((d) => d.state === 'open') ?? deals.deals[0]
  if (deal) {
    const { dealOpenEmail } = await import('@/lib/deals/emails')
    add('deal-open', dealOpenEmail(deal, 'Alex', { hub: `${base}/myhub`, stop: `${base}/myhub`, base }))
  }
  add('trainer-reply', trainer.replyEmail('Sam', 'Alex', { hub: `${base}/myhub/trainer`, base }))
  add('trainer-question', trainer.questionEmail('Alex', 'Goblet squat', { inbox: `${base}/founderhub/trainer`, base }))
  const trainee = await buildSampleMember('plan-midweek', now)
  const { getTraining } = await import('@/lib/training/store')
  const trainingPlan = (await getTraining(trainee.user.id)).plan
  if (trainingPlan) {
    const training = await import('@/lib/training/emails')
    const links = { open: `${base}/myhub/training`, stop: `${base}/myhub/training/emails?stop=sample`, base }
    const left = trainingPlan.sessions.filter((s) => !s.done)
    if (left.length) add('training-day', training.trainingDayEmail(left.slice(0, 1), trainingPlan.prefs.trainAt ?? 1080, 'Alex', links))
    add('training-recap', training.recapEmail(training.recapFacts(trainingPlan, now), 'Sam', 'Alex', links))
  }
  const plan = { monthly: 10, nextChargeAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(), freeUntil: null, endsAt: new Date(now.getTime() + 20 * 86_400_000).toISOString() }
  add('hub-plan-welcome', hubPlan.welcomeEmail(plan, 'Alex', { hub: `${base}/myhub`, base }, now))
  add('hub-plan-moved', hubPlan.movedEmail(plan, new Date(now.getTime() + 100 * 86_400_000).toISOString(), { hub: `${base}/myhub`, base }))
  add('hub-plan-cancelled', hubPlan.cancelledEmail(plan, false, { hub: `${base}/myhub`, base }))
  const soon = new Date(now.getTime() + 30 * 86_400_000).toISOString()
  const title = order?.lines[0]?.title ?? 'Creatine'
  add('product-substituted', templates.productSubstituted({ productTitle: title, replacementTitle: `${title} (new pack)`, discontinued: false, monthlyBefore: 34.5, monthlyAfter: 34.5, effectiveFrom: soon, changeUrl: `${base}/myhub` }))
  add('product-removed', templates.productRemoved({ productTitle: title, reason: 'member-choice', discontinued: true, monthlyBefore: 34.5, monthlyAfter: 24.5, effectiveFrom: soon, addUrl: `${base}/myhub` }))
  add('price-change-notice', templates.priceChangeNotice({ productTitle: title, monthlyBefore: 34.5, monthlyAfter: 36, effectiveFrom: soon, noticeDays: 30, hubUrl: `${base}/myhub` }))
  add('terms-updated', templates.termsUpdated({ summary: 'We’ve made the cancellation section clearer. Nothing about your plan or price changes.', effectiveFrom: soon, termsUrl: `${base}/legal/terms` }))
  add('password-reset', templates.passwordReset({ resetUrl: `${base}/myhub/reset-password?token=sample`, firstName: 'Alex', expiresIn: '1 hour' }))
  add('password-changed', templates.passwordChanged({ signInUrl: `${base}/myhub`, firstName: 'Alex' }))

  const order_ = Object.keys(LABELS) as TemplateId[]
  return out.sort((a, b) => order_.indexOf(a.template) - order_.indexOf(b.template))
}
