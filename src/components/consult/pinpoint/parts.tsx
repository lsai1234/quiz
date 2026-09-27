'use client'

import { useEffect, useRef } from 'react'
import type { Lead } from '@/lib/consult/pinpoint/leads'
import { hunchEvidence, ruledOutBecause } from '@/lib/consult/pinpoint/playback'
import { PROFILE_AREAS, PROFILE_LABEL, chargeProfile, type ProfileArea } from '@/lib/consult/profile'
import type { ConsultAnswers } from '@/lib/consult/types'
import { stateTransition } from '@/lib/consult/motion'
import { Glyph } from '../Glyph'
import { NextButton, QuietLink } from '../controls'

const mono = {
  fontFamily: 'var(--amp-font-mono)',
  fontSize: 'var(--amp-text-data)',
  letterSpacing: 'var(--amp-tracking-data)',
} as const

/* ── The pattern map ──────────────────────────────────────────────────── */

const W = 240
const H = 176
const CX = W / 2
const CY = 90
const R = 56

function vertex(area: ProfileArea, r = R): [number, number] {
  const i = PROFILE_AREAS.indexOf(area)
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / PROFILE_AREAS.length
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

/**
 * The charge profile's six areas, with a line drawn between the two each lead
 * connects: dashed while Amp is still checking, solid once you've confirmed
 * it. The same hexagon the charge-up draws, so the ending is familiar.
 */
export function PatternMap({ answers, leads, title }: { answers: ConsultAnswers; leads: Lead[]; title: string }) {
  const profile = chargeProfile(answers)
  const shape = PROFILE_AREAS.map((a) => vertex(a, (R * Math.max(8, profile[a])) / 100).join(',')).join(' ')
  const lit = new Set(leads.flatMap((l) => l.pattern.links))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ width: '100%', height: 'auto', maxHeight: '11rem', display: 'block' }}>
      <polygon points={PROFILE_AREAS.map((a) => vertex(a).join(',')).join(' ')} fill="none" style={{ stroke: 'var(--amp-edge-strong)' }} />
      <polygon points={shape} style={{ fill: 'var(--amp-accent-fill)', stroke: 'var(--amp-accent-line)' }} strokeWidth={1.2} />
      {leads.map((l) => {
        const [a, b] = l.pattern.links
        const [x1, y1] = vertex(a)
        const [x2, y2] = vertex(b)
        const confirmed = l.state === 'yes' || l.state === 'partly'
        return (
          <path
            key={l.pattern.id}
            d={`M${x1} ${y1} Q ${CX} ${CY} ${x2} ${y2}`}
            fill="none"
            strokeWidth={confirmed ? 2.6 : 2}
            strokeDasharray={confirmed ? undefined : '4 4'}
            strokeLinecap="round"
            style={{ stroke: confirmed ? 'var(--amp-go)' : 'var(--amp-accent)', opacity: confirmed ? 1 : 0.35 + 0.65 * l.p }}
          />
        )
      })}
      {PROFILE_AREAS.map((a) => {
        const [x, y] = vertex(a)
        const [lx, ly] = vertex(a, R + 16)
        const on = lit.has(a)
        return (
          <g key={a}>
            <circle cx={x} cy={y} r={on ? 4.5 : 3} style={{ fill: on ? 'var(--amp-accent)' : 'var(--amp-ink-3)' }} />
            <text
              x={lx}
              y={ly + 3}
              textAnchor={lx > CX + 4 ? 'start' : lx < CX - 4 ? 'end' : 'middle'}
              style={{ ...mono, fontSize: '8.5px', fill: on ? 'var(--amp-accent)' : 'var(--amp-ink-3)', textTransform: 'uppercase' }}
            >
              {PROFILE_LABEL[a]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Four bars for how strong a lead is: words and bars, never percentages. */
export function LeadBars({ p }: { p: number }) {
  const n = p >= 0.75 ? 4 : p >= 0.5 ? 3 : p >= 0.3 ? 2 : 1
  return (
    <span className="inline-flex" role="img" aria-label={p >= 0.75 ? 'strong' : p >= 0.5 ? 'likely' : 'possible'} style={{ gap: 'calc(var(--amp-hairline) * 2)' }}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          aria-hidden
          style={{ width: 'var(--amp-space-3)', height: 'calc(var(--amp-hairline) * 6)', borderRadius: 'var(--amp-hairline)', background: i <= n ? 'var(--amp-accent)' : 'var(--amp-edge-strong)' }}
        />
      ))}
    </span>
  )
}

/* ── The hunch ────────────────────────────────────────────────────────── */

export function HunchCard({ lead, onVerdict, comfort }: { lead: Lead; onVerdict: (v: 'yes' | 'partly' | 'no') => void; comfort: boolean }) {
  const evidence = hunchEvidence(lead)
  const [a, b] = lead.pattern.links
  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-4)' }}>
      <ul className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }} aria-label="What I’m going on">
        {evidence.map((e) => (
          <li key={e} className="flex items-start" style={{ gap: 'var(--amp-space-2)', fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
            <span aria-hidden style={{ flex: 'none', width: 'var(--amp-space-2)', height: 'var(--amp-space-2)', marginTop: 'var(--amp-space-2)', borderRadius: 'var(--amp-radius-pill)', background: 'var(--amp-accent)' }} />
            {e}
          </li>
        ))}
      </ul>
      <div aria-hidden className="flex items-center">
        <Chip>{PROFILE_LABEL[a]}</Chip>
        <span style={{ flex: 1, height: 'calc(var(--amp-hairline) * 2)', background: 'var(--amp-accent)', boxShadow: 'var(--amp-glow-soft)' }} />
        <Chip>{PROFILE_LABEL[b]}</Chip>
      </div>
      <p style={{ fontWeight: 'var(--amp-weight-bold)' }}>Is that you?</p>
      <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
        <NextButton onClick={() => onVerdict('yes')}>That’s me</NextButton>
        <div className={comfort ? 'flex flex-col' : 'grid grid-cols-2'} style={{ gap: 'var(--amp-space-2)' }}>
          <Plain onClick={() => onVerdict('partly')}>Partly</Plain>
          <Plain onClick={() => onVerdict('no')}>Not me</Plain>
        </div>
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="uppercase"
      style={{ ...mono, padding: 'var(--amp-space-1) var(--amp-space-2)', borderRadius: 'var(--amp-radius-pill)', border: 'var(--amp-hairline) solid var(--amp-accent-line)', background: 'var(--amp-accent-fill)', color: 'var(--amp-ink)' }}
    >
      {children}
    </span>
  )
}

