'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { bucketAt, clockWords } from '@/lib/consult/pinpoint/define'
import type { Probe } from '@/lib/consult/pinpoint/types'
import { haptic, springTransition, stateTransition } from '@/lib/consult/motion'
import { NextButton, QuietLink, radioArrows } from '../controls'

/**
 * The five ways Pinpoint asks (plan v5 §5.1). Each fits one phone screen and
 * hands back an answer: an option key per item, plus the minutes on a day line.
 *
 * `pick` is called on a tap. In the standard size that's the answer, and the
 * next question arrives; in comfort mode nothing moves on by itself, so the
 * tap only selects, and the scene's own Next commits it.
 */

export type ProbeAnswer = { answer: Record<string, string>; minutes?: number }

export interface FormatProps {
  probe: Probe
  /** The scenario text, resolved for this person. */
  text: string
  comfort: boolean
  /** What's picked now: a revisited follow-up's answer, or comfort mode's selection. */
  selected?: ProbeAnswer
  pick: (a: ProbeAnswer) => void
}

const eyebrow = {
  fontFamily: 'var(--amp-font-mono)',
  fontSize: 'var(--amp-text-data)',
  letterSpacing: 'var(--amp-tracking-data)',
  color: 'var(--amp-ink-3)',
} as const

/** The glass card a scenario sits on. */
function Card({ scene, children, lean = 0, style }: { scene?: string; children: ReactNode; lean?: number; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        padding: 'var(--amp-space-4)',
        borderRadius: 'var(--amp-radius-panel)',
        border: `var(--amp-hairline) solid ${lean > 0.15 ? 'var(--amp-go-line)' : lean < -0.15 ? 'var(--amp-edge)' : 'var(--amp-edge-strong)'}`,
        background: lean > 0.15 ? 'var(--amp-go-fill)' : 'var(--amp-glass-raised)',
        boxShadow: 'inset 0 var(--amp-hairline) 0 var(--amp-edge-top)',
        transition: stateTransition('background-color', 'border-color'),
        ...style,
      }}
    >
      {scene && (
        <p className="uppercase" style={{ ...eyebrow, marginBottom: 'var(--amp-space-2)' }}>
          {scene}
        </p>
      )}
      {children}
    </div>
  )
}

function Answer({ label, on, primary, big, onClick, onKeyDown, tabIndex }: { label: string; on: boolean; primary?: boolean; big?: boolean; onClick: () => void; onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void; tabIndex?: number }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={tabIndex}
      onClick={() => {
        haptic('select')
        onClick()
      }}
      onKeyDown={onKeyDown}
      className="amp-press flex w-full items-center justify-center text-center"
      style={{
        minHeight: big ? 'calc(var(--amp-target) * 1.15)' : 'var(--amp-target)',
        padding: '0 var(--amp-space-2)',
        borderRadius: 'var(--amp-radius-tile)',
        border: `var(--amp-hairline) solid ${on ? 'var(--amp-accent-line)' : primary ? 'transparent' : 'var(--amp-edge-strong)'}`,
        background: on ? 'var(--amp-accent-fill)' : primary ? 'var(--amp-accent)' : 'var(--amp-glass)',
        color: on ? 'var(--amp-ink)' : primary ? 'var(--amp-ink-on-accent)' : 'var(--amp-ink)',
        fontWeight: 'var(--amp-weight-bold)',
        fontSize: big ? 'var(--amp-text-body)' : 'var(--amp-text-meta)',
        whiteSpace: 'nowrap',
        transition: stateTransition('background-color', 'border-color', 'color'),
      }}
    >
      {label}
    </button>
  )
}

/* ── Scenario: "Sound like you?", a card you can swipe ────────────────── */

/** How far across, as a share of the card, a swipe has to go to count. */
export const SWIPE_AT = 0.3

