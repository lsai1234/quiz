'use client'

import { FOOD_LABEL } from '@/lib/consult/summary'
import type { Food } from '@/lib/consult/types'
import { haptic, stateTransition } from '@/lib/consult/motion'
import { Glyph, type GlyphName } from '../Glyph'
import { Hint } from '../controls'
import type { SceneProps } from './registry'

/**
 * The plate picker (build C9).
 *
 * A grid of foods; tap everything you eat at least once a week. Big square
 * tiles in the lower half of the screen, where a thumb reaches one-handed.
 *
 * It reads the plate back as you build it, so the gaps the stack engine will
 * act on aren't a surprise: no oily fish (omega-3), a fully plant-based plate
 * (B12, iron). It restates what was tapped; it doesn't recommend anything.
 */

export const FOODS: { id: Food; icon: GlyphName }[] = [
  { id: 'oily-fish', icon: 'fish' },
  { id: 'red-meat', icon: 'meat' },
  { id: 'poultry', icon: 'poultry' },
  { id: 'eggs', icon: 'egg' },
  { id: 'dairy', icon: 'dairy' },
  { id: 'beans', icon: 'beans' },
  { id: 'greens', icon: 'leaf' },
  { id: 'fruit', icon: 'fruit' },
  { id: 'nuts', icon: 'nut' },
  { id: 'wholegrains', icon: 'grain' },
]

const ANIMAL: Food[] = ['oily-fish', 'red-meat', 'poultry', 'eggs', 'dairy']

export interface PlateRead {
  plantBased: boolean
  noOilyFish: boolean
}

/** What the plate says, for the scene's read-back and the stack engine. */
export function readPlate(plate: Food[]): PlateRead {
  return {
    plantBased: plate.length > 0 && !plate.some((f) => ANIMAL.includes(f)),
    noOilyFish: plate.length > 0 && !plate.includes('oily-fish'),
  }
}

export function PlatePicker({ answers, onAnswer, comfort }: SceneProps) {
  const plate = answers.plate ?? []

  function toggle(food: Food) {
    haptic('select')
    const next = plate.includes(food) ? plate.filter((f) => f !== food) : [...plate, food]
    onAnswer({ plate: next.length ? next : null })
  }

  const read = readPlate(plate)

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-4)' }}>
      <div role="group" aria-label="Foods you eat most weeks" className={`grid ${comfort ? 'grid-cols-2' : 'grid-cols-4'}`} style={{ gap: 'var(--amp-space-2)' }}>
        {FOODS.map((f) => {
          const on = plate.includes(f.id)
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(f.id)}
              className="amp-press relative flex flex-col items-center justify-center text-center"
              style={{
                gap: 'var(--amp-space-2)',
                aspectRatio: comfort ? undefined : '1 / 1.05',
                minHeight: 'var(--amp-target)',
                padding: 'var(--amp-space-2) var(--amp-space-1)',
                borderRadius: 'var(--amp-radius-tile)',
                background: on ? 'var(--amp-accent-fill)' : 'var(--amp-glass-solid)',
                border: `var(--amp-hairline) solid ${on ? 'var(--amp-accent)' : 'var(--amp-edge)'}`,
                boxShadow: on ? '0 0 18px -8px var(--amp-accent-glow)' : 'none',
                color: on ? 'var(--amp-ink)' : 'var(--amp-ink-2)',
                transition: stateTransition('background-color', 'border-color', 'color', 'box-shadow'),
              }}
            >
              {on && (
                <span
                  aria-hidden
                  className="absolute"
                  style={{
                    top: 'var(--amp-space-2)',
                    right: 'var(--amp-space-2)',
                    width: 'var(--amp-space-2)',
                    height: 'var(--amp-space-2)',
                    borderRadius: 'var(--amp-radius-pill)',
                    background: 'var(--amp-accent)',
                  }}
                />
              )}
              <span style={{ color: on ? 'var(--amp-accent)' : 'var(--amp-ink-3)' }}>
                <Glyph name={f.icon} size={26} />
              </span>
              <span style={{ fontSize: 'var(--amp-text-meta)', lineHeight: 'var(--amp-leading-tight)' }}>{FOOD_LABEL[f.id]}</span>
            </button>
          )
        })}
      </div>

      <div aria-live="polite" className="flex flex-col items-center" style={{ gap: 'var(--amp-space-2)', minHeight: 'var(--amp-space-8)' }}>
        {read.plantBased && <Hint tone="go">Fully plant-based. Noted.</Hint>}
        {read.noOilyFish && !read.plantBased && <Hint>No oily fish most weeks. Noted.</Hint>}
      </div>
    </div>
  )
}