export function Plain({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="amp-press flex items-center justify-center"
      style={{
        minHeight: 'var(--amp-target)',
        borderRadius: 'var(--amp-radius-tile)',
        border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
        background: 'var(--amp-glass)',
        color: 'var(--amp-ink)',
        fontWeight: 'var(--amp-weight-bold)',
        transition: stateTransition('background-color'),
      }}
    >
      {children}
    </button>
  )
}

/* ── What I'm thinking ────────────────────────────────────────────────── */

export function LeadsSheet({ leads, onClose, onBuild }: { leads: Lead[]; onClose: () => void; onBuild?: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button')?.focus()
  }, [])
  const pinned = leads.filter((l) => l.state === 'yes' || l.state === 'partly')
  const checking = leads.filter((l) => (l.state === 'live' || l.state === 'checking') && l.p >= 0.25).sort((x, y) => y.p - x.p)
  const out = leads.filter((l) => (l.state === 'no' || l.state === 'out') && l.tested > 0)
  const heading = (t: string) => (
    <p className="uppercase" style={{ ...mono, color: 'var(--amp-ink-3)', marginTop: 'var(--amp-space-2)' }}>
      {t}
    </p>
  )
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" style={{ background: 'var(--amp-scrim)' }} onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label="What I’m thinking"
        className="amp-anim-rise flex w-full flex-col"
        style={{
          maxWidth: 'var(--amp-column)',
          maxHeight: '80vh',
          overflowY: 'auto',
          gap: 'var(--amp-space-2)',
          padding: 'var(--amp-space-5) var(--amp-gutter) max(var(--amp-space-5), env(safe-area-inset-bottom))',
          borderRadius: 'var(--amp-radius-panel) var(--amp-radius-panel) 0 0',
          border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
          background: 'var(--amp-glass-raised)',
          backdropFilter: 'blur(var(--amp-glass-blur)) saturate(var(--amp-glass-saturate))',
        }}
      >
        <div className="flex items-center justify-between">
          <p className="uppercase" style={{ ...mono, color: 'var(--amp-accent)' }}>
            What I’m thinking
          </p>
          <QuietLink icon="close" aria-label="Close" onClick={onClose}>
            {''}
          </QuietLink>
        </div>
        {pinned.length > 0 && heading('Pinpointed')}
        {pinned.map((l) => (
          <p key={l.pattern.id} className="flex items-center justify-between" style={{ gap: 'var(--amp-space-3)' }}>
            <span>{l.pattern.name}</span>
            <span className="inline-flex items-center" style={{ gap: 'var(--amp-space-1)', color: 'var(--amp-go)', fontSize: 'var(--amp-text-meta)' }}>
              <Glyph name="check" size={14} />
              {l.state === 'yes' ? 'You said so' : 'Partly'}
            </span>
          </p>
        ))}
        {checking.length > 0 && heading('Still checking')}
        {checking.map((l) => (
          <p key={l.pattern.id} className="flex items-center justify-between" style={{ gap: 'var(--amp-space-3)' }}>
            <span>{l.pattern.name}</span>
            <LeadBars p={l.p} />
          </p>
        ))}
        {out.length > 0 && heading('Ruled out')}
        {out.map((l) => (
          <div key={l.pattern.id}>
            <p style={{ textDecoration: 'line-through', color: 'var(--amp-ink-3)' }}>{l.pattern.name}</p>
            <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>{ruledOutBecause(l)}</p>
          </div>
        ))}
        {!pinned.length && !checking.length && !out.length && <p style={{ color: 'var(--amp-ink-2)' }}>Nothing yet. A couple of questions and I’ll have leads.</p>}
        {onBuild && (
          <div style={{ marginTop: 'var(--amp-space-3)' }}>
            <Plain onClick={onBuild}>Build my stack now</Plain>
          </div>
        )}
      </div>
    </div>
  )
}
