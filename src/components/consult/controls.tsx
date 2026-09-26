'use client'

import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import { haptic, stateTransition } from '@/lib/consult/motion'
import { Glyph, type GlyphName } from './Glyph'

/**
 * The consult's shared answer controls (build S8).
 *
 * Every scene builds from these rather than drawing its own buttons, so a
 * tile, chip or Next button looks and behaves the same on every screen, and
 * comfort mode can grow them all in one place (`--amp-target`).
 *
 * States each control carries:
 *   - selected    — painted in the accent role, with its glow
 *   - disabled    — dimmed, not focusable as an action
 *   - nudge       — Next pressed before the scene is answered: it stays put and
 *                   says what is missing, rather than silently doing nothing
 *   - hint        — a quiet line under a control group
 */

export type Tone = 'accent' | 'go' | 'caution' | 'sun'

const TONE: Record<Tone, { ink: string; fill: string; line: string; glow: string }> = {
  accent: { ink: 'var(--amp-accent)', fill: 'var(--amp-accent-fill)', line: 'var(--amp-accent-line)', glow: 'var(--amp-accent-glow)' },
  go: { ink: 'var(--amp-go)', fill: 'var(--amp-go-fill)', line: 'var(--amp-go-line)', glow: 'var(--amp-go-glow)' },
  caution: { ink: 'var(--amp-caution)', fill: 'var(--amp-caution-fill)', line: 'var(--amp-caution-line)', glow: 'var(--amp-caution-glow)' },
  sun: { ink: 'var(--amp-sun)', fill: 'var(--amp-sun-fill)', line: 'var(--amp-sun-line)', glow: 'var(--amp-sun-glow)' },
}

/* ── Tile ───────────────────────────────────────────────────────────────── */

interface TileProps {
  label: string
  sub?: string
  icon?: GlyphName
  selected: boolean
  onSelect: () => void
  /** A number or mark in the corner — the priority on a goal tile. */
  badge?: ReactNode
  disabled?: boolean
  tone?: Tone
  /** `radio` inside a single-choice group; `toggle` for pick-several. */
  kind?: 'radio' | 'toggle'
  /** Row: icon beside the words. Stack: icon above them. */
  layout?: 'row' | 'stack'
}

