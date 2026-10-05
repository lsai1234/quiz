'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

/**
 * The Analytics page's charts.
 *
 * Drawn by hand in SVG rather than with a chart library: there are two shapes
 * (a trend and a set of columns), the library would be the heaviest thing on
 * the page, and every value here is a token — which no library's defaults are.
 *
 * Both follow the same rules:
 *
 *  • One series, in the accent. Axes and gridlines are `--edge` hairlines, so
 *    the data is the only loud thing on the card.
 *  • A hover layer that never gates: the crosshair or the hovered column says
 *    the value, and every value is also in the table under the chart.
 *  • The same details on the keyboard as on hover. The chart takes focus as one
 *    stop and the arrow keys walk it, with the reading announced — a column per
 *    tab stop would be twenty-four stops to get past the hour-of-day chart.
 */

export interface Point {
  label: string
  /** Fuller name for the tooltip — "Mon 6 Oct 2026" where the axis says "6 Oct". */
  title?: string
  value: number
}

/** The element's width, kept current. Zero until measured. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** A round number at or above `max`, so the top gridline lands on something readable. */
export function niceMax(max: number): number {
  if (max <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(max)))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * exp >= max) return step * exp
  }
  return 10 * exp
}

/** Arrow keys walk the points; Home and End jump to the ends. */
function walk(e: KeyboardEvent, active: number | null, n: number, set: (i: number) => void) {
  const current = active ?? n - 1
  const next =
    e.key === 'ArrowRight' ? Math.min(n - 1, current + 1)
    : e.key === 'ArrowLeft' ? Math.max(0, current - 1)
    : e.key === 'Home' ? 0
    : e.key === 'End' ? n - 1
    : null
  if (next === null) return
  e.preventDefault()
  set(next)
}

const axisText = {
  fontSize: 'var(--text-micro)',
  fontFamily: 'var(--font-body)',
  fill: 'var(--ink-3)',
} as const

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  // Kept inside the card: flips to the left of the crosshair past the midpoint.
  const right = x > width / 2
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        top: 0,
        left: right ? undefined : `calc(${x}px + var(--space-3))`,
        right: right ? `calc(${width - x}px + var(--space-3))` : undefined,
        background: 'var(--surface-solid)',
        border: '1px solid var(--edge-strong)',
        borderRadius: 'var(--radius-row)',
        boxShadow: 'var(--shadow-raised)',
        padding: 'var(--space-2) var(--space-3)',
        whiteSpace: 'nowrap',
        zIndex: 1,
      }}
    >
      {children}
    </div>
  )
}

function Reading({ value, title }: { value: string; title: string }) {
  return (
    <>
      {/* Value leads: the reader already knows what they are pointing at. */}
      <span className="block" style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      <span className="block" style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
        {title}
      </span>
    </>
  )
}

const PLOT_H = 168
const COLUMN_H = 120
const AXIS_H = 24
/** `--chart-bar-max` and `--chart-mark-radius`, as numbers: path geometry cannot read a custom property. */
const BAR_MAX = 24
const MARK_RADIUS = 4
const GUTTER_L = 40
const GUTTER_R = 12
const TOP = 8

/**
 * A trend: one series over time, as a line over a wash.
 *
 * The crosshair finds the nearest point, so the reader aims at a date rather
 * than at a 2px line.
 */
export function TrendChart({ points, format, label }: { points: Point[]; format: (n: number) => string; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)
  const descId = useId()
  const n = points.length
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)))
  const plotW = Math.max(1, width - GUTTER_L - GUTTER_R)
  const x = (i: number) => GUTTER_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v: number) => TOP + PLOT_H - (v / max) * PLOT_H
  const base = TOP + PLOT_H

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = n > 0 ? `${line} L${x(n - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z` : ''
  // As many axis labels as fit, evenly spaced, never overlapping.
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 64))))

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - box.left - GUTTER_L
    setActive(n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((px / plotW) * (n - 1)))))
  }

  const shown = active !== null && n > 0 ? points[Math.min(active, n - 1)] : null

  return (
    <div
      ref={ref}
      className="relative system-focus"
      tabIndex={0}
      role="group"
      aria-label={label}
      aria-describedby={descId}
      onKeyDown={(e) => walk(e, active, n, setActive)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        setActive(null)
      }}
      style={{ borderRadius: 'var(--radius-row)', outline: 'none' }}
    >
      <span id={descId} className="sr-only" aria-live={focused ? 'polite' : undefined}>
        {shown ? `${shown.title ?? shown.label}: ${format(shown.value)}` : 'Use the arrow keys to read each point.'}
      </span>
      {width > 0 && (
        <svg
          width={width}
          height={TOP + PLOT_H + AXIS_H}
          aria-hidden
          onPointerMove={onMove}
          onPointerLeave={() => !focused && setActive(null)}
          style={{ display: 'block', touchAction: 'pan-y' }}
        >
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={GUTTER_L} x2={width - GUTTER_R} y1={y(max * t)} y2={y(max * t)} style={{ stroke: t === 0 ? 'var(--edge-strong)' : 'var(--edge)', strokeWidth: 1 }} />
              <text x={GUTTER_L - 8} y={y(max * t)} dy="0.32em" textAnchor="end" style={axisText}>
                {format(max * t)}
              </text>
            </g>
          ))}
          <path d={area} style={{ fill: 'var(--accent-fill)' }} />
          <path d={line} style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 'var(--chart-line)', strokeLinejoin: 'round', strokeLinecap: 'round' }} />
          {points.map((p, i) =>
            i % every === 0 ? (
              <text key={p.label + i} x={x(i)} y={base + AXIS_H - 6} textAnchor={i === 0 && n > 1 ? 'start' : 'middle'} style={axisText}>
                {p.label}
              </text>
            ) : null,
          )}
          {shown && active !== null && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={TOP} y2={base} style={{ stroke: 'var(--edge-strong)', strokeWidth: 1 }} />
              <circle cx={x(active)} cy={y(shown.value)} r={4} style={{ fill: 'var(--accent)', stroke: 'var(--surface-solid)', strokeWidth: 'var(--chart-gap)' }} />
            </g>
          )}
        </svg>
      )}
      {shown && active !== null && (
        <Tooltip x={x(active)} width={width}>
          <Reading value={format(shown.value)} title={shown.title ?? shown.label} />
        </Tooltip>
      )}
    </div>
  )
}

