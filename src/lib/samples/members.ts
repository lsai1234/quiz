/**
 * Sample members for test views (server-only): one account per scenario on
 * the sample domain, rebuilt from fixed sample data each time its view is
 * opened, with dates counted back from today so "day 10" is always day 10.
 *
 * Orders and box plans go to the sample store (`./registry`), never the real
 * tables. Guides, check-ins, training plans, trainer threads and hub plans
 * use their usual kv homes, keyed by the sample account, and are left out of
 * every founders' number and list (`registry.sampleMemberIds`).
 */
import { createUser, getUserByEmail, type UserRecord } from '@/lib/db/users'
import { kvDelete } from '@/lib/db/kv'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { Order, OrderLine } from '@/lib/orders/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { GuideSeed } from '@/lib/guide/build'
import type { TrainingPlan, TrainingPrefs } from '@/lib/training/types'
import { sampleEmailFor } from './domain'
import { registerSampleMember, sampleMembers, setSampleOrders, setSampleSubscription, SAMPLE_ORDER_PREFIX } from './registry'
import type { SampleScenario } from './views'

const DAY = 86_400_000
const ago = (now: Date, days: number) => new Date(now.getTime() - days * DAY)
const iso = (d: Date) => d.toISOString()

export const SAMPLE_NAME = 'Alex Sample'

const SAMPLE_ADDRESS = { name: SAMPLE_NAME, line1: '1 Sample Street', line2: null, city: 'London', postcode: 'E1 6AN', country: 'GB', phone: null }

const SAMPLE_SEED: GuideSeed = {
  day: { wake: 7 * 60, bed: 23 * 60, trainAt: 18 * 60, trainDays: 3, trainWeekdays: [0, 2, 4], assumed: false },
  goals: ['muscle', 'energy'],
  firstName: 'Alex',
  stackName: 'The Builder',
  training: { types: ['strength'], experience: 'some', focus: null },
} as unknown as GuideSeed

const SAMPLE_PREFS: TrainingPrefs = {
  days: [0, 2, 4],
  minutes: 45,
  focus: 'muscle',
  split: 'auto',
  equipment: 'gym',
  experience: 'some',
  avoid: [],
  activities: [{ day: 5, kind: 'run', minutes: 30 }],
  trainAt: 18 * 60,
}

/** Three products a sample box holds: different categories, sold on their own. */
function pickProducts(catalogue: readonly CatalogueProduct[]): CatalogueProduct[] {
  const sellable = catalogue.filter((p) => !p.isSubscriptionOnly && p.variants?.some((v) => v.available) && p.swapGroup !== 'accessory')
  const out: CatalogueProduct[] = []
  // A box that looks like one: different categories first, then different kinds.
  for (const p of sellable) {
    if (out.length >= 3) break
    if (!out.some((o) => o.category === p.category)) out.push(p)
  }
  for (const p of sellable) {
    if (out.length >= 3) break
    if (!out.includes(p) && !out.some((o) => o.swapGroup === p.swapGroup)) out.push(p)
  }
  return out
}

function lineOf(p: CatalogueProduct): OrderLine {
  const v = p.variants.find((x) => x.available) ?? p.variants[0]
  return { sku: v?.sku ?? null, productId: p.id, title: p.title, variantTitle: v?.title ?? null, quantity: 1, unitPrice: v?.price ?? 20 }
}

