'use client'

import { useState } from 'react'
import type { ConsultAnswers, ConsultGoal } from '@/lib/consult/types'
import { GOAL_LABEL } from '@/lib/consult/summary'
import { Glyph, type GlyphName } from '../Glyph'
import { Hint, Segmented, Switch, Tile } from '../controls'
import { toggleFlag } from './CircuitCheck'
import { WhatsThis } from '../WhatsThis'
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
 *
 * Weight loss (plan v4) is a seventh goal, full width under the grid. Picked,
 * it opens to one optional switch: weight-loss injections or tablets. That's
 * health data from the moment it's tapped — it's written to the circuit
 * check's answers, which are never saved to the phone or sent to AI, and the
 * circuit check asks for consent before anything uses it.
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

const WEIGHT = { id: 'weight' as const, icon: 'scale' as const, sub: 'Losing fat, with or without a jab' }

/** The circuit answer with the weight-loss medication switch set as asked. */
export function withWeightMeds(circuit: ConsultAnswers['circuit'], on: boolean): ConsultAnswers['circuit'] {
  const has = Boolean(circuit?.flags.includes('weight-meds'))
  if (has === on) return circuit
  const next = toggleFlag(circuit, 'weight-meds')
  return next.flags.length === 0 ? null : next
}

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

export function GoalTiles({ scene, answers, onAnswer, ai, comfort }: SceneProps) {
  const goals = answers.goals
  const [full, setFull] = useState(false)

  function tap(goal: ConsultGoal) {
    const next = toggleGoal(goals, goal)
    setFull(next === goals && !goals.includes(goal))
    if (next === goals) return
    // Taking Weight loss out takes its medication switch with it.
    if (goal === 'weight' && !next.includes('weight')) onAnswer({ goals: next, circuit: withWeightMeds(answers.circuit, false) })
    else onAnswer({ goals: next })
  }

  const tile = (g: { id: ConsultGoal; icon: GlyphName; sub: string }) => {
    const rank = goals.indexOf(g.id)
    return (
      <div className="relative">
        <Tile
          icon={g.icon}
          label={GOAL_LABEL[g.id]}
          sub={scene.copy.labels?.[g.id] ?? g.sub}
          selected={rank >= 0}
          badge={rank >= 0 ? rank + 1 : undefined}
          onSelect={() => tap(g.id)}
          layout={comfort ? 'stack' : 'compact'}
          clearCorner
        />
        {/* A sibling of the tile, not inside it: a button can't hold a button. */}
        <span className="absolute" style={{ right: 'var(--amp-space-1)', bottom: 'var(--amp-space-1)' }}>
          <WhatsThis term={g.id} questions={ai} />
        </span>
      </div>
    )
  }

  const losing = goals.includes('weight')
  const meds = Boolean(answers.circuit?.flags.includes('weight-meds'))
  const setMeds = (on: boolean) => onAnswer({ circuit: withWeightMeds(answers.circuit, on) })
  // "No" leaves nothing in the answers to show, so the button remembers it.
  const [saidNo, setSaidNo] = useState(false)

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-4)' }}>
      <div role="group" aria-label="Goals, up to three" className="grid grid-cols-2" style={{ gap: 'var(--amp-space-3)' }}>
        {GOALS.map((g) => (
          <div key={g.id} className="contents">
            {tile(g)}
          </div>
        ))}
        {/* Weight loss: full width, and it opens when picked. */}
        <div className="col-span-2 flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
          {tile(WEIGHT)}
          {losing && (
            <div className="amp-anim-rise">
              {comfort ? (
                <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
                  <p style={{ fontSize: 'var(--amp-text-body)' }}>Using weight-loss injections or tablets?</p>
                  <Segmented
                    label="Using weight-loss injections or tablets?"
                    options={[
                      { value: 'yes', label: 'Yes' },
                      { value: 'no', label: 'No' },
                    ]}
                    value={meds ? 'yes' : saidNo ? 'no' : null}
                    onChange={(v) => {
                      setSaidNo(v === 'no')
                      setMeds(v === 'yes')
                    }}
                  />
                  <Hint>Such as Wegovy or Mounjaro. It stays private, and you’ll confirm it in the safety check.</Hint>
                </div>
              ) : (
                <Switch
                  label="Using weight-loss injections or tablets?"
                  sub="Such as Wegovy or Mounjaro. It stays private, and you’ll confirm it in the safety check."
                  on={meds}
                  onToggle={() => setMeds(!meds)}
                />
              )}
            </div>
          )}
        </div>
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
