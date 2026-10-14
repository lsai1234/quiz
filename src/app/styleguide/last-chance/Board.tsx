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
  reason: 'You train in the evenings after a desk day — this is the one that gets you through the door with something left in the tank.',
  claims: ['caffeine contributes to increased alertness and concentration', 'may support improved focus and energy output during training'],
  noticeable: 'right away',
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
  ['free-delivery', { title: 'CHRGD Mass Builder', role: 'Protein', slotType: 'protein', listPrice: 109.99, offerPrice: 93.49, saving: 16.5, deliveryCharge: 0, total: 93.49, noticeable: 'within a few weeks', packMonths: 1, claims: ['provides extra calories and protein to support a calorie surplus'] }],
  ['not-felt', { title: 'CHRGD Plant Protein', role: 'Protein', slotType: 'protein', onset: 'none', noticeable: 'quietly in the background', claims: ['a complete plant-based protein source supporting muscle maintenance'] }],
  ['long-name-no-pack', { title: 'Collagen Hydrolysed Type I & III, Unflavoured — 300g', role: 'Recovery', slotType: 'recovery', packMonths: null, noticeable: 'over the first couple of months' }],
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