export function ScenarioFormat({ probe, text, comfort, selected, pick }: FormatProps) {
  const item = probe.items[0]
  const current = selected?.answer[item.key]
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; id: number } | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const width = () => card.current?.getBoundingClientRect().width || 1
  const choose = (key: string) => pick({ answer: { [item.key]: key } })

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (comfort || (e.pointerType === 'mouse' && e.button !== 0)) return
    start.current = { x: e.clientX, id: e.pointerId }
    setDragging(true)
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // Capture is a nicety.
    }
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current || e.pointerId !== start.current.id || !Number.isFinite(e.clientX)) return
    setDx(e.clientX - start.current.x)
  }
  function up() {
    if (!start.current) return
    const share = dx / width()
    start.current = null
    setDragging(false)
    setDx(0)
    if (share >= SWIPE_AT) choose('me')
    else if (share <= -SWIPE_AT) choose('not')
  }
  const lean = Math.max(-1, Math.min(1, dx / (width() * SWIPE_AT)))

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-3)' }}>
      <div
        ref={card}
        data-swipe-card
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{
          touchAction: comfort ? undefined : 'pan-y',
          cursor: comfort ? undefined : dragging ? 'grabbing' : 'grab',
          transform: `translateX(${dx}px) rotate(${lean * 4}deg)`,
          transition: dragging ? 'none' : springTransition('transform'),
          userSelect: 'none',
        }}
      >
        <Card scene={probe.scene} lean={lean}>
          <p style={{ fontSize: comfort ? 'var(--amp-text-lead)' : 'var(--amp-text-body)', lineHeight: 'var(--amp-leading-body)', color: 'var(--amp-ink)' }}>{text}</p>
        </Card>
      </div>
      {!comfort && (
        <p aria-hidden className="flex justify-between uppercase" style={eyebrow}>
          <span>‹ Not me</span>
          <span>That’s me ›</span>
        </p>
      )}
      <div
        role="radiogroup"
        aria-label="Sound like you?"
        onKeyDown={(e) => radioArrows(e, false)}
        className={comfort ? 'flex flex-col' : 'grid'}
        style={{ gap: 'var(--amp-space-2)', gridTemplateColumns: comfort ? undefined : '0.8fr 1.1fr 1fr' }}
      >
        {(comfort ? [...item.options].sort((a, b) => (a.key === 'me' ? -1 : b.key === 'me' ? 1 : 0)) : item.options.slice().reverse()).map((o) => (
          <Answer key={o.key} label={o.label} on={current === o.key} primary={o.key === 'me' && !current} big={comfort} onClick={() => choose(o.key)} />
        ))}
      </div>
    </div>
  )
}

/* ── How often: the signal meter ──────────────────────────────────────── */