/**
 * Columns: a value per category, for an ordered set — minutes to finish, hours
 * of the day. One hue; the hovered column lifts.
 *
 * @param labelEvery Label every nth column on the axis (the tooltip and the
 *                   table carry the rest).
 * @param showValues Print each value on its column's cap. For a handful of
 *                   columns only — on twenty-four it is noise.
 */
export function ColumnChart({
  points,
  format,
  label,
  labelEvery = 1,
  showValues = false,
}: {
  points: Point[]
  format: (n: number) => string
  label: string
  labelEvery?: number
  showValues?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)
  const descId = useId()
  const n = points.length
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)))
  const valueBand = showValues ? 16 : 0
  const plotW = Math.max(1, width)
  const slot = plotW / Math.max(1, n)
  const shown = active !== null && n > 0 ? points[Math.min(active, n - 1)] : null

  return (
    <div
      ref={ref}
      className="relative system-focus"
      tabIndex={0}
      role="group"
      aria-label={label}
      aria-describedby={descId}
      onKeyDown={(e) => walk(e, active, n, setActive)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        setActive(null)
      }}
      style={{ borderRadius: 'var(--radius-row)', outline: 'none' }}
    >
      <span id={descId} className="sr-only" aria-live={focused ? 'polite' : undefined}>
        {shown ? `${shown.title ?? shown.label}: ${format(shown.value)}` : 'Use the arrow keys to read each column.'}
      </span>
      {width > 0 && (
        <svg
          width={width}
          height={valueBand + COLUMN_H + AXIS_H}
          aria-hidden
          onPointerLeave={() => !focused && setActive(null)}
          style={{ display: 'block', touchAction: 'pan-y' }}
        >
          <line x1={0} x2={width} y1={valueBand + COLUMN_H} y2={valueBand + COLUMN_H} style={{ stroke: 'var(--edge-strong)', strokeWidth: 1 }} />
          {points.map((p, i) => {
            const h = (p.value / max) * (COLUMN_H)
            const barW = Math.max(2, Math.min(BAR_MAX, slot - 2))
            const cx = slot * i + slot / 2
            const top = valueBand + COLUMN_H - h
            return (
              <g key={p.label + i} onPointerEnter={() => setActive(i)}>
                {/* The hit target is the whole slot, not the painted column. */}
                <rect x={slot * i} y={0} width={slot} height={valueBand + COLUMN_H} style={{ fill: 'transparent' }} />
                {h > 0 && (
                  <path
                    d={roundedTop(cx - barW / 2, top, barW, h, Math.min(MARK_RADIUS, barW / 2, h))}
                    style={{ fill: 'var(--accent)', opacity: active === null || active === i ? 1 : 0.55, transition: 'opacity var(--duration-fast) var(--ease-settle)' }}
                  />
                )}
                {showValues && p.value > 0 && (
                  <text x={cx} y={top - 4} textAnchor="middle" style={{ ...axisText, fill: 'var(--ink-2)' }}>
                    {format(p.value)}
                  </text>
                )}
                {i % labelEvery === 0 && (
                  <text x={cx} y={valueBand + COLUMN_H + AXIS_H - 6} textAnchor="middle" style={axisText}>
                    {p.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
      {shown && active !== null && (
        <Tooltip x={slot * active + slot / 2} width={width}>
          <Reading value={format(shown.value)} title={shown.title ?? shown.label} />
        </Tooltip>
      )}
    </div>
  )
}

/** A column with its data end rounded and its baseline square. */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`
}

/**
 * A horizontal share bar — the mark in a breakdown row. Rounded at the data
 * end only, never thicker than the system allows, on no track: the row's own
 * label and figures say what 100% is.
 */
export function ShareBar({ value, label }: { value: number; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ height: 'var(--space-2)', width: '100%' }}>
      <div
        style={{
          height: '100%',
          width: `${Math.max(value > 0 ? 1 : 0, Math.min(100, value * 100))}%`,
          background: 'var(--accent)',
          borderRadius: '0 var(--chart-mark-radius) var(--chart-mark-radius) 0',
          transition: 'width var(--duration-slow) var(--ease-settle)',
        }}
      />
    </div>
  )
}
