'use client'

import type { CSSProperties } from 'react'
import { AGE_LABEL, SEX_LABEL } from '@/lib/consult/summary'
import type { AgeBand, Sex } from '@/lib/consult/types'
import { haptic, stateTransition } from '@/lib/consult/motion'
import { Segmented, radioArrows } from '../controls'
import type { SceneProps } from './registry'

/**
 * About you (build C3, made plain in the clarity pass): their age band and
 * their sex, each a row of buttons with its own label. One tap each; nothing
 * looks picked until it is.
 *
 * The age bands were a spinning drum. It read as already answered (a band sat
 * in the frame before anyone touched it), and "spin to your age" needed
 * explaining; a grid of bands needs neither. Comfort mode makes them two to a
 * row, bigger.
 */

export const AGE_BANDS: AgeBand[] = ['under-18', '18-24', '25-34', '35-44', '45-54', '55-64', '65-plus']
const SEXES: Sex[] = ['female', 'male', 'unsaid']

const LABEL: CSSProperties = {
  fontSize: 'var(--amp-text-meta)',
  fontWeight: 'var(--amp-weight-bold)',
  color: 'var(--amp-ink-2)',
}

export function AgeWheel({ answers, onAnswer, comfort }: SceneProps) {
  const current = answers.age

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-6)' }}>
      <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
        <p id="amp-age-label" style={LABEL}>
          Your age
        </p>
        <div
          role="radiogroup"
          aria-label="Age band"
          onKeyDown={radioArrows}
          className={`grid ${comfort ? 'grid-cols-2' : 'grid-cols-4'}`}
          style={{ gap: 'var(--amp-space-2)' }}
        >
          {AGE_BANDS.map((band, i) => {
            const on = band === current
            return (
              <button
                key={band}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on || (!current && i === 0) ? 0 : -1}
                onClick={() => {
                  haptic('tick')
                  onAnswer({ age: band, sex: answers.sex })
                }}
                className="amp-press"
                style={{
                  minHeight: 'var(--amp-target)',
                  padding: '0 var(--amp-space-2)',
                  borderRadius: 'var(--amp-radius-chip)',
                  border: `var(--amp-hairline) solid ${on ? 'var(--amp-accent-line)' : 'var(--amp-edge-strong)'}`,
                  background: on ? 'var(--amp-accent-fill)' : 'var(--amp-glass-solid)',
                  boxShadow: on ? 'var(--amp-glow-soft)' : 'none',
                  color: on ? 'var(--amp-accent)' : 'var(--amp-ink)',
                  fontSize: 'var(--amp-text-body)',
                  fontWeight: 'var(--amp-weight-medium)',
                  whiteSpace: 'nowrap',
                  transition: stateTransition('border-color', 'background-color', 'box-shadow', 'color'),
                }}
              >
                {AGE_LABEL[band]}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
        <p id="amp-sex-label" style={LABEL}>
          Your sex
        </p>
        <Segmented
          label="Sex"
          options={SEXES.map((s) => ({ value: s, label: SEX_LABEL[s] }))}
          value={answers.sex}
          onChange={(s) => onAnswer({ sex: s, age: answers.age })}
        />
      </div>
    </div>
  )
}
