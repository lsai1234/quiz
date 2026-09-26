'use client'

import { AIM_LABEL } from '@/lib/consult/summary'
import type { TrainingAim } from '@/lib/consult/types'
import type { GlyphName } from '../Glyph'
import { Tile, radioArrows } from '../controls'
import type { SceneProps } from './registry'

/**
 * What are you training for? (batch 5, builders only)
 *
 * One pick. A 22-year-old putting on size and a five-a-side regular both
 * tick "performance", but they want different things first: this is where
 * the consult tells them apart.
 */

export const AIMS: { key: TrainingAim; icon: GlyphName; sub: string }[] = [
  { key: 'muscle', icon: 'gym', sub: 'Size, and a split to match' },
  { key: 'strength', icon: 'bolt', sub: 'Heavier lifts, more reps' },
  { key: 'sport', icon: 'sport', sub: 'Faster, sharper, lasting the game' },
  { key: 'endurance', icon: 'cardio', sub: 'Runs, rides, swims, races' },
]

export function AimTiles({ answers, onAnswer, comfort }: SceneProps) {
  return (
    <div role="radiogroup" aria-label="What you’re training for" className="grid grid-cols-2" style={{ gap: 'var(--amp-space-2)' }} onKeyDown={(e) => radioArrows(e)}>
      {AIMS.map((a) => (
        <Tile
          key={a.key}
          kind="radio"
          layout={comfort ? 'stack' : 'compact'}
          icon={a.icon}
          label={AIM_LABEL[a.key]}
          sub={a.sub}
          selected={answers.aim === a.key}
          onSelect={() => onAnswer({ aim: a.key })}
        />
      ))}
    </div>
  )
}
