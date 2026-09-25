'use client'

import { BODY_LABEL } from '@/lib/consult/summary'
import type { BodySpot } from '@/lib/consult/types'
import { haptic, stateTransition } from '@/lib/consult/motion'
import { Chip, Hint, Tile } from '../controls'
import type { SceneProps } from './registry'

/**
 * The body map (build C10).
 *
 * A front outline with tappable spots at the neck, shoulders, lower back, hips
 * and knees. Sore spots glow in the caution tone. Leaving it blank is an
 * answer — "all good" — which the flow records when you move on.
 *
 * Two ways to answer, always both on screen:
 *   - the figure, for pointers. Each spot's hit area is a full target
 *     (`--amp-target`, 48px, 64px in comfort) centred on the joint, and paired
 *     joints share one control so the targets never compete.
 *   - a plain list of the five spots as chips, which is what keyboards and
 *     screen readers use. The figure is hidden from assistive tech, so it is
 *     one list, not two.
 *
 * In comfort mode the figure goes and the list becomes large buttons.
 */

export const SPOTS: BodySpot[] = ['neck', 'shoulders', 'lower-back', 'hips', 'knees']

/** Where each spot sits on the figure, in the SVG's 200 × 320 box. Paired joints list both sides. */
const MARKS: Record<BodySpot, [number, number][]> = {
  neck: [[100, 58]],
  shoulders: [[62, 74], [138, 74]],
  'lower-back': [[100, 138]],
  hips: [[78, 182], [122, 182]],
  knees: [[86, 244], [114, 244]],
}

const VIEW_W = 200
const VIEW_H = 320

export function toggleSpot(body: BodySpot[] | null, spot: BodySpot): BodySpot[] {
  const current = body ?? []
  return current.includes(spot) ? current.filter((s) => s !== spot) : [...current, spot]
}

export function BodyMap({ answers, onAnswer, comfort }: SceneProps) {
  const body = answers.body ?? []

  function toggle(spot: BodySpot) {
    haptic('select')
    onAnswer({ body: toggleSpot(answers.body, spot) })
  }

  const list = comfort ? (
    <div role="group" aria-label="Stiff or sore spots" className="grid grid-cols-1" style={{ gap: 'var(--amp-space-2)' }}>
      {SPOTS.map((s) => (
        <Tile key={s} layout="row" tone="caution" label={BODY_LABEL[s]} selected={body.includes(s)} onSelect={() => toggle(s)} />
      ))}
    </div>
  ) : (
    <div role="group" aria-label="Stiff or sore spots" className="flex flex-wrap justify-center" style={{ gap: 'var(--amp-space-2)' }}>
      {SPOTS.map((s) => (
        <Chip key={s} tone="caution" label={BODY_LABEL[s]} selected={body.includes(s)} onToggle={() => toggle(s)} />
      ))}
    </div>
  )

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--amp-space-5)' }}>
      {!comfort && (
        <div aria-hidden className="relative" style={{ width: 'min(100%, calc(var(--amp-target) * 5))', aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
          <Figure />
          {SPOTS.flatMap((spot) =>
            MARKS[spot].map(([x, y], i) => {
              const on = body.includes(spot)
              return (
                <button
                  key={`${spot}-${i}`}
                  type="button"
                  tabIndex={-1}
                  data-spot={spot}
                  onClick={() => toggle(spot)}
                  className="absolute flex items-center justify-center"
                  style={{
                    left: `${(x / VIEW_W) * 100}%`,
                    top: `${(y / VIEW_H) * 100}%`,
                    width: 'var(--amp-target)',
                    height: 'var(--amp-target)',
                    transform: 'translate(-50%, -50%)',
                    borderRadius: 'var(--amp-radius-pill)',
                  }}
                >
                  <span
                    style={{
                      width: '70%',
                      height: '70%',
                      borderRadius: 'var(--amp-radius-pill)',
                      border: `calc(var(--amp-hairline) * 2) ${on ? 'solid var(--amp-caution)' : 'dashed var(--amp-edge-strong)'}`,
                      background: on ? 'var(--amp-caution-fill)' : 'transparent',
                      boxShadow: on ? '0 0 22px -2px var(--amp-caution-glow)' : 'none',
                      transition: stateTransition('border-color', 'background-color', 'box-shadow'),
                    }}
                  />
                </button>
              )
            }),
          )}
        </div>
      )}
      {list}
      <div aria-live="polite">{body.length === 0 && <Hint tone="go">Nothing tapped: all good</Hint>}</div>
    </div>
  )
}

/** The front outline. Drawn, not an image, so it takes the tokens. */
function Figure() {
  const stroke = { fill: 'var(--amp-volt-fill)', stroke: 'var(--amp-volt-line)', strokeWidth: 2 }
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" height="100%" className="absolute inset-0">
      <circle cx={100} cy={26} r={18} {...stroke} />
      <rect x={91} y={44} width={18} height={16} rx={4} {...stroke} />
      <rect x={68} y={60} width={64} height={112} rx={20} {...stroke} />
      <rect x={46} y={66} width={16} height={100} rx={8} {...stroke} />
      <rect x={138} y={66} width={16} height={100} rx={8} {...stroke} />
      <rect x={74} y={168} width={22} height={140} rx={10} {...stroke} />
      <rect x={104} y={168} width={22} height={140} rx={10} {...stroke} />
    </svg>
  )
}
