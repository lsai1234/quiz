'use client'

import { useState } from 'react'
import { LastChanceView, type LastChanceDeal, type LastChanceViewProps } from '@/components/stack-review/LastChanceView'
import { PRODUCT_TYPE_LABELS as TYPE } from '@/lib/catalogue/product-type'

/**
 * Every state of the last-chance card, each in its own phone-width frame, so
 * it can be reviewed without finishing a quiz. `[data-state]` marks each frame
 * for screenshots. The first frame replays the arrival on demand.
 */

const noop = () => {}

const r2 = (n: number) => Math.round(n * 100) / 100

/** A deal's figures from its levers, the way `quoteOffer` derives them. */
function deal(
  listPrice: number,
  pct: number,
  standardDelivery: number,
  deliveryCharge: number,
  deliveryDeal: LastChanceDeal['deliveryDeal'],
  basePrice = listPrice,
): LastChanceDeal {
  const offerPrice = r2(basePrice * (1 - pct / 100))
  const normalTotal = r2(basePrice + standardDelivery)
  const total = r2(offerPrice + deliveryCharge)
  return {
    listPrice,
    basePrice,
    offerPrice,
    discountPct: pct,
    saving: r2(basePrice - offerPrice),
    standardDelivery,
    deliveryCharge,
    deliveryDeal,
    deliverySaving: r2(standardDelivery - deliveryCharge),
    normalTotal,
    total,
    totalSaving: r2(normalTotal - total),
  }
}

const BASE: LastChanceViewProps = {
  title: 'CHRGD Pre-Workout',
  role: TYPE['pre-workout-stim'],
  imageUrl: null,
  formats: ['powder'],
  goalLine: 'One of the 4 products we picked for you.',
  claim: null,
  servings: 30,
  packMonths: 1.5,
  deal: deal(29.99, 15, 4.95, 0, 'free'),
  remoteSurcharge: 2.95,
  status: 'idle',
  message: null,
  phase: 'static',
  onBuy: noop,
  onBackToStack: noop,
}

const STATES: Array<[string, Partial<LastChanceViewProps>]> = [
  ['free-delivery-and-percent', {}],
  ['free-delivery-only', { deal: deal(29.99, 0, 4.95, 0, 'free') }],
  ['reduced-delivery', { title: 'CHRGD Creatine Monohydrate', role: TYPE.creatine, formats: ['powder'], deal: deal(19.99, 0, 4.95, 1.49, 'reduced'), claim: 'Creatine increases physical performance in successive bursts of short-term, high intensity exercise', packMonths: 2 }],
  ['with-claim', { title: 'CHRGD Whey Protein', role: TYPE['protein-whey'], formats: ['powder'], goalLine: 'One of the 5 products we picked for you.', claim: 'Protein contributes to a growth in muscle mass', deal: deal(34.99, 5, 4.95, 0, 'free'), packMonths: 1 }],
  ['delivery-already-free', { title: 'CHRGD Mass Builder', role: TYPE['protein-mass'], formats: ['powder'], deal: deal(109.99, 24, 0, 0, 'included', 101.19), packMonths: 1, claim: 'Protein contributes to a growth in muscle mass' }],
  ['long-name-no-facts', { title: 'Collagen Hydrolysed Type I & III, Unflavoured — 300g', role: TYPE.collagen, formats: ['powder'], packMonths: null, servings: null }],
  ['loading', { status: 'loading' }],
  ['redirecting', { status: 'redirecting' }],
  ['blocked', { blocked: true }],
  ['error', { status: 'error', message: 'Unable to reach the store. Check your connection and try again.' }],
  ['deal-changed', { status: 'changed', message: 'This deal has changed: it’s now £26.99 delivered.', deal: deal(29.99, 10, 4.95, 0, 'free') }],
]

export function Board() {
  const [run, setRun] = useState(0)
  return (
    <main style={{ background: 'var(--color-bg)', minHeight: '100vh', padding: '24px 0 80px' }}>
      <div style={{ width: 390, margin: '0 auto 48px', padding: '0 20px' }}>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          style={{ color: 'var(--color-text-2)', fontSize: 12, textDecoration: 'underline', minHeight: 44 }}
        >
          Replay the arrival
        </button>
        <div data-state="arriving" style={{ background: 'var(--color-bg)', padding: '0 0 20px' }}>
          <LastChanceView key={run} {...BASE} phase="go" />
        </div>
      </div>

      {STATES.map(([name, patch]) => (
        <div key={name} style={{ width: 390, margin: '0 auto 40px' }}>
          <p style={{ color: 'var(--color-muted)', fontSize: 11, fontFamily: 'monospace', padding: '0 20px 6px' }}>{name}</p>
          <div data-state={name} style={{ background: 'var(--color-bg)', padding: '0 20px 20px' }}>
            <LastChanceView {...BASE} {...patch} />
          </div>
        </div>
      ))}
    </main>
  )
}
