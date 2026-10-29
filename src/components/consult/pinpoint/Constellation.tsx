'use client'

import type { CSSProperties } from 'react'
import { constellation, constellationText, narrowing, narrowingText, pulses, splits, type StarNode } from '@/lib/consult/constellation'
import { springTransition } from '@/lib/consult/motion'
import type { Answers, Probe } from '@/lib/consult/pinpoint/types'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { Glyph } from '../Glyph'

/**
 * Watch Amp think (plan Phase 7.5): the eligible patterns as a constellation
 * round Amp (`constellation.ts` says where each sits).
 *
 *   lg     the round's opening, its ending, and "What I'm thinking": names on
 *          the contenders, and "Narrowing it down: 9 → 4 → 2" under it
 *   strip  in the round, where "Leads · 3" was: the same constellation in the
 *          same 44px, live, and the way into "What I'm thinking"
 *
 * Nodes glide to their new places on the spring; after an answer a pulse runs
 * from the answer (below) into each pattern it moved, sized by how much. The
 * question on screen rings the patterns it's splitting. Under reduced motion
 * it's a ranked list with bars, and the strip is the plain count.
 */

const mono = {
  fontFamily: 'var(--amp-font-label)',
  fontSize: 'var(--amp-text-data)',
  letterSpacing: 'var(--amp-tracking-data)',
} as const

const SHAPE = {
  lg: { box: '-160 -100 320 200', at: (n: StarNode) => place(n, 120, 80, 0), origin: { x: 0, y: 100 }, amp: 15, r: (w: number) => 3 + 8 * w, label: true },
  strip: {
    box: '0 0 96 44',
    at: (n: StarNode) => ({ x: 17 + n.distance * 72, y: n.state === 'no' || n.state === 'out' ? 39 : 22 + Math.sin(n.angle) * 15 }),
    origin: { x: 48, y: 44 },
    amp: 5,
    r: (w: number) => 1.4 + 3 * w,
    label: false,
  },
} as const

/** Round Amp, on an ellipse; ruled out falls a little below its place. */
function place(n: StarNode, rx: number, ry: number, cy: number) {
  const out = n.state === 'no' || n.state === 'out'
  return { x: Math.round(Math.cos(n.angle) * rx * n.distance * 10) / 10, y: Math.round((cy + Math.sin(n.angle) * ry * n.distance + (out ? 14 : 0)) * 10) / 10 }
}

/** A long name in two lines, split at the space nearest its middle. */
function nameLines(name: string): string[] {
  if (name.length <= 10) return [name]
  const spaces = [...name.matchAll(/ /g)].map((m) => m.index!)
  if (!spaces.length) return [name]
  const at = spaces.reduce((best, i) => (Math.abs(i - name.length / 2) < Math.abs(best - name.length / 2) ? i : best))
  return [name.slice(0, at), name.slice(at + 1)]
}

const isOutNode = (n: StarNode) => n.state === 'no' || n.state === 'out'
const isPinnedNode = (n: StarNode) => n.state === 'yes' || n.state === 'partly'
const colour = (n: StarNode) => (isPinnedNode(n) ? 'var(--amp-go)' : isOutNode(n) ? 'var(--amp-ink-3)' : 'var(--amp-accent)')

interface Props {
  answers: Answers
  /** The question on screen, if any: its patterns are ringed. */
  probe?: Probe | null
  size: 'lg' | 'strip'
  /** Put before the constellation's own words, e.g. "Amp's leads so far". */
  label?: string
  /** The strip only: open "What I'm thinking". */
  onOpen?: () => void
  /** Under reduced motion, nothing rather than the ranked list (where the list is already there). */
  quietWhenStill?: boolean
}