export function HowOftenFormat({ probe, text, comfort, selected, pick }: FormatProps) {
  const item = probe.items[0]
  const current = selected?.answer[item.key]
  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-3)' }}>
      <Card scene={probe.scene}>
        <p style={{ fontSize: comfort ? 'var(--amp-text-lead)' : 'var(--amp-text-body)', lineHeight: 'var(--amp-leading-body)' }}>{text}</p>
      </Card>
      <div
        role="radiogroup"
        aria-label="How often"
        onKeyDown={(e) => radioArrows(e, false)}
        className={comfort ? 'flex flex-col' : 'grid grid-cols-4'}
        style={{ gap: 'var(--amp-space-2)' }}
      >
        {item.options.map((o, i) => {
          const on = current === o.key
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                haptic('select')
                pick({ answer: { [item.key]: o.key } })
              }}
              className={`amp-press flex ${comfort ? 'flex-row justify-start' : 'flex-col'} items-center`}
              style={{
                gap: 'var(--amp-space-2)',
                minHeight: comfort ? 'var(--amp-target)' : 'calc(var(--amp-target) * 1.5)',
                padding: comfort ? '0 var(--amp-space-4)' : 'var(--amp-space-2) var(--amp-space-1)',
                borderRadius: 'var(--amp-radius-tile)',
                border: `var(--amp-hairline) solid ${on ? 'var(--amp-accent-line)' : 'var(--amp-edge-strong)'}`,
                background: on ? 'var(--amp-accent-fill)' : 'var(--amp-glass)',
                color: on ? 'var(--amp-ink)' : 'var(--amp-ink-2)',
                fontSize: comfort ? 'var(--amp-text-body)' : 'var(--amp-text-data)',
                lineHeight: 'var(--amp-leading-tight)',
                textAlign: 'center',
                transition: stateTransition('background-color', 'border-color', 'color'),
              }}
            >
              <span aria-hidden className="flex items-end" style={{ gap: 'calc(var(--amp-hairline) * 2)', height: 'var(--amp-space-5)' }}>
                {[1, 2, 3, 4].map((n) => (
                  <span
                    key={n}
                    style={{
                      width: 'calc(var(--amp-hairline) * 4)',
                      height: `${n * 25}%`,
                      borderRadius: 'var(--amp-hairline)',
                      background: n <= i + 1 ? 'var(--amp-accent)' : 'var(--amp-edge-strong)',
                    }}
                  />
                ))}
              </span>
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── This or that ─────────────────────────────────────────────────────── */

export function ThisOrThatFormat({ probe, comfort, selected, pick }: FormatProps) {
  const item = probe.items[0]
  const current = selected?.answer[item.key]
  const sides = item.options.filter((o) => o.key === 'a' || o.key === 'b')
  const extras = item.options.filter((o) => o.key !== 'a' && o.key !== 'b')
  const choose = (key: string) => {
    haptic('select')
    pick({ answer: { [item.key]: key } })
  }
  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-3)' }}>
      <div role="radiogroup" aria-label={probe.question} onKeyDown={(e) => radioArrows(e, false)} className="flex flex-col" style={{ gap: 'var(--amp-space-3)' }}>
        {sides.map((o) => {
          const on = current === o.key
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(o.key)}
              className="amp-press w-full text-left"
              style={{
                padding: 'var(--amp-space-4)',
                borderRadius: 'var(--amp-radius-panel)',
                border: `var(--amp-hairline) solid ${on ? 'var(--amp-accent-line)' : 'var(--amp-edge-strong)'}`,
                background: on ? 'var(--amp-accent-fill)' : 'var(--amp-glass-raised)',
                boxShadow: on ? 'var(--amp-glow-soft)' : 'inset 0 var(--amp-hairline) 0 var(--amp-edge-top)',
                color: 'var(--amp-ink)',
                fontSize: comfort ? 'var(--amp-text-lead)' : 'var(--amp-text-body)',
                lineHeight: 'var(--amp-leading-body)',
                transition: stateTransition('background-color', 'border-color', 'box-shadow'),
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      <div className="flex justify-center" style={{ gap: 'var(--amp-space-4)' }}>
        {extras.map((o) => (
          <QuietLink key={o.key} aria-pressed={current === o.key} onClick={() => choose(o.key)}>
            {o.label}
          </QuietLink>
        ))}
      </div>
    </div>
  )
}

/* ── Day line: when ───────────────────────────────────────────────────── */

export function DayLineFormat({ probe, comfort, selected, pick }: FormatProps) {
  const spec = probe.dayLine!
  const item = probe.items[0]
  const buckets = new Set(spec.buckets.map((b) => b.key))
  const extras = item.options.filter((o) => !buckets.has(o.key))
  const [minutes, setMinutes] = useState<number>(selected?.minutes ?? spec.start)
  const [extra, setExtra] = useState<string | null>(selected && !buckets.has(selected.answer[item.key]) ? selected.answer[item.key] : null)
  const [touched, setTouched] = useState(Boolean(selected))
  const track = useRef<HTMLDivElement>(null)
  const span = spec.to - spec.from
  const snap = (m: number) => Math.min(spec.to, Math.max(spec.from, Math.round(m / spec.step) * spec.step))
  const at = (clientX: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r || !Number.isFinite(clientX)) return
    setMinutes(snap(spec.from + ((clientX - r.left) / (r.width || 1)) * span))
    setExtra(null)
    setTouched(true)
  }
  const [dragging, setDragging] = useState(false)

  function keys(e: KeyboardEvent<HTMLDivElement>) {
    const move = { ArrowRight: spec.step, ArrowUp: spec.step, ArrowLeft: -spec.step, ArrowDown: -spec.step } as Record<string, number>
    if (e.key in move) {
      e.preventDefault()
      setMinutes((m) => snap(m + move[e.key]))
      setExtra(null)
      setTouched(true)
      haptic('tick')
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      setMinutes(e.key === 'Home' ? spec.from : spec.to)
      setExtra(null)
      setTouched(true)
    }
  }

  const share = (minutes - spec.from) / span
  const ticks = [spec.from, spec.from + span / 3, spec.from + (2 * span) / 3, spec.to].map((m) => Math.round(m / 60) * 60)
  const commit = () => pick(extra ? { answer: { [item.key]: extra } } : { answer: { [item.key]: bucketAt(spec, minutes) }, minutes })

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-5)' }}>
      <div style={{ paddingTop: 'var(--amp-space-6)' }}>
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label={probe.question}
          aria-valuemin={spec.from}
          aria-valuemax={spec.to}
          aria-valuenow={minutes}
          aria-valuetext={extra ? item.options.find((o) => o.key === extra)?.label : `About ${clockWords(minutes)}`}
          onKeyDown={keys}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return
            setDragging(true)
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId)
            } catch {
              // Capture is a nicety.
            }
            at(e.clientX)
          }}
          onPointerMove={(e) => dragging && at(e.clientX)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          className="relative"
          style={{
            height: comfort ? 'calc(var(--amp-target) * 1.6)' : 'calc(var(--amp-target) * 1.3)',
            borderRadius: 'var(--amp-radius-tile)',
            border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
            background: 'linear-gradient(90deg, var(--amp-glass-solid), var(--amp-sun-fill) 35%, var(--amp-sun-fill) 60%, var(--amp-glass-solid))',
            touchAction: 'none',
            cursor: 'pointer',
          }}
        >
          <span
            aria-hidden
            className="absolute flex items-center justify-center"
            style={{
              left: `${share * 100}%`,
              top: '50%',
              width: 'var(--amp-target)',
              height: 'var(--amp-target)',
              transform: 'translate(-50%, -50%)',
              borderRadius: 'var(--amp-radius-pill)',
              background: extra ? 'var(--amp-glass)' : 'var(--amp-accent)',
              color: 'var(--amp-ink-on-accent)',
              boxShadow: extra ? 'none' : 'var(--amp-glow)',
              opacity: extra ? 0.4 : 1,
              transition: dragging ? 'none' : springTransition('left'),
            }}
          />
          {!extra && (
            <span
              aria-hidden
              className="absolute uppercase"
              style={{
                left: `${share * 100}%`,
                bottom: 'calc(100% + var(--amp-space-2))',
                transform: 'translateX(-50%)',
                padding: 'var(--amp-space-1) var(--amp-space-2)',
                borderRadius: 'var(--amp-radius-pill)',
                border: 'var(--amp-hairline) solid var(--amp-accent-line)',
                background: 'var(--amp-glass-solid)',
                whiteSpace: 'nowrap',
                ...eyebrow,
                color: 'var(--amp-accent)',
              }}
            >
              About {clockWords(minutes)}
            </span>
          )}
        </div>
        <div aria-hidden className="flex justify-between uppercase" style={{ ...eyebrow, marginTop: 'var(--amp-space-2)' }}>
          {ticks.map((m) => (
            <span key={m}>{clockWords(m % (24 * 60))}</span>
          ))}
        </div>
      </div>
      {extras.length > 0 && (
        <div className="flex justify-center" style={{ gap: 'var(--amp-space-4)' }}>
          {extras.map((o) => (
            <QuietLink
              key={o.key}
              aria-pressed={extra === o.key}
              onClick={() => {
                setExtra(extra === o.key ? null : o.key)
                setTouched(true)
              }}
            >
              {o.label}
            </QuietLink>
          ))}
        </div>
      )}
      <NextButton ready={touched} nudge="Drag the marker, or pick one below it." onClick={commit}>
        {touched ? 'Next' : 'Drag to your time'}
      </NextButton>
    </div>
  )
}

