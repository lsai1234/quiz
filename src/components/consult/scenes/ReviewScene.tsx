'use client'

import { sceneDef } from '@/lib/consult/flow'
import { summarise } from '@/lib/consult/summary'
import type { ConsultAnswers, SceneId } from '@/lib/consult/types'
import { Glyph } from '../Glyph'

/**
 * Every answer on one screen, as a card you can tap to change.
 * Nothing has been decided yet, and the screen says so.
 */

interface Props {
  scenes: SceneId[]
  answers: ConsultAnswers
  onEdit: (scene: SceneId) => void
}

export function ReviewScene({ scenes, answers, onEdit }: Props) {
  const reviewable = scenes.filter((id) => id !== 'review' && id !== 'circuit')
  return (
    <ul className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
      {reviewable.map((id) => {
        const def = sceneDef(id)
        const value = summarise(id, answers)
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onEdit(id)}
              aria-label={`${def.label}: ${value || 'not answered'}. Change`}
              className="amp-press flex w-full items-center text-left"
              style={{
                gap: 'var(--amp-space-3)',
                minHeight: 'var(--amp-target)',
                padding: 'var(--amp-space-3) var(--amp-space-4)',
                borderRadius: 'var(--amp-radius-tile)',
                background: 'var(--amp-glass-solid)',
                border: 'var(--amp-hairline) solid var(--amp-edge)',
              }}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className="uppercase"
                  style={{
                    fontFamily: 'var(--amp-font-mono)',
                    fontSize: 'var(--amp-text-data)',
                    letterSpacing: 'var(--amp-tracking-data)',
                    color: 'var(--amp-ink-3)',
                  }}
                >
                  {def.label}
                </span>
                <span style={{ marginTop: 'var(--amp-space-1)', fontSize: 'var(--amp-text-body)', color: 'var(--amp-ink)' }}>
                  {value || '—'}
                </span>
              </span>
              <span className="flex items-center" style={{ gap: 'var(--amp-space-1)', color: 'var(--amp-accent)', fontSize: 'var(--amp-text-meta)' }}>
                <Glyph name="edit" size={16} />
                Edit
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
