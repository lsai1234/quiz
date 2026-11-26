'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Badge, Button, Card, Note, buttonSurface } from '@/components/system'
import { useBasket } from '@/lib/basket/store'
import { reorderLines } from '@/lib/basket/reorder'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { billingDayPhrase } from '@/lib/recharge/billing-day'
import { planKindLabel, type OrderSummary, type PlanSummary } from '@/lib/hub/summary'
import { rhythmLabel, shortBoxDate } from '@/lib/hub/line-facts'
import type { HubPlanView } from '@/lib/hub-plan/plan'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { body, col, meta, SectionHead, strong } from './ui'

/**
 * What a member has with us, at the top of the hub, whichever way they came in:
 * the plan (what's on it, what it costs, when the next box comes), what they
 * bought once, and the hub on its own. Each with the next thing they'd want to
 * do: manage the plan, add to it, buy something again.
 *
 * The plan's full controls are further down (`SubscriptionDashboard`); this is
 * the picture, with the way to them. A plan and one-off orders can both be
 * here: someone on a plan who also bought a shaker once sees both.
 */

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Ask the plan's controls to open their "add a product" sheet (`SubscriptionDashboard` listens). */
export const OPEN_ADD_PRODUCT = 'chrgd:hub-add-product'

export function WhatYouHave({ plan, orders, membership }: { plan: PlanSummary | null; orders: OrderSummary[]; membership: HubPlanView | null }) {
  const reduced = useReducedMotion()
  const live = plan && plan.status !== 'cancelled' ? plan : null
  const once = orders.filter((o) => o.kind === 'once').slice(0, 3)
  if (!plan && once.length === 0 && !membership) return null

  const toPlan = (then?: () => void) => {
    const section = document.querySelector<HTMLElement>('[data-plan]')
    section?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    // So a keyboard or screen reader carries on from the plan, not from the button.
    section?.focus({ preventScroll: true })
    then?.()
  }

  return (
    <section data-what-you-have aria-label="What you have">
      <SectionHead eyebrowText="Your account" title="What you have" />
      <div style={col('var(--space-3)')}>
        {live && (
          <div data-have-plan>
          <Card>
            <div style={col('var(--space-3)')}>
              <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--space-2)' }}>
                <p style={strong}>{planKindLabel(live.source)}</p>
                <Badge tone={live.status === 'active' ? 'positive' : 'attention'} dot>
                  {live.status === 'active' ? 'Active' : 'Paused'}
                </Badge>
              </div>
              <p style={body}>
                {formatGBP(live.monthly)} a month, charged on {billingDayPhrase(live.day)} of each month.
                {live.status === 'paused' && ' Paused: nothing ships and nothing is charged until you resume.'}
              </p>

              <div>
                <p style={{ ...meta, marginBottom: 'var(--space-1)' }}>On your plan</p>
                <ul style={col('var(--space-1)')} data-plan-lines>
                  {live.lines.map((l, i) => (
                    <li key={`${l.productId}-${i}`} className="flex items-baseline justify-between" style={{ gap: 'var(--space-3)' }}>
                      <span style={{ ...body, color: 'var(--ink-1)' }} className="min-w-0">
                        {l.title}
                        {l.variant && <span style={{ color: 'var(--ink-3)' }}> · {l.variant}</span>}
                      </span>
                      <span style={{ ...meta, textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ display: 'block', whiteSpace: 'nowrap' }}>{rhythmLabel(l.quantity, l.every)}</span>
                        {l.next && <span style={{ display: 'block', whiteSpace: 'nowrap' }}>next {shortBoxDate(l.next)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {live.nextBox && (
                <p style={body} data-next-box>
                  Next box <strong style={{ color: 'var(--ink-1)' }}>{longDate(live.nextBox.date)}</strong>: {live.nextBox.items.length}{' '}
                  {live.nextBox.items.length === 1 ? 'item' : 'items'}
                  {live.nextBox.extras > 0 && `, ${live.nextBox.extras} of them ${live.nextBox.extras === 1 ? 'an extra' : 'extras'} you added`}.
                </p>
              )}

              <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
                <Button variant="primary" size="sm" icon="sliders" onClick={() => toPlan()}>
                  Manage your plan
                </Button>
                <Button variant="secondary" size="sm" icon="plus" onClick={() => toPlan(() => window.dispatchEvent(new Event(OPEN_ADD_PRODUCT)))}>
                  Add a product
                </Button>
                {live.status === 'active' && live.nextBox && <ShopLink label="Shop for your next box" />}
              </div>
              {live.status === 'active' && live.nextBox && (
                <p style={meta}>Anything in the shop can go in your next box: it’s added to that box’s payment and ships with it, with no delivery charge.</p>
              )}
            </div>
          </Card>
          </div>
        )}

        {plan?.status === 'cancelled' && (
          <div data-have-plan-ended>
          <Card>
            <div style={col('var(--space-2)')}>
              <p style={strong}>Your monthly plan has ended</p>
              <p style={body}>
                {plan.endedAt ? `It ended on ${shortDate(plan.endedAt)}. ` : ''}Nothing more will be charged, and everything already sent is yours.
              </p>
              <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
                <ShopLink label="Start a new plan" href="/quiz" />
              </div>
            </div>
          </Card>
          </div>
        )}

        {once.length > 0 && <BoughtOnce orders={once} hasPlan={Boolean(live)} />}

        {membership && membership.status !== 'cancelled' && (
          <div data-have-membership>
          <Card>
            <div style={col('var(--space-1)')}>
              <p style={strong}>The member hub, on its own</p>
              <p style={body}>
                {formatGBP(membership.monthly)} a month
                {membership.status === 'cancelling' && membership.endsAt ? `, ending ${shortDate(membership.endsAt)}` : membership.nextChargeAt ? `, next on ${shortDate(membership.nextChargeAt)}` : ''}. Manage it below.
              </p>
            </div>
          </Card>
          </div>
        )}
      </div>
    </section>
  )
}

function ShopLink({ label, href = '/shop' }: { label: string; href?: string }) {
  const surface = buttonSurface('secondary', 'sm')
  return (
    <Link href={href} className={surface.className} style={surface.style}>
      {label}
    </Link>
  )
}

/** Orders bought one at a time, with the way to buy them again, or every month. */
function BoughtOnce({ orders, hasPlan }: { orders: OrderSummary[]; hasPlan: boolean }) {
  const router = useRouter()
  const { products } = useCatalogueProducts()
  const [missing, setMissing] = useState<string[] | null>(null)

  const again = (order: OrderSummary, monthly: boolean) => {
    const { add, missing } = reorderLines(order.lines, products)
    const basket = useBasket.getState()
    for (const l of add) basket.add(l.productId, l.variantId, l.quantity)
    basket.setPlan(monthly ? 'monthly' : 'once')
    if (missing.length && !add.length) {
      setMissing(missing)
      return
    }
    router.push(missing.length ? `/shop?unavailable=${missing.length}#basket` : '/shop#basket')
  }

  return (
    <div data-have-orders>
          <Card>
      <div style={col('var(--space-3)')}>
        <p style={strong}>Bought once</p>
        <ul style={col('var(--space-3)')}>
          {orders.map((o) => (
            <li key={o.reference} style={col('var(--space-2)')} data-have-order>
              <div>
                <p style={{ ...body, color: 'var(--ink-1)' }}>{o.items.join(', ')}</p>
                <p style={meta}>
                  {shortDate(o.createdAt)} · {formatGBP(o.total)} · {o.reference}
                </p>
              </div>
              <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
                <Button variant="secondary" size="sm" icon="refresh" onClick={() => again(o, false)}>
                  Buy again
                </Button>
                {/* One plan per account: someone on a plan adds to it instead. */}
                {!hasPlan && (
                  <Button variant="ghost" size="sm" icon="calendar" onClick={() => again(o, true)}>
                    Get these every month
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {hasPlan && <p style={meta}>On a plan already? Open any of these in the shop and choose “Add to your next box”.</p>}
        {missing && (
          <Note tone="attention" live="polite">
            {missing.join(', ')} {missing.length === 1 ? 'isn’t' : 'aren’t'} on sale right now, so there was nothing to put in your basket.
          </Note>
        )}
      </div>
    </Card>
    </div>
  )
}
