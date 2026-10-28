'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { WeightBand } from '@/lib/types'
import { PORTION_LABEL, PORTION_SIZES, type PortionSize } from '@/lib/quiz-v2/protein'
import {
  DAY_OPTIONS,
  MEALS,
  MEAL_OPTIONS,
  MEAL_PROMPT,
  PROTEIN_BASIS_LINE,
  PROTEIN_COPY,
  mealsDone,
  measuredProtein,
  proteinBasis,
  proteinIntake,
  proteinVerdictLine,
  type Meal,
  type ProteinAnswer,
} from '@/lib/consult/protein'
import { Chip, QuietLink, Segmented, Tile, radioArrows } from '../controls'
import type { SceneProps } from './registry'

/**
 * The protein check (Phase 5 proposal 2), as v2 designed it
 * (`docs/QUIZ_V2_PROTEIN.md` Part 2):
 *
 *   - The days are the screen: four ordinary choices and "I honestly have no
 *     idea", one tap. Counting is a quiet link that changes the screen in place.
 *   - The counted day goes one meal at a time; a meal already answered is a
 *     chip, and tapping it asks that meal again.
 *   - The target is never shown before the estimate (it would anchor it). The
 *     verdict has a slot reserved from first paint, so nothing jumps when it
 *     arrives under a thumb on its way to Next.
 *   - Weight is a row of bands, optional. Without it there's no number.
 */

const WEIGHTS: [WeightBand, string][] = [
  ['under-60', 'Under 60kg'],
  ['60-75', '60–75kg'],
  ['75-90', '75–90kg'],
  ['90-105', '90–105kg'],
  ['105-plus', '105kg+'],
]

const MEAL_NAME: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'In between' }

const meta = { fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)', lineHeight: 'var(--amp-leading-body)' } as const

export function ProteinScene({ answers, onAnswer, comfort }: SceneProps) {
  const p = answers.protein
  const [counting, setCounting] = useState(p?.door === 'count')
  const write = (patch: Partial<ProteinAnswer>) =>
    onAnswer({ protein: { weight: p?.weight ?? null, door: p?.door ?? 'day', picks: p?.picks ?? [], portions: p?.portions ?? 'average', ...patch } })

  const done = mealsDone(p)
  const meal = counting ? MEALS.find((m) => !done.includes(m)) ?? null : null
  const measure = measuredProtein(answers)
  const intake = proteinIntake(p)
  const verdict = measure ? proteinVerdictLine(measure) : null
  // The number sits under the choices, often below the fold on a phone: bring
  // it into view when it first has something to say, so the tap that made it
  // shows its answer. The slot's height is reserved, so nothing else moves.
  const slot = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const said = intake !== null
  useEffect(() => {
    if (said) slot.current?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
  }, [said, reduced])

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-4)' }}>
      <p style={meta}>{PROTEIN_BASIS_LINE[proteinBasis(answers)]}</p>

      <div role="group" aria-label={PROTEIN_COPY.weightAsk} className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
        <p style={{ fontWeight: 'var(--amp-weight-bold)', fontSize: 'var(--amp-text-meta)' }}>{PROTEIN_COPY.weightAsk}</p>
        <div className="flex flex-wrap" style={{ gap: 'var(--amp-space-2)' }}>
          {WEIGHTS.map(([band, label]) => (
            <Chip key={band} label={label} selected={p?.weight === band} onToggle={() => write({ weight: p?.weight === band ? null : band })} />
          ))}
        </div>
        <p style={meta}>{PROTEIN_COPY.weightWhy}</p>
      </div>

      {!counting ? (
        <>
          <div role="radiogroup" aria-label="A normal day of eating" className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }} onKeyDown={(e) => radioArrows(e)}>
            {DAY_OPTIONS.map((o) => (
              <Tile key={o.id} kind="radio" layout="row" label={o.label} sub={comfort ? undefined : o.sub} selected={p?.door === 'day' && p.picks[0] === o.id} onSelect={() => write({ door: 'day', picks: [o.id] })} />
            ))}
            <Tile kind="radio" layout="row" label={PROTEIN_COPY.noIdea} selected={p?.door === 'ask'} onSelect={() => write({ door: 'ask', picks: [] })} />
          </div>
          <div>
            <QuietLink
              onClick={() => {
                setCounting(true)
                write({ door: 'count', picks: [] })
              }}
            >
              {PROTEIN_COPY.countLink}
            </QuietLink>
          </div>
        </>
      ) : (
        <>
          {done.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: 'var(--amp-space-2)' }} aria-label="Meals so far">
              {done.map((m) => {
                const pick = MEAL_OPTIONS.find((o) => o.meal === m && p!.picks.includes(o.id))!
                return (
                  <Chip key={m} label={`${MEAL_NAME[m]}: ${pick.label}`} selected onToggle={() => write({ picks: p!.picks.filter((id) => id !== pick.id) })} />
                )
              })}
            </div>
          )}
          {meal && (
            <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
              <p style={{ fontWeight: 'var(--amp-weight-bold)' }}>{MEAL_PROMPT[meal]}</p>
              <div role="radiogroup" aria-label={MEAL_NAME[meal]} className="grid grid-cols-2" style={{ gap: 'var(--amp-space-2)' }} onKeyDown={(e) => radioArrows(e, false)}>
                {MEAL_OPTIONS.filter((o) => o.meal === meal).map((o) => (
                  <Tile key={o.id} kind="radio" layout={comfort ? 'stack' : 'compact'} label={o.label} selected={false} onSelect={() => write({ door: 'count', picks: [...(p?.picks ?? []), o.id] })} />
                ))}
              </div>
            </div>
          )}
          {!meal && (
            <Segmented<PortionSize>
              label={PROTEIN_COPY.portions}
              options={PORTION_SIZES.map((s) => ({ value: s, label: PORTION_LABEL[s] }))}
              value={p?.portions ?? 'average'}
              onChange={(portions) => write({ portions })}
            />
          )}
          <div>
            <QuietLink
              onClick={() => {
                setCounting(false)
                write({ door: 'day', picks: [] })
              }}
            >
              {PROTEIN_COPY.dayLink}
            </QuietLink>
          </div>
        </>
      )}

      {/* Reserved from first paint: the verdict arrives without moving anything. */}
      <div ref={slot} aria-live="polite" data-protein-verdict style={{ minHeight: 'calc(var(--amp-space-10) + var(--amp-space-4))' }}>
        {verdict ? (
          <div style={{ padding: 'var(--amp-space-3) var(--amp-space-4)', borderRadius: 'var(--amp-radius-tile)', border: 'var(--amp-hairline) solid var(--amp-accent-line)', background: 'var(--amp-accent-fill)' }}>
            <p style={{ fontWeight: 'var(--amp-weight-bold)' }}>{verdict.headline}</p>
            <p style={{ ...meta, marginTop: 'var(--amp-space-1)' }}>{verdict.detail}</p>
          </div>
        ) : intake !== null ? (
          <p style={meta}>
            About {intake}g a day. {PROTEIN_COPY.noWeight}
          </p>
        ) : null}
      </div>
    </div>
  )
}
