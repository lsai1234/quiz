'use client'

import { useState } from 'react'
import type { ConsultGoal } from '@/lib/consult/types'
import { GOAL_LABEL } from '@/lib/consult/summary'
import { Glyph, type GlyphName } from '../Glyph'
import { Hint, Tile } from '../controls'
import type { SceneProps } from './registry'

/**
 * Goal tiles with priority (build C2).
 *
 * Six goals, pick up to three. The order you tap them numbers them 1, 2, 3,
 * and that order is the weight each one carries later (×3, ×2, ×1). Tapping a
 * picked tile takes it out and the others close up, keeping their order. A
 * fourth tap doesn't silently fail: it says three is the most, and how to swap.
 *
 * Reordering without starting over: once two are picked, the priority strip
 * under the grid lets any goal move up a place.
 */

export const MAX_GOALS = 3

const GOALS: { id: ConsultGoal; icon: GlyphName; sub: string }[] = [
  { id: 'performance', icon: 'performance', sub: 'Strength, power, results' },
  { id: 'energy', icon: 'energy', sub: 'Get through the day' },
  { id: 'sleep', icon: 'sleep', sub: 'Rest and bounce back' },
  { id: 'focus', icon: 'focus', sub: 'Stay sharp' },
  { id: 'ageing', icon: 'ageing', sub: 'Bones, joints, keep moving' },
  { id: 'allround', icon: 'allround', sub: 'Cover the basics' },
]

/** Toggle a goal in a priority list. Returns the list unchanged when it's full. */
export function toggleGoal(goals: ConsultGoal[], goal: ConsultGoal): ConsultGoal[] {
  if (goals.includes(goal)) return goals.filter((g) => g !== goal)
  if (goals.length >= MAX_GOALS) return goals
  return [...goals, goal]
}

/** Move a goal one place up the priority order. */
export function promoteGoal(goals: ConsultGoal[], goal: ConsultGoal): ConsultGoal[] {
  const i = goals.indexOf(goal)
  if (i <= 0) return goals
  const next = [...goals]
  ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
  return next
}

export function GoalTiles({ answers, onAnswer }: SceneProps) {
  const goals = answers.goals
  const [full, setFull] = useState(false)

  function tap(goal: ConsultGoal) {
    const next = toggleGoal(goals, goal)
    setFull(next === goals && !goals.includes(goal))
    if (next !== goals) onAnswer({ goals: next })
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-4)' }}>
      <div role="group" aria-label="Goals, up to three" className="grid grid-cols-2" style={{ gap: 'var(--amp-space-3)' }}>
        {GOALS.map((g) => {
          const rank = goals.indexOf(g.id)
          return (
            <Tile
              key={g.id}
              icon={g.icon}
              label={GOAL_LABEL[g.id]}
              sub={g.sub}
              selected={rank >= 0}
              badge={rank >= 0 ? rank + 1 : undefined}
              onSelect={() => tap(g.id)}
            />
          )
        })}
      </div>

      <div aria-live="polite" style={{ minHeight: 'var(--amp-target)' }}>
        {full ? (
          <Hint tone="caution">Three is the most. Tap one to swap it out.</Hint>
        ) : goals.length > 1 ? (
          <ol aria-label="Priority order" className="flex flex-wrap items-center justify-center" style={{ gap: 'var(--amp-space-2)' }}>
            {goals.map((g, i) => (
              <li key={g} className="flex items-center" style={{ gap: 'var(--amp-space-1)' }}>
                <span
                  style={{
                    fontFamily: 'var(--amp-font-mono)',
                    fontSize: 'var(--amp-text-data)',
                    letterSpacing: 'var(--amp-tracking-data)',
                    color: i === 0 ? 'var(--amp-accent)' : 'var(--amp-ink-2)',
                  }}
                >
                  {i + 1}. {GOAL_LABEL[g].toUpperCase()}
                </span>
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => onAnswer({ goals: promoteGoal(goals, g) })}
                    aria-label={`Move ${GOAL_LABEL[g]} up to number ${i}`}
                    className="amp-press flex items-center justify-center"
                    style={{
                      width: 'var(--amp-space-8)',
                      height: 'var(--amp-space-8)',
                      borderRadius: 'var(--amp-radius-pill)',
                      border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
                      color: 'var(--amp-ink-2)',
                    }}
                  >
                    <span style={{ transform: 'rotate(90deg)', display: 'inline-flex' }}>
                      <Glyph name="back" size={14} />
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  )
}