function sampleOrder(user: UserRecord, scenario: SampleScenario, n: number, at: Date, products: CatalogueProduct[], opts: { channel?: Order['channel']; guideToken?: string | null } = {}): Order {
  const lines = products.map(lineOf)
  const subtotal = Math.round(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100
  return {
    id: `${SAMPLE_ORDER_PREFIX}${scenario}_${n}`,
    reference: `SAMPLE-${scenario.toUpperCase().replace(/[^A-Z0-9]/g, '')}${n}`.slice(0, 22),
    channel: opts.channel ?? 'quiz',
    status: 'paid',
    userId: user.id,
    email: user.email,
    currency: 'GBP',
    subtotal,
    shipping: 0,
    total: subtotal,
    lines,
    shippingAddress: SAMPLE_ADDRESS,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    supplierOrderId: null,
    supplierStatus: null,
    trackingNumber: null,
    guideSeed: SAMPLE_SEED,
    guideToken: opts.guideToken ?? null,
    events: [{ at: iso(at), type: 'paid' }],
    createdAt: iso(at),
    updatedAt: iso(at),
  } as unknown as Order
}

/** Clear everything a sample account holds, ready to build again. */
async function clearSample(userId: string): Promise<void> {
  await setSampleOrders(userId, [])
  await setSampleSubscription(userId, null)
  const [{ deleteTraining }, { deleteThread }, { deleteHubPlan }, { deleteCheckInsFor }] = await Promise.all([
    import('@/lib/training/store'),
    import('@/lib/trainer/store'),
    import('@/lib/hub-plan/store'),
    import('@/lib/checkin/store'),
  ])
  await Promise.all([deleteTraining(userId), deleteThread(userId), deleteHubPlan(userId), deleteCheckInsFor(userId)])
  // Their clips (a form check, a video note).
  const { mediaOwnedBy, deleteMedia } = await import('@/lib/media/store')
  for (const m of await mediaOwnedBy(userId)) await deleteMedia(m.id)
  await Promise.all([kvDelete(`hub-start:${userId}`), kvDelete(`hub-today:${userId}`), kvDelete(`hub-tips:${userId}`), kvDelete(`hub-seen:${userId}`)])
}

async function sampleAccount(scenario: SampleScenario): Promise<UserRecord> {
  const email = sampleEmailFor(scenario)
  const user = (await getUserByEmail(email)) ?? (await createUser({ email, name: SAMPLE_NAME }))
  await registerSampleMember(scenario, user.id)
  return user
}

async function sampleGuide(products: CatalogueProduct[], plan: 'oneoff' | 'subscription', at: Date): Promise<string> {
  const [{ buildGuide }, { newGuideToken, saveGuide }] = await Promise.all([import('@/lib/guide/build'), import('@/lib/guide/store')])
  const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
  const guide = buildGuide({
    token: newGuideToken(),
    now: iso(at),
    plan,
    lines: products.map((p) => ({ productId: p.id })),
    seed: SAMPLE_SEED,
    catalogue: (await getResolvedCatalogue()).products,
  })
  await saveGuide(guide)
  return guide.token
}

async function sampleTraining(user: UserRecord, now: Date, how: { check: 'waiting' | 'checked' | null; doneUpTo: number }): Promise<TrainingPlan> {
  const [{ buildWeek }, { newPlan }, { saveTraining }, { withLog }] = await Promise.all([
    import('@/lib/training/generate'),
    import('@/lib/training/edit'),
    import('@/lib/training/store'),
    import('@/lib/training/progress'),
  ])
  let plan = newPlan(user.id, SAMPLE_PREFS, ago(now, 2), 0, buildWeek(SAMPLE_PREFS, 0), 'rules')
  const today = (now.getUTCDay() + 6) % 7
  const lastWeek = iso(ago(now, 7)).slice(0, 10)
  plan = {
    ...plan,
    sessions: plan.sessions.map((s) =>
      s.day < Math.min(today, how.doneUpTo) && s.type === 'strength'
        ? { ...s, done: true, exercises: s.exercises.map((e) => ({ ...e, doneSets: e.sets })) }
        : s,
    ),
  }
  // A week of history behind each lift, so "last time" and the next step show.
  for (const s of plan.sessions) {
    if (s.type !== 'strength') continue
    for (const e of s.exercises.slice(0, 3)) plan = withLog(plan, e.id, { on: lastWeek, weightKg: 20, reps: e.high })
  }
  if (how.check) {
    plan = { ...plan, check: { state: how.check, since: iso(ago(now, 1)), at: how.check === 'checked' ? iso(now) : null, by: how.check === 'checked' ? 'Sample trainer' : null } }
  }
  await saveTraining({ v: 1, userId: user.id, readiness: { cleared: true, at: iso(ago(now, 2)) }, plan })
  return plan
}

async function sampleHubPlan(user: UserRecord, now: Date, how: 'paying' | 'free-days' | 'cancelling'): Promise<void> {
  const { saveHubPlan } = await import('@/lib/hub-plan/store')
  const next = how === 'free-days' ? new Date(now.getTime() + 70 * DAY) : new Date(now.getTime() + 12 * DAY)
  await saveHubPlan(
    {
      v: 1,
      userId: user.id,
      email: user.email,
      status: how === 'cancelling' ? 'cancelling' : 'active',
      monthly: 10,
      startedAt: iso(ago(now, 18)),
      nextChargeAt: how === 'cancelling' ? null : iso(next),
      freeUntil: how === 'free-days' ? iso(next) : null,
      endsAt: how === 'cancelling' ? iso(next) : null,
      lastPaymentIntentId: null,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      cancelledAt: how === 'cancelling' ? iso(ago(now, 1)) : null,
      updatedAt: iso(now),
    },
    now,
  )
}

/** Build (or rebuild) a scenario's sample member. Returns the account and its guide token, if it has one. */
export async function buildSampleMember(scenario: SampleScenario, now = new Date()): Promise<{ user: UserRecord; guide: string | null }> {
  const user = await sampleAccount(scenario)
  await clearSample(user.id)
  const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
  const products = pickProducts((await getResolvedCatalogue()).products)
  let guide: string | null = null

  const oneOff = async (daysAgo: number) => {
    const at = ago(now, daysAgo)
    guide = await sampleGuide(products, 'oneoff', at)
    await setSampleOrders(user.id, [sampleOrder(user, scenario, 1, at, products, { guideToken: guide })])
    const { registerCheckIns } = await import('@/lib/checkin/register')
    const { getGuide } = await import('@/lib/guide/store')
    const g = await getGuide(guide)
    if (g) await registerCheckIns(g, { email: user.email, userId: user.id, orderId: `${SAMPLE_ORDER_PREFIX}${scenario}_1` })
  }

  const monthly = async (patch: Partial<MemberSubscription>) => {
    const { createMockSubscription } = await import('@/lib/recharge/mock')
    const catalogue = (await getResolvedCatalogue()).products
    guide = await sampleGuide(products, 'subscription', ago(now, 40))
    const sub = { ...createMockSubscription(catalogue, user.email), customerEmail: user.email, guideToken: guide, guideSeed: SAMPLE_SEED, shippingAddress: SAMPLE_ADDRESS, ...patch } as MemberSubscription
    await setSampleSubscription(user.id, sub)
    await setSampleOrders(user.id, [sampleOrder(user, scenario, 1, ago(now, 12), products, { channel: 'subscription', guideToken: guide })])
  }

  switch (scenario) {
    case 'none':
      break
    case 'oneoff-day10':
      await oneOff(10)
      await sampleTraining(user, now, { check: 'checked', doneUpTo: 7 })
      break
    case 'deals-open':
      await oneOff(55)
      break
    case 'closing-soon':
      await oneOff(85)
      break
    case 'closed':
      await oneOff(100)
      break
    case 'monthly-active':
      await monthly({})
      await sampleTraining(user, now, { check: 'checked', doneUpTo: 7 })
      break
    case 'monthly-paused':
      await monthly({ status: 'paused' })
      break
    case 'monthly-past-due':
      await monthly({ billingStatus: 'past_due' })
      break
    case 'monthly-leaving':
      await monthly({ scheduledExitMonth: 3, cancelReason: 'Trying something else' } as Partial<MemberSubscription>)
      break
    case 'hub-paying': {
      await sampleHubPlan(user, now, 'paying')
      const { saveHubStart } = await import('@/lib/hub-plan/server')
      await saveHubStart(user.id, SAMPLE_SEED, now)
      await sampleTraining(user, now, { check: 'checked', doneUpTo: 7 })
      break
    }
    case 'hub-free-days':
      await oneOff(20)
      await sampleHubPlan(user, now, 'free-days')
      break
    case 'hub-cancelled': {
      await sampleHubPlan(user, now, 'cancelling')
      const { saveHubStart } = await import('@/lib/hub-plan/server')
      await saveHubStart(user.id, SAMPLE_SEED, now)
      break
    }
    case 'plan-waiting':
      await oneOff(3)
      await sampleTraining(user, now, { check: 'waiting', doneUpTo: 0 })
      break
    case 'plan-midweek':
      await oneOff(12)
      await sampleTraining(user, now, { check: 'checked', doneUpTo: 7 })
      break
    case 'plan-programme': {
      // Week 4 of 8 (the lighter week), a lift goal part-way, three weeks of lifts behind it.
      await oneOff(30)
      let plan = await sampleTraining(user, now, { check: 'checked', doneUpTo: 0 })
      const [{ mondayOf }, { applyProgrammeWeek, startProgramme }, { withLog }, { newGoal }, { saveTraining, getTraining }] = await Promise.all([
        import('@/lib/training/generate'),
        import('@/lib/training/programme'),
        import('@/lib/training/progress'),
        import('@/lib/training/goals'),
        import('@/lib/training/store'),
      ])
      const monday = mondayOf(now)
      const weeksAgo = (n: number, day = 1) => new Date(Date.parse(`${monday}T12:00:00Z`) - n * 7 * DAY + day * DAY).toISOString().slice(0, 10)
      plan = { ...startProgramme({ ...plan, log: {} }, 8, weeksAgo(3, 0)), history: [3, 2, 3].map((done, i) => ({ weekOf: weeksAgo(i + 1, 0), done, planned: 4 })) }
      const lifts = plan.sessions.flatMap((s) => (s.type === 'strength' ? s.exercises.slice(0, 2).map((e) => e.id) : []))
      for (const [i, id] of [...new Set(lifts)].slice(0, 4).entries()) {
        for (const [w, kg, reps] of [[3, 14, 8], [2, 16, 8], [1, 16, 10], [0, 18, 8]] as const) {
          const on = weeksAgo(w, i % 2)
          if (on <= now.toISOString().slice(0, 10)) plan = withLog(plan, id, { on, weightKg: kg + i * 4, reps })
        }
      }
      const first = [...new Set(lifts)][0]
      plan = applyProgrammeWeek({ ...plan, weekOf: monday })
      plan = { ...plan, goal: first ? newGoal({ ...plan, log: {} }, { kind: 'lift', exerciseId: first, targetKg: 30 }, new Date(`${weeksAgo(3, 0)}T12:00:00Z`)) : null }
      if (plan.goal) plan = { ...plan, goal: { ...plan.goal, startKg: 12 } }
      await saveTraining({ ...(await getTraining(user.id)), plan })
      break
    }
    case 'trainer-video': {
      // A form check from the member, answered with a video note, rated helpful and shared.
      await oneOff(20)
      await sampleTraining(user, now, { check: 'checked', doneUpTo: 7 })
      const [{ askTrainer, answerMember, rateAnswer, setShareOk }, { storeSampleClip }] = await Promise.all([import('@/lib/trainer/store'), import('./clip')])
      const form = await storeSampleClip('form-check', user.id)
      await askTrainer({ id: user.id, email: user.email, firstName: 'Alex' }, { text: 'Can you check my form on this? My knees seem to come in at the bottom.', about: 'Goblet squat', videoId: form }, 5, ago(now, 1))
      const note = await storeSampleClip('note', null, 'Video note')
      const done = await answerMember(
        user.id,
        { text: 'Thanks for filming it. Push your knees out over your little toes on the way down, and slow the last third. I’ve recorded what I mean.', videoId: note, by: 'Sample trainer' },
        new Date(now.getTime() - 3 * 3_600_000),
      )
      if (done) {
        await rateAnswer(user.id, done.message.id, 'helpful')
        await setShareOk(user.id, done.message.id, true)
      }
      break
    }
    case 'trainer-waiting':
    case 'trainer-answered': {
      await oneOff(14)
      const plan = await sampleTraining(user, now, { check: 'checked', doneUpTo: 7 })
      const { askTrainer, answerMember } = await import('@/lib/trainer/store')
      const first = plan.sessions.find((s) => s.type === 'strength')
      const lift = first && first.type === 'strength' ? first.exercises[0]?.id : null
      const { exerciseById } = await import('@/lib/training/library')
      const name = (lift && exerciseById(lift)?.name) || 'Goblet squat'
      await askTrainer({ id: user.id, email: user.email, firstName: 'Alex' }, { text: `My lower back feels tight at the bottom of the ${name.toLowerCase()}. Should I go lighter, or change how I set up?`, about: name }, 5, ago(now, 1))
      if (scenario === 'trainer-answered') {
        await answerMember(
          user.id,
          {
            text: 'Good question. Keep the weight for now and stop each rep just above where it tightens. Brace before you go down and keep your chest up. If it still feels tight next week, swap to the easier version in your plan.',
            videoUrl: 'https://www.youtube.com/watch?v=MeIiIdhvXT4',
            videoTitle: 'Set-up and bracing',
            by: 'Sample trainer',
          },
          new Date(now.getTime() - 2 * 3_600_000),
        )
      }
      break
    }
  }
  return { user, guide }
}

/** Every sample account there is, for the Test views page's reset. */
export async function resetSampleMembers(now = new Date()): Promise<number> {
  const all = await sampleMembers()
  for (const userId of Object.values(all)) await clearSample(userId)
  void now
  return Object.keys(all).length
}