export function Tile({
  label,
  sub,
  icon,
  selected,
  onSelect,
  badge,
  disabled,
  tone = 'accent',
  kind = 'toggle',
  layout = 'stack',
}: TileProps) {
  const t = TONE[tone]
  return (
    <button
      type="button"
      role={kind === 'radio' ? 'radio' : undefined}
      aria-checked={kind === 'radio' ? selected : undefined}
      aria-pressed={kind === 'toggle' ? selected : undefined}
      disabled={disabled}
      onClick={() => {
        haptic('select')
        onSelect()
      }}
      className={`amp-press relative flex w-full text-left ${layout === 'row' ? 'flex-row items-center' : 'flex-col items-start'}`}
      style={{
        gap: layout === 'row' ? 'var(--amp-space-3)' : 'var(--amp-space-2)',
        minHeight: layout === 'row' ? 'var(--amp-target)' : 'calc(var(--amp-target) * 2)',
        padding: 'var(--amp-space-3) var(--amp-space-4)',
        borderRadius: 'var(--amp-radius-tile)',
        border: `var(--amp-hairline) solid ${selected ? t.line : 'var(--amp-edge)'}`,
        background: selected ? t.fill : 'var(--amp-glass)',
        backdropFilter: 'blur(var(--amp-glass-blur)) saturate(var(--amp-glass-saturate))',
        boxShadow: selected ? `0 0 24px -8px ${t.glow}, inset 0 var(--amp-hairline) 0 var(--amp-edge-top)` : 'inset 0 var(--amp-hairline) 0 var(--amp-edge-top)',
        color: 'var(--amp-ink)',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {icon && (
        <span style={{ color: selected ? t.ink : 'var(--amp-ink-2)', transition: stateTransition('color') }}>
          <Glyph name={icon} size={22} />
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span style={{ fontWeight: 'var(--amp-weight-bold)', fontSize: 'var(--amp-text-body)', lineHeight: 'var(--amp-leading-tight)' }}>
          {label}
        </span>
        {sub && (
          <span style={{ marginTop: 'var(--amp-space-1)', fontSize: 'var(--amp-text-meta)', lineHeight: 'var(--amp-leading-tight)', color: 'var(--amp-ink-2)' }}>
            {sub}
          </span>
        )}
      </span>
      {badge !== undefined && badge !== null && (
        <span
          aria-hidden
          className="absolute flex items-center justify-center amp-anim-rise"
          style={{
            top: 'var(--amp-space-2)',
            right: 'var(--amp-space-2)',
            width: 'var(--amp-space-6)',
            height: 'var(--amp-space-6)',
            borderRadius: 'var(--amp-radius-pill)',
            background: t.ink,
            color: 'var(--amp-ink-on-accent)',
            fontFamily: 'var(--amp-font-mono)',
            fontSize: 'var(--amp-text-meta)',
            fontWeight: 'var(--amp-weight-bold)',
            boxShadow: `0 0 14px -2px ${t.glow}`,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

/* ── Chip ───────────────────────────────────────────────────────────────── */

interface ChipProps {
  label: string
  selected: boolean
  onToggle: () => void
  icon?: GlyphName
  tone?: Tone
  disabled?: boolean
}

export function Chip({ label, selected, onToggle, icon, tone = 'accent', disabled }: ChipProps) {
  const t = TONE[tone]
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => {
        haptic('tick')
        onToggle()
      }}
      className="amp-press inline-flex items-center"
      style={{
        gap: 'var(--amp-space-2)',
        minHeight: 'var(--amp-target)',
        padding: '0 var(--amp-space-4)',
        borderRadius: 'var(--amp-radius-pill)',
        border: `var(--amp-hairline) solid ${selected ? t.line : 'var(--amp-edge-strong)'}`,
        background: selected ? t.fill : 'var(--amp-glass-solid)',
        color: selected ? t.ink : 'var(--amp-ink)',
        fontSize: 'var(--amp-text-meta)',
        fontWeight: 'var(--amp-weight-medium)',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon && <Glyph name={icon} size={16} />}
      {selected && !icon && <Glyph name="check" size={14} />}
      {label}
    </button>
  )
}

/* ── Segmented toggle ───────────────────────────────────────────────────── */

interface SegmentedProps<T extends string> {
  label: string
  options: { value: T; label: string }[]
  value: T | null
  onChange: (value: T) => void
}

/**
 * Arrow keys for a radiogroup of tiles (U7): move to the next or previous
 * radio, as the ARIA pattern expects. `select` picks it as it goes, which is
 * right for an answer; a choice that navigates away (the route) only moves focus.
 */
export function radioArrows(e: KeyboardEvent<HTMLElement>, select = true) {
  const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
  if (!delta) return
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')]
  const i = radios.indexOf(document.activeElement as HTMLElement)
  if (i === -1) return
  e.preventDefault()
  const next = radios[(i + delta + radios.length) % radios.length]
  next.focus()
  if (select) next.click()
}

/** A single choice, a word or two long, as a row. A real radiogroup: arrows move. */
export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const current = options.findIndex((o) => o.value === value)

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const from = current === -1 ? 0 : current
    const next = (from + delta + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        gap: 'var(--amp-space-1)',
        padding: 'var(--amp-space-1)',
        borderRadius: 'var(--amp-radius-tile)',
        background: 'var(--amp-glass-solid)',
        border: 'var(--amp-hairline) solid var(--amp-edge)',
      }}
    >
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (current === -1 && i === 0) ? 0 : -1}
            onClick={() => {
              haptic('tick')
              onChange(o.value)
            }}
            className="amp-press"
            style={{
              minHeight: 'var(--amp-target)',
              padding: '0 var(--amp-space-2)',
              borderRadius: 'var(--amp-radius-chip)',
              background: on ? 'var(--amp-accent-fill)' : 'transparent',
              border: `var(--amp-hairline) solid ${on ? 'var(--amp-accent-line)' : 'transparent'}`,
              color: on ? 'var(--amp-accent)' : 'var(--amp-ink-2)',
              fontSize: 'var(--amp-text-meta)',
              fontWeight: 'var(--amp-weight-medium)',
              lineHeight: 'var(--amp-leading-tight)',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Next ───────────────────────────────────────────────────────────────── */

interface NextButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode
  /**
   * Whether the scene is answered. When it isn't, Next stays pressable but
   * does not advance: it shows `nudge` instead. A dead button teaches nothing;
   * one that says "pick at least one goal" does.
   */
  ready?: boolean
  nudge?: string
  /** Changes when the scene changes, so a nudge from one scene doesn't linger. */
  resetKey?: string
}

/** The primary action at the foot of every scene. */
export function NextButton({ children = 'Next', ready = true, nudge, resetKey, disabled, onClick, style, className, ...rest }: NextButtonProps) {
  const [nudging, setNudging] = useState(false)
  const hintId = useId()

  useEffect(() => {
    setNudging(false)
  }, [resetKey, ready])

  const dim = disabled || !ready
  return (
    <div className="flex flex-col items-stretch" style={{ gap: 'var(--amp-space-2)' }}>
      <button
        type="button"
        disabled={disabled}
        aria-disabled={!ready || undefined}
        aria-describedby={nudging && nudge ? hintId : undefined}
        onClick={(e) => {
          if (!ready) {
            setNudging(true)
            haptic('tick')
            return
          }
          onClick?.(e)
        }}
        className={`amp-press flex w-full items-center justify-center ${className ?? ''}`}
        style={{
          minHeight: 'calc(var(--amp-target) + var(--amp-space-1))',
          borderRadius: 'var(--amp-radius-tile)',
          background: dim ? 'var(--amp-glass-raised)' : 'var(--amp-accent)',
          color: dim ? 'var(--amp-ink-3)' : 'var(--amp-ink-on-accent)',
          boxShadow: dim ? 'none' : 'var(--amp-glow)',
          border: `var(--amp-hairline) solid ${dim ? 'var(--amp-edge)' : 'transparent'}`,
          fontFamily: 'var(--amp-font-body)',
          fontWeight: 'var(--amp-weight-bold)',
          fontSize: 'var(--amp-text-lead)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...style,
        }}
        {...rest}
      >
        {children}
      </button>
      <p
        id={hintId}
        aria-live="polite"
        className="text-center"
        style={{
          minHeight: nudging && nudge ? undefined : 0,
          fontSize: 'var(--amp-text-meta)',
          color: 'var(--amp-caution)',
        }}
      >
        {nudging && nudge ? nudge : ''}
      </p>
    </div>
  )
}

/* ── Quiet link & hint ──────────────────────────────────────────────────── */

/** A quiet text link under the action, e.g. "Tell Amp more". */
export function QuietLink({ children, icon, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: GlyphName }) {
  return (
    <button
      type="button"
      className="amp-press inline-flex items-center"
      style={{
        gap: 'var(--amp-space-1)',
        minHeight: 'var(--amp-target)',
        paddingLeft: 'var(--amp-space-3)',
        paddingRight: 'var(--amp-space-3)',
        fontSize: 'var(--amp-text-meta)',
        color: 'var(--amp-ink-2)',
        borderRadius: 'var(--amp-radius-chip)',
      }}
      {...rest}
    >
      {icon && <Glyph name={icon} size={16} />}
      {children}
    </button>
  )
}

/** A quiet line of guidance under a control group. */
export function Hint({ children, tone }: { children: ReactNode; tone?: Tone }) {
  return (
    <p
      className="text-center uppercase"
      style={{
        fontFamily: 'var(--amp-font-mono)',
        fontSize: 'var(--amp-text-data)',
        letterSpacing: 'var(--amp-tracking-data)',
        color: tone ? TONE[tone].ink : 'var(--amp-ink-3)',
      }}
    >
      {children}
    </p>
  )
}