export function Constellation({ answers, probe = null, size, label, onOpen, quietWhenStill = false }: Props) {
  const reduced = useReducedMotion()
  const nodes = constellation(answers)
  const ns = narrowing(answers)
  const text = constellationText(nodes, ns)
  const leads = nodes.filter((n) => n.contender).length
  const leadsLabel = `${leads} lead${leads === 1 ? '' : 's'}`

  if (size === 'strip') {
    const name = `What I’m thinking: ${leadsLabel}. ${narrowingText(ns)}`
    const pill: CSSProperties = { ...mono, minHeight: 'var(--amp-target)', borderRadius: 'var(--amp-radius-pill)', border: 'var(--amp-hairline) solid var(--amp-accent-line)', color: 'var(--amp-accent)', whiteSpace: 'nowrap' }
    if (reduced) {
      return (
        <button type="button" onClick={onOpen} aria-label={name} className="amp-press inline-flex shrink-0 items-center uppercase" style={{ ...pill, gap: 'var(--amp-space-1)', padding: '0 var(--amp-space-3)' }}>
          Leads · {leads}
        </button>
      )
    }
    return (
      <button type="button" onClick={onOpen} aria-label={name} data-constellation="strip" className="amp-press relative inline-flex shrink-0 overflow-hidden" style={{ ...pill, width: 'calc(var(--amp-space-10) * 2.4)', padding: 0 }}>
        <Sky nodes={nodes} answers={answers} probe={probe} size="strip" />
      </button>
    )
  }

  if (reduced) return quietWhenStill ? null : <Ranked nodes={nodes} ns={ns} label={label ?? 'Narrowing it down'} />

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--amp-space-2)' }} data-constellation="lg">
      <svg viewBox={SHAPE.lg.box} role="img" aria-label={label ? `${label}. ${text}` : text} style={{ width: '100%', height: 'auto', maxHeight: '13rem', display: 'block', overflow: 'visible' }}>
        <SkyMarks nodes={nodes} answers={answers} probe={probe} size="lg" />
      </svg>
      <p aria-hidden className="uppercase" style={{ ...mono, color: 'var(--amp-ink-2)' }} data-narrowing>
        {narrowingText(ns)}
      </p>
    </div>
  )
}

function Sky({ nodes, answers, probe, size }: { nodes: StarNode[]; answers: Answers; probe: Probe | null; size: 'strip' }) {
  return (
    <svg viewBox={SHAPE[size].box} aria-hidden className="absolute inset-0 h-full w-full">
      <SkyMarks nodes={nodes} answers={answers} probe={probe} size={size} />
    </svg>
  )
}

