'use client'

import { useState } from 'react'
import { LastChanceView, type LastChanceViewProps } from '@/components/stack-review/LastChanceView'

/**
 * Every state of the last-chance card, each in its own phone-width frame, so
 * it can be reviewed without finishing a quiz. `[data-state]` marks each frame
 * for screenshots. The first frame replays the arrival on demand.
 */

const noop = () => {}

const BASE: LastChanceViewProps = {
  title: 'CHRGD Pre-Workout',
  role: 'Energy / Pre-Workout',
  imageUrl: null,
  slotType: 'energy',
  goalLine: 'You told us your top goal is “Energy”. Of the 4 products in your stack, this is the one built around it.',
  claim: null,
  servings: 30,
  packMonths: 1.5,
  listPrice: 29.99,
  offerPrice: 25.49,
  discountPct: 15,
  saving: 4.5,
  deliveryCharge: 4.95,
  total: 30.44,
  status: 'idle',
  message: null,
  phase: 'static',
  onBuy: noop,
  onBackToStack: noop,
}

const STATES: Array<[string, Partial<LastChanceViewProps>]> = [
  ['discounted', {}],
  ['no-discount', { offerPrice: 29.99, discountPct: 0, saving: 0, total: 34.94 }],
  ['with-claim', { title: 'CHRGD Whey Protein', role: 'Protein', slotType: 'protein', goalLine: 'You told us your top goal is “Build muscle”. Of the 5 products in your stack, this is the one built around it. It’s the core of your stack.', claim: 'Protein contributes to a growth in muscle mass', listPrice: 34.99, offerPrice: 31.49, discountPct: 10, saving: 3.5, total: 36.44, packMonths: 1 }],
  ['free-delivery', { title: 'CHRGD Mass Builder', role: 'Protein', slotType: 'protein', listPrice: 109.99, offerPrice: 93.49, saving: 16.5, deliveryCharge: 0, total: 93.49, packMonths: 1, claim: 'Protein contributes to a growth in muscle mass' }],
  ['long-name-no-facts', { title: 'Collagen Hydrolysed Type I & III, Unflavoured — 300g', role: 'Recovery', slotType: 'recovery', packMonths: null, servings: null, goalLine: 'Picked for your goal “Recovery”.' }],
  ['loading', { status: 'loading' }],
  ['redirecting', { status: 'redirecting' }],
  ['error', { status: 'error', message: 'Unable to reach the store. Check your connection and try again.' }],
  ['price-changed', { status: 'changed', message: 'The price has changed to £26.99.', offerPrice: 26.99, saving: 3, total: 31.94, discountPct: 10 }],
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