/* ── Quick fire: yes or no, a few in a row ────────────────────────────── */

export function QuickFireFormat({ probe, comfort, selected, pick }: FormatProps) {
  const [answer, setAnswer] = useState<Record<string, string>>(selected?.answer ?? {})
  const done = probe.items.every((i) => answer[i.key])
  const next = probe.items.find((i) => !answer[i.key])
  const rows = useRef<Record<string, HTMLDivElement | null>>({})

  // The next row takes focus as the last one is answered.
  useEffect(() => {
    if (next) rows.current[next.key]?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    // Only when the row to answer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.key])

  function set(key: string, value: string) {
    haptic('tick')
    const all = { ...answer, [key]: value }
    setAnswer(all)
    // Standard size: the last answer is the answer. Comfort mode waits for Next.
    if (!comfort && probe.items.every((i) => all[i.key])) pick({ answer: all })
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
      {probe.items.map((item, i) => {
        const value = answer[item.key]
        const now = next?.key === item.key
        return (
          <div
            key={item.key}
            ref={(el) => {
              rows.current[item.key] = el
            }}
            role="radiogroup"
            aria-label={item.text}
            className="flex items-center justify-between"
            style={{
              gap: 'var(--amp-space-3)',
              padding: 'var(--amp-space-2) var(--amp-space-2) var(--amp-space-2) var(--amp-space-4)',
              borderRadius: 'var(--amp-radius-tile)',
              border: `var(--amp-hairline) solid ${now ? 'var(--amp-accent-line)' : 'var(--amp-edge)'}`,
              background: now ? 'var(--amp-accent-fill)' : 'var(--amp-glass)',
              opacity: !value && !now ? 0.55 : 1,
              transition: stateTransition('background-color', 'border-color', 'opacity'),
            }}
          >
            <span style={{ fontSize: comfort ? 'var(--amp-text-body)' : 'var(--amp-text-meta)', color: 'var(--amp-ink)' }}>{item.text}</span>
            <span className="flex shrink-0" style={{ gap: 'var(--amp-space-1)' }} onKeyDown={(e) => radioArrows(e, false)}>
              {item.options.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={value === o.key}
                  tabIndex={value ? (value === o.key ? 0 : -1) : o.key === 'yes' ? 0 : -1}
                  onClick={() => set(item.key, o.key)}
                  className="amp-press"
                  style={{
                    minWidth: 'calc(var(--amp-target) * 1.1)',
                    minHeight: 'var(--amp-target)',
                    borderRadius: 'var(--amp-radius-chip)',
                    border: `var(--amp-hairline) solid ${value === o.key ? 'var(--amp-accent-line)' : 'var(--amp-edge-strong)'}`,
                    background: value === o.key ? 'var(--amp-accent)' : 'var(--amp-glass-solid)',
                    color: value === o.key ? 'var(--amp-ink-on-accent)' : 'var(--amp-ink)',
                    fontWeight: 'var(--amp-weight-bold)',
                    fontSize: 'var(--amp-text-meta)',
                    transition: stateTransition('background-color', 'border-color', 'color'),
                  }}
                >
                  {o.label}
                </button>
              ))}
            </span>
            <span className="sr-only">{`${i + 1} of ${probe.items.length}`}</span>
          </div>
        )
      })}
      <p aria-hidden className="text-center uppercase" style={{ ...eyebrow, marginTop: 'var(--amp-space-1)' }}>
        {Object.keys(answer).length} of {probe.items.length}
      </p>
      {comfort && (
        <NextButton ready={done} nudge="Answer each one, yes or no." onClick={() => pick({ answer })}>
          Next
        </NextButton>
      )}
    </div>
  )
}

export function ProbeFormat(props: FormatProps) {
  switch (props.probe.format) {
    case 'scenario':
      return <ScenarioFormat {...props} />
    case 'how-often':
      return <HowOftenFormat {...props} />
    case 'this-or-that':
      return <ThisOrThatFormat {...props} />
    case 'day-line':
      return <DayLineFormat {...props} />
    case 'quick-fire':
      return <QuickFireFormat {...props} />
  }
}
