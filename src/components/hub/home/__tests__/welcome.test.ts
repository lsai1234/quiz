import { welcomeLine } from '../MemberHome'
import { HUB_PLAN_COPY } from '@/lib/hub-plan/copy'
import type { HubHome } from '@/lib/hub/home-types'

/** The first thing someone sees in the hub, in the words of how they arrived. */

const access = (state: HubHome['access']['state']) => ({ state, until: null, daysLeft: null, plan: null, hubPlan: null }) as HubHome['access']
const plan = (source: 'shop' | 'bundle' | 'answers' | null, status: 'active' | 'cancelled' = 'active') =>
  ({ status, source, monthly: 40, day: 24, billed: true, lines: [], nextBox: null, endedAt: null }) as HubHome['plan']
const home = (over: Partial<Pick<HubHome, 'plan' | 'access' | 'membership'>>) => ({ plan: null, access: access('none'), membership: null, ...over })

describe('the welcome', () => {
  it('names a shop basket, a bundle and a plan from answers, each with its day', () => {
    expect(welcomeLine('arrived', home({ plan: plan('shop'), access: access('subscriber') }))).toBe('Your monthly basket is set up. It comes on the 24th of each month, at the shop’s price. What’s on it, and how to change it, is below.')
    expect(welcomeLine('arrived', home({ plan: plan('bundle'), access: access('subscriber') }))).toMatch(/^Your bundle is set up and your first box is on its way\. After that it comes on the 24th/)
    expect(welcomeLine('arrived', home({ plan: plan('answers'), access: access('subscriber') }))).toMatch(/your guide below says when to take each product\.$/)
  })

  it('says an order is on its way, and the hub joined on its own is open', () => {
    expect(welcomeLine('arrived', home({ access: access('member') }))).toMatch(/^Your order is on its way\. Your hub is open for 90 days/)
    const membership = { status: 'active', monthly: 10 } as HubHome['membership']
    expect(welcomeLine('arrived', home({ access: access('subscriber'), membership }))).toBe(HUB_PLAN_COPY.welcome)
    expect(welcomeLine('joined', home({}))).toBe(HUB_PLAN_COPY.welcome)
  })

  it('explains a second plan that wasn’t started', () => {
    expect(welcomeLine('plan-exists', home({ plan: plan('answers') }))).toMatch(/^You already have a monthly plan, so we didn’t start a second one/)
  })
})
