'use client'

import type { StackLevel } from '@/lib/types'
import type { PricingConfig } from '@/lib/stack-blueprint/pricing'
import { Input, Note } from '@/components/system'

const LEVELS: StackLevel[] = ['essentials', 'performance', 'complete']
const LABEL: Record<StackLevel, string> = {
  essentials: 'Essentials',
  performance: 'Balanced',
  complete: 'Complete',
}

/**
 * A band that cannot be satisfied, in the founder's words rather than the
 * engine's.
 *
 * Every one of these describes a state the fill will still handle — the
 * precedence on `planTiers` decides which rule loses — so they are warnings, not
 * errors, and the save is never blocked. What they prevent is a founder setting
 * a number and being quietly overruled by another number they set last month.
 */
function problems(
  bands: PricingConfig['tierBands'],
  sizes: PricingConfig['tierSizes'],
): string[] {
  const out: string[] = []
  for (const level of LEVELS) {
    const band = bands[level]
    const size = sizes[level]
    if (size.min > size.max) {
      out.push(`${LABEL[level]} asks for at least ${size.min} products and at most ${size.max}.`)
    }
    if (band.max != null && band.target > band.max) {
      out.push(`${LABEL[level]} aims at £${band.target} but is capped at £${band.max}, so it will always stop at the cap.`)
    }
    if (band.target < band.min) {
      out.push(`${LABEL[level]} aims at £${band.target}, below its own floor of £${band.min}.`)
    }
  }
  // Nesting: a depth must be able to hold more than the one below it, or the
  // fold drops it and the member sees two options where you configured three.
  for (let i = 1; i < LEVELS.length; i++) {
    const below = sizes[LEVELS[i - 1]]
    const here = sizes[LEVELS[i]]
    if (here.max <= below.min) {
      out.push(
        `${LABEL[LEVELS[i]]} can never hold more than ${LABEL[LEVELS[i - 1]]}, so it will be folded away and members will see one option fewer.`,
      )
    }
  }
  return out
}

/**
 * What each depth is built to hold and to cost.
 *
 * Three rows rather than three separate settings, because every number here is
 * only meaningful against the two beside it: a floor of four products inside a
 * £35 ceiling is a instruction to break the ceiling, and that is only visible
 * when the two sit on one line.
 *
 * The numbers are a starting point, not a promise. `planTiers` fills to the
 * TARGET rather than the ceiling — which is what makes a band a price rather
 * than a range — and where a thin catalogue cannot satisfy everything, the
 * product floor wins over the price ceiling. A two-product Essentials at £36
 * is the intended outcome; a one-product Essentials at £32 was the bug this
 * replaced.
 */
export function TierBands({
  bands,
  sizes,
  onBandChange,
  onSizeChange,
}: {
  bands: PricingConfig['tierBands']
  sizes: PricingConfig['tierSizes']
  onBandChange: (level: StackLevel, patch: Partial<PricingConfig['tierBands'][StackLevel]>) => void
  onSizeChange: (level: StackLevel, patch: Partial<PricingConfig['tierSizes'][StackLevel]>) => void
}) {
  const warnings = problems(bands, sizes)

  const cell = (label: string, value: number, onChange: (n: number) => void) => (
    <Input
      label={label}
      compact
      align="right"
      className="w-16"
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  )

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) repeat(3, auto)',
          gap: 'var(--space-2)',
          alignItems: 'center',
        }}
      >
        <span />
        {['Products', 'Aims for', 'Never over'].map((h) => (
          <span
            key={h}
            style={{
              fontSize: 'var(--text-micro)',
              fontWeight: 'var(--weight-strong)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-eyebrow)',
              color: 'var(--ink-3)',
              textAlign: 'center',
            }}
          >
            {h}
          </span>
        ))}

        {LEVELS.map((level) => (
          <div key={level} style={{ display: 'contents' }}>
            <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
              {LABEL[level]}
            </span>
            <span style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
              {cell(`${LABEL[level]} fewest products`, sizes[level].min, (n) => onSizeChange(level, { min: n }))}
              <span style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>to</span>
              {cell(`${LABEL[level]} most products`, sizes[level].max, (n) => onSizeChange(level, { max: n }))}
            </span>
            {cell(`${LABEL[level]} target price`, bands[level].target, (n) => onBandChange(level, { target: n }))}
            {cell(`${LABEL[level]} price ceiling`, bands[level].max ?? 0, (n) => onBandChange(level, { max: n }))}
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <Note tone="attention" live="polite">
          {warnings.map((w) => (
            <span key={w} style={{ display: 'block' }}>
              {w}
            </span>
          ))}
        </Note>
      )}
    </div>
  )
}