/** Amp, his patterns, the rings on what's being asked, and the last answer's pulses. */
function SkyMarks({ nodes, answers, probe, size }: { nodes: StarNode[]; answers: Answers; probe: Probe | null; size: 'lg' | 'strip' }) {
  const shape = SHAPE[size]
  const amp = size === 'lg' ? { x: 0, y: 0 } : { x: 8, y: 22 }
  const ringed = new Set(splits(answers, probe))
  const moved = pulses(answers)
  const turn = answers.pinpoint?.steps.length ?? 0
  const labelled = new Set(
    nodes
      .filter((n) => n.contender)
      .sort((x, y) => Number(isPinnedNode(y)) - Number(isPinnedNode(x)) || y.p - x.p)
      .slice(0, 4)
      .map((n) => n.id),
  )
  return (
    <>
      {/* Amp at the middle of it all. */}
      <circle cx={amp.x} cy={amp.y} r={shape.amp} style={{ fill: 'var(--amp-accent-fill)', stroke: 'var(--amp-accent-line)' }} strokeWidth={size === 'lg' ? 1.2 : 0.8} />
      <path d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z" transform={`translate(${amp.x - shape.amp * 0.55} ${amp.y - shape.amp * 0.55}) scale(${(shape.amp * 1.1) / 24})`} style={{ fill: 'var(--amp-accent)' }} />
      {nodes.map((n) => {
        const at = shape.at(n)
        const r = isOutNode(n) ? shape.r(0) * 0.8 : shape.r(n.weight)
        // Names go outward, to the side (above or below near the top and
        // bottom), in two short lines when long, so they fit at comfort size.
        const right = Math.cos(n.angle) >= 0
        const side = Math.abs(Math.cos(n.angle)) > 0.35
        const lines = nameLines(n.name)
        return (
          <g key={n.id} data-star={n.id} data-state={n.state} style={{ transform: `translate(${at.x}px, ${at.y}px)`, transition: springTransition('transform') }}>
            {ringed.has(n.id) && <circle data-splitting r={r + (size === 'lg' ? 5 : 2.4)} fill="none" style={{ stroke: 'var(--amp-sun)' }} strokeWidth={size === 'lg' ? 1.2 : 0.7} strokeDasharray={size === 'lg' ? '3 2' : '1.6 1.2'} className="amp-anim-fade" />}
            <circle
              r={r}
              style={{
                fill: colour(n),
                opacity: isOutNode(n) ? 0.3 : 0.45 + 0.55 * n.weight,
                filter: isOutNode(n) ? 'none' : `drop-shadow(0 0 ${(size === 'lg' ? 2 : 1) + n.weight * (size === 'lg' ? 8 : 3)}px ${isPinnedNode(n) ? 'var(--amp-go-glow)' : 'var(--amp-accent-glow)'})`,
                transition: `${springTransition('r')}, ${springTransition('opacity')}`,
              }}
            />
            {shape.label && labelled.has(n.id) && (
              <text
                x={side ? (right ? r + 5 : -(r + 5)) : 0}
                y={side ? (lines.length > 1 ? -2 : 3) : Math.sin(n.angle) > 0 ? r + 11 : -(r + 5) - (lines.length - 1) * 10}
                textAnchor={side ? (right ? 'start' : 'end') : 'middle'}
                style={{ ...mono, fontSize: 'var(--amp-star-text)', textTransform: 'uppercase', fill: isPinnedNode(n) ? 'var(--amp-go)' : 'var(--amp-ink-2)' }}
              >
                {lines.map((line, i) => (
                  <tspan key={i} x={side ? (right ? r + 5 : -(r + 5)) : 0} dy={i ? '1.15em' : undefined}>
                    {line}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        )
      })}
      {/* From the answer into what it moved: one run per answer. */}
      <g key={turn} aria-hidden>
        {moved.map((m, i) => {
          const n = nodes.find((x) => x.id === m.id)
          if (!n) return null
          const to = shape.at(n)
          return (
            <circle
              key={m.id}
              data-pulse={m.id}
              r={(size === 'lg' ? 1.6 : 0.9) + m.size * (size === 'lg' ? 3.4 : 1.6)}
              className="amp-pulse"
              style={{
                fill: m.towards ? 'var(--amp-accent)' : 'var(--amp-ink-3)',
                animationDelay: `${i * 45}ms`,
                ['--pulse-from' as string]: `translate(${shape.origin.x}px, ${shape.origin.y}px)`,
                ['--pulse-to' as string]: `translate(${to.x}px, ${to.y}px)`,
              }}
            />
          )
        })}
      </g>
    </>
  )
}

/** Under reduced motion: the same story as a ranked list with bars. */
function Ranked({ nodes, ns, label }: { nodes: StarNode[]; ns: number[]; label: string }) {
  const pinned = nodes.filter(isPinnedNode)
  const live = nodes.filter((n) => n.contender && !isPinnedNode(n)).sort((x, y) => y.p - x.p)
  const out = nodes.filter(isOutNode)
  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }} data-constellation="list">
      <p className="uppercase" style={{ ...mono, color: 'var(--amp-ink-2)' }} data-narrowing>
        {narrowingText(ns)}
      </p>
      <ol className="flex flex-col" aria-label={label} style={{ gap: 'var(--amp-space-1)' }}>
        {[...pinned, ...live].map((n) => (
          <li key={n.id} className="flex items-center" style={{ gap: 'var(--amp-space-3)' }}>
            <span className="flex-1" style={{ fontSize: 'var(--amp-text-meta)' }}>
              {n.name}
            </span>
            {isPinnedNode(n) ? (
              <span className="inline-flex items-center" style={{ gap: 'var(--amp-space-1)', color: 'var(--amp-go)', fontSize: 'var(--amp-text-meta)' }}>
                <Glyph name="check" size={14} />
                {n.state === 'yes' ? 'Pinpointed' : 'Partly'}
              </span>
            ) : (
              <span aria-label={n.p >= 0.75 ? 'strong' : n.p >= 0.5 ? 'likely' : 'possible'} role="img" className="relative overflow-hidden" style={{ width: 'calc(var(--amp-space-10) * 2)', height: 'var(--amp-space-2)', borderRadius: 'var(--amp-radius-pill)', background: 'var(--amp-edge)' }}>
                <span aria-hidden className="absolute inset-y-0 left-0" style={{ width: `${Math.round(n.p * 100)}%`, borderRadius: 'var(--amp-radius-pill)', background: 'var(--amp-accent)' }} />
              </span>
            )}
          </li>
        ))}
        {out.map((n) => (
          <li key={n.id} style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-3)', textDecoration: 'line-through' }}>
            <span className="sr-only">Ruled out: </span>
            {n.name}
          </li>
        ))}
      </ol>
    </div>
  )
}
