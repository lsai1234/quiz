'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { HubLogin } from '@/components/hub/HubLogin'
import { HubShell } from '@/components/hub/HubShell'
import { HubSkeleton } from '@/components/hub/HubSkeleton'
import { Card, Note, buttonSurface } from '@/components/system'
import { useHubStore } from '@/lib/hub-store'
import { TRAINING_COPY as C } from '@/lib/training/copy'
import { MUSCLE_LABEL, PROGRAMME_COPY as P } from '@/lib/training/programme-copy'
import { progressView, type LiftLine } from '@/lib/training/progress-view'
import type { TrainingState } from '@/lib/training/state'
import type { Muscle } from '@/lib/training/types'
import { longDay } from '@/lib/training/view'
import { body, display, eyebrow, meta, stack, strong } from './styles'

/**
 * /myhub/training/progress (Phase 3): this month against last, personal
 * bests with their dates, a line per lift over time, and the muscles this
 * week's ticked sets worked. From what they logged and ticked; no streaks.
 */
export function ProgressPage() {
  const session = useHubStore((s) => s.session)
  const hydrated = useHubStore((s) => s.hydrated)
  const providers = useHubStore((s) => s.providers)
  const canResetPassword = useHubStore((s) => s.canResetPassword)
  const hydrate = useHubStore((s) => s.hydrate)
  const authenticate = useHubStore((s) => s.authenticate)
  const logout = useHubStore((s) => s.logout)
  const [state, setState] = useState<TrainingState | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    void hydrate()
  }, [hydrate])
  useEffect(() => {
    if (!session) return
    fetch('/api/hub/training')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((s: TrainingState) => setState(s))
      .catch(() => setFailed(true))
  }, [session])

  const view = useMemo(() => (state?.plan ? progressView(state.plan, new Date()) : null), [state?.plan])

  if (!hydrated) {
    return (
      <HubShell>
        <HubSkeleton />
      </HubShell>
    )
  }
  if (!session) return <HubLogin onAuthenticate={authenticate} providers={providers} canResetPassword={canResetPassword} />

  const back = buttonSurface('ghost', 'sm')
  return (
    <HubShell onSignOut={logout} nav="training">
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link href="/myhub/training" className={back.className} style={back.style} data-back-training>
          ← {P.progressBack}
        </Link>
      </div>
      {failed ? (
        <Note tone="critical">{C.error}</Note>
      ) : !state ? (
        <HubSkeleton />
      ) : !view || !state.coaching?.programmes ? (
        <Note tone="neutral">{C.offBody}</Note>
      ) : (
        <div style={stack('var(--stack)')} data-progress>
          <header>
            <p style={eyebrow}>{C.eyebrow}</p>
            <h1 style={{ ...display, marginTop: 'var(--space-2)' }}>{P.progressTitle}</h1>
          </header>

          <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)' }} data-progress-months>
            <MonthTile label={P.thisMonth} sessions={view.thisMonth.sessions} bests={view.thisMonth.bests} />
            <MonthTile label={P.lastMonth} sessions={view.lastMonth.sessions} bests={view.lastMonth.bests} quiet />
          </div>

          <Card padding="normal">
            <section style={stack('var(--space-3)')} aria-label={P.bestsTitle} data-progress-bests>
              <p style={eyebrow}>{P.bestsTitle}</p>
              {view.bests.length === 0 ? (
                <p style={meta}>{P.bestsEmpty}</p>
              ) : (
                <ul style={stack('var(--space-2)')}>
                  {view.bests.slice(0, 10).map((b) => (
                    <li key={`${b.exerciseId}-${b.entry.on}`} className="flex items-baseline justify-between" style={{ gap: 'var(--space-3)' }}>
                      <span style={{ ...body, color: 'var(--ink-1)' }}>{b.name}</span>
                      <span className="flex items-baseline" style={{ gap: 'var(--space-2)' }}>
                        <span style={{ ...strong, fontVariantNumeric: 'tabular-nums' }}>{setLine(b.entry)}</span>
                        <span style={meta}>{longDay(`${b.entry.on}T12:00:00Z`)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Card>

          <Card padding="normal">
            <section style={stack('var(--space-4)')} aria-label={P.liftsTitle} data-progress-lifts>
              <p style={eyebrow}>{P.liftsTitle}</p>
              {view.lifts.filter((l) => l.points.length > 1).length === 0 ? (
                <p style={meta}>{P.liftsEmpty}</p>
              ) : (
                view.lifts
                  .filter((l) => l.points.length > 1)
                  .slice(0, 6)
                  .map((l) => <LiftChart key={l.exerciseId} line={l} />)
              )}
            </section>
          </Card>

          <Card padding="normal">
            <section style={stack('var(--space-3)')} aria-label={P.workedTitle} data-progress-worked>
              <p style={eyebrow}>{P.workedTitle}</p>
              {Object.keys(view.worked).length === 0 ? <p style={meta}>{P.workedEmpty}</p> : <BodyMap worked={view.worked} />}
            </section>
          </Card>
        </div>
      )}
    </HubShell>
  )
}

const kg = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} kg`
function setLine(e: { weightKg: number | null; reps: number | null }): string {
  if (e.weightKg != null) return `${kg(e.weightKg)}${e.reps != null ? ` × ${e.reps}` : ''}`
  return `${e.reps ?? 0} reps`
}

function MonthTile({ label, sessions, bests, quiet = false }: { label: string; sessions: number; bests: number; quiet?: boolean }) {
  return (
    <Card padding="normal" tone={quiet ? undefined : 'accent'}>
      <p style={eyebrow}>{label}</p>
      <p style={{ ...display, fontSize: 'var(--text-display)', fontVariantNumeric: 'tabular-nums', marginTop: 'var(--space-1)', color: quiet ? 'var(--ink-2)' : 'var(--ink-1)' }}>{sessions}</p>
      <p style={meta}>{P.sessions(sessions).replace(/^\d+ /, '')}</p>
      <p style={{ ...meta, marginTop: 'var(--space-1)' }}>{P.bestsCount(bests)}</p>
    </Card>
  )
}

/**
 * One lift over time: a 2px line in the accent, 8px markers, the best
 * marked. Hover or tap reads out the nearest point; the list under it says
 * every value for a screen reader.
 */
function LiftChart({ line }: { line: LiftLine }) {
  const [at, setAt] = useState<number | null>(null)
  const W = 320
  const H = 96
  const PAD = 8
  const values = line.points.map((p) => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, line.points.length - 1)
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2)
  const unit = (v: number) => (line.unit === 'kg' ? kg(v) : `${v} ${line.unit}`)
  const shown = at ?? line.points.length - 1
  const p = line.points[shown]
  return (
    <figure style={stack('var(--space-1)')} data-lift-chart={line.exerciseId}>
      <figcaption className="flex items-baseline justify-between" style={{ gap: 'var(--space-2)' }}>
        <span style={{ ...strong, fontSize: 'var(--text-body-sm)' }}>{line.name}</span>
        <span style={{ ...meta, fontVariantNumeric: 'tabular-nums' }} aria-hidden>
          {`${unit(p.value)} · ${longDay(`${p.on}T12:00:00Z`)}`}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        aria-hidden
        style={{ display: 'block', touchAction: 'pan-y' }}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const fx = ((e.clientX - r.left) / r.width) * W
          let best = 0
          for (let i = 1; i < line.points.length; i++) if (Math.abs(x(i) - fx) < Math.abs(x(best) - fx)) best = i
          setAt(best)
        }}
        onPointerLeave={() => setAt(null)}
      >
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="var(--edge)" strokeWidth={1} />
        {at !== null && <line x1={x(at)} x2={x(at)} y1={PAD} y2={H - PAD} stroke="var(--edge-strong)" strokeWidth={1} />}
        <polyline points={line.points.map((q, i) => `${x(i)},${y(q.value)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {line.points.map((q, i) => (
          <circle key={q.on} cx={x(i)} cy={y(q.value)} r={i === shown ? 5 : 4} fill={i === shown ? 'var(--accent)' : 'var(--surface-1)'} stroke="var(--accent)" strokeWidth={2} />
        ))}
      </svg>
      <p style={meta} aria-hidden>{`${unit(line.points[0].value)} → ${unit(line.points[line.points.length - 1].value)}`}</p>
      <ul className="sr-only">
        {line.points.map((q) => (
          <li key={q.on}>{`${longDay(`${q.on}T12:00:00Z`)}: ${unit(q.value)}`}</li>
        ))}
      </ul>
    </figure>
  )
}

/** Where the muscles sit on a simple front and back figure, as boxes in a 100 × 200 frame. */
const FRONT: { m: Muscle; r: [number, number, number, number] }[] = [
  { m: 'shoulders', r: [22, 34, 14, 12] },
  { m: 'shoulders', r: [64, 34, 14, 12] },
  { m: 'chest', r: [36, 36, 28, 18] },
  { m: 'biceps', r: [18, 48, 10, 22] },
  { m: 'biceps', r: [72, 48, 10, 22] },
  { m: 'forearms', r: [14, 72, 10, 22] },
  { m: 'forearms', r: [76, 72, 10, 22] },
  { m: 'core', r: [38, 56, 24, 30] },
  { m: 'hips', r: [34, 88, 32, 12] },
  { m: 'quads', r: [34, 102, 14, 40] },
  { m: 'quads', r: [52, 102, 14, 40] },
  { m: 'calves', r: [35, 148, 12, 34] },
  { m: 'calves', r: [53, 148, 12, 34] },
]
const BACK: { m: Muscle; r: [number, number, number, number] }[] = [
  { m: 'shoulders', r: [22, 34, 14, 12] },
  { m: 'shoulders', r: [64, 34, 14, 12] },
  { m: 'back', r: [36, 34, 28, 40] },
  { m: 'triceps', r: [18, 48, 10, 22] },
  { m: 'triceps', r: [72, 48, 10, 22] },
  { m: 'forearms', r: [14, 72, 10, 22] },
  { m: 'forearms', r: [76, 72, 10, 22] },
  { m: 'glutes', r: [34, 78, 32, 20] },
  { m: 'hamstrings', r: [34, 102, 14, 40] },
  { m: 'hamstrings', r: [52, 102, 14, 40] },
  { m: 'calves', r: [35, 148, 12, 34] },
  { m: 'calves', r: [53, 148, 12, 34] },
]

/**
 * The muscles this week's ticked sets worked, on a front and a back figure:
 * one hue, deeper for more sets (sequential), with the list beside it in
 * words and numbers. Whole-body work lifts every area a little.
 */
function BodyMap({ worked }: { worked: Partial<Record<Muscle, number>> }) {
  const extra = worked['full-body'] ?? 0
  const sets = (m: Muscle) => (worked[m] ?? 0) + extra / 2
  const max = Math.max(1, ...Object.values(worked).map((n) => n ?? 0))
  const fill = (m: Muscle) => {
    const n = sets(m)
    return n <= 0 ? 0 : 0.25 + 0.75 * Math.min(1, n / max)
  }
  const figure = (parts: typeof FRONT, label: string) => (
    <figure style={stack('var(--space-1)')}>
      <svg viewBox="0 0 100 190" width="100%" style={{ maxWidth: 'calc(var(--space-8) * 2.5)', display: 'block', margin: '0 auto' }} aria-hidden>
        <circle cx={50} cy={16} r={11} fill="var(--surface-3)" />
        {parts.map((p, i) => (
          <g key={`${p.m}-${i}`}>
            <rect x={p.r[0]} y={p.r[1]} width={p.r[2]} height={p.r[3]} rx={4} fill="var(--surface-3)" />
            {fill(p.m) > 0 && <rect x={p.r[0]} y={p.r[1]} width={p.r[2]} height={p.r[3]} rx={4} fill="var(--accent)" fillOpacity={fill(p.m)} />}
          </g>
        ))}
      </svg>
      <figcaption style={{ ...meta, textAlign: 'center' }}>{label}</figcaption>
    </figure>
  )
  const list = (Object.entries(worked) as [Muscle, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }} data-body-map>
      {figure(FRONT, P.front)}
      {figure(BACK, P.back)}
      <ul className="col-span-2 grid grid-cols-2" style={{ gap: 'var(--space-1) var(--space-3)' }}>
        {list.map(([m, n]) => (
          <li key={m} className="flex items-baseline justify-between" style={{ ...body, gap: 'var(--space-2)' }}>
            <span>{MUSCLE_LABEL[m]}</span>
            <span style={{ ...meta, fontVariantNumeric: 'tabular-nums' }}>{P.workedSets(n)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
