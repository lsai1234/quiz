'use client'

import { applyPlaceholder, placeholderSelected, type SceneDef } from '@/lib/consult/flow'
import type { ConsultAnswers } from '@/lib/consult/types'
import { Tile } from '../controls'

/**
 * The scripted stand-in for a scene whose interactive element isn't built yet.
 *
 * Its options come straight from `scenes.json`, and each one writes a complete,
 * realistic answer, so the whole consult can be run end to end on scripts
 * before a single widget exists. Level 2 replaces these one scene at a time.
 */

interface Props {
  scene: SceneDef
  answers: ConsultAnswers
  onAnswer: (patch: Partial<ConsultAnswers>) => void
}

export function PlaceholderScene({ scene, answers, onAnswer }: Props) {
  const options = scene.placeholder?.options ?? []
  const multi = Boolean(scene.placeholder?.multi)
  return (
    <div
      role={multi ? 'group' : 'radiogroup'}
      aria-label={scene.copy.question}
      className="grid grid-cols-1"
      style={{ gap: 'var(--amp-space-2)' }}
    >
      {options.map((option) => {
        const selected = placeholderSelected(option, answers)
        const rank = multi && option.toggle ? (answers[option.toggle[0]] as string[]).indexOf(option.toggle[1]) : -1
        return (
          <Tile
            key={option.label}
            label={option.label}
            layout="row"
            kind={multi ? 'toggle' : 'radio'}
            selected={selected}
            badge={rank >= 0 ? rank + 1 : undefined}
            onSelect={() => onAnswer(applyPlaceholder(option, answers))}
          />
        )
      })}
    </div>
  )
}
