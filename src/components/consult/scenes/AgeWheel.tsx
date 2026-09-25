'use client'

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { AGE_LABEL, SEX_LABEL } from '@/lib/consult/summary'
import type { AgeBand, Sex } from '@/lib/consult/types'
import { DURATION, haptic, stateTransition } from '@/lib/consult/motion'
import { Hint, Segmented, Tile } from '../controls'
import type { SceneProps } from './registry'

/**
 * The age wheel (build C3).
 *
 * A snap-scrolling drum of age bands behind a highlighted centre frame. The
 * browser's own scroll snapping does the landing — it is the thing iOS and
 * Android already make feel right under a thumb — and the band that settles in
 * the frame is the answer. Tapping a band scrolls it into the frame; arrow keys
 * step through them. Under it, sex as a three-way toggle, because it changes a
 * few nutrient needs (iron, for one).
 *
 * In comfort mode the drum becomes a plain list of large buttons: the same
 * answer, no spinning required.
 */

export const AGE_BANDS: AgeBand[] = ['18-24', '25-34', '35-44', '45-54', '55-64', '65-plus']
const SEXES: Sex[] = ['female', 'male', 'unsaid']

/** Rows visible in the drum; the middle one is the frame. */
const VISIBLE = 5

export function AgeWheel({ answers, onAnswer, comfort, onInteract }: SceneProps) {
  const drum = useRef<HTMLDivElement>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Only a scroll the visitor made is an answer. Placing the drum on mount
  // scrolls it too, and that must not pick a band on their behalf.
  const touched = useRef(false)
  const current = answers.age
  const index = current ? AGE_BANDS.indexOf(current) : -1

  function rowHeight(): number {
    const el = drum.current?.querySelector<HTMLElement>('[role="option"]')
    return el?.offsetHeight || 1
  }

  function scrollToIndex(i: number, smooth: boolean) {
    const el = drum.current
    if (!el || typeof el.scrollTo !== 'function') return
    el.scrollTo({ top: i * rowHeight(), behavior: smooth ? 'smooth' : 'auto' })
  }

  // Start with the answer in the frame (or the second band, unpicked).
  useEffect(() => {
    scrollToIndex(index >= 0 ? index : 1, false)
    // Only on mount: afterwards the scroll position *is* the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current)
  }, [])

  function pick(i: number) {
    const band = AGE_BANDS[Math.max(0, Math.min(AGE_BANDS.length - 1, i))]
    if (band !== current) {
      haptic('tick')
      onAnswer({ age: band, sex: answers.sex })
    }
  }

  function onScroll() {
    const el = drum.current
    if (!el || !touched.current) return
    onInteract?.(0)
    if (settle.current) clearTimeout(settle.current)
    // Read the band once the snap has landed, not on every frame of the fling.
    settle.current = setTimeout(() => pick(Math.round(el.scrollTop / rowHeight())), DURATION.state)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const from = index >= 0 ? index : 1
    let to = from
    if (e.key === 'ArrowDown') to = from + 1
    else if (e.key === 'ArrowUp') to = from - 1
    else if (e.key === 'Home') to = 0
    else if (e.key === 'End') to = AGE_BANDS.length - 1
    else return
    e.preventDefault()
    to = Math.max(0, Math.min(AGE_BANDS.length - 1, to))
    pick(to)
    scrollToIndex(to, true)
  }

  const sex = (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
      <p
        id="amp-sex-label"
        className="uppercase"
        style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)' }}
      >
        Sex · it changes some nutrient needs
      </p>
      <Segmented
        label="Sex"
        options={SEXES.map((s) => ({ value: s, label: SEX_LABEL[s] }))}
        value={answers.sex}
        onChange={(s) => onAnswer({ sex: s, age: answers.age })}
      />
    </div>
  )

  if (comfort) {
    return (
      <div className="flex flex-col" style={{ gap: 'var(--amp-space-5)' }}>
        <div role="radiogroup" aria-label="Age band" className="grid grid-cols-2" style={{ gap: 'var(--amp-space-2)' }}>
          {AGE_BANDS.map((b) => (
            <Tile key={b} kind="radio" layout="row" label={AGE_LABEL[b]} selected={b === current} onSelect={() => onAnswer({ age: b, sex: answers.sex })} />
          ))}
        </div>
        {sex}
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-6)' }}>
      <div className="relative" style={{ height: `calc(var(--amp-target) * ${VISIBLE})` }}>
        {/* The centre frame. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0"
          style={{
            top: `calc(var(--amp-target) * ${(VISIBLE - 1) / 2})`,
            height: 'var(--amp-target)',
            marginLeft: 'var(--amp-space-8)',
            marginRight: 'var(--amp-space-8)',
            borderRadius: 'var(--amp-radius-chip)',
            borderTop: `var(--amp-hairline) solid ${current ? 'var(--amp-accent)' : 'var(--amp-edge-strong)'}`,
            borderBottom: `var(--amp-hairline) solid ${current ? 'var(--amp-accent)' : 'var(--amp-edge-strong)'}`,
            background: current ? 'var(--amp-accent-fill)' : 'transparent',
            boxShadow: current ? 'var(--amp-glow-soft)' : 'none',
            transition: stateTransition('border-color', 'background-color', 'box-shadow'),
          }}
        />
        <div
          ref={drum}
          role="listbox"
          aria-label="Age band"
          aria-activedescendant={current ? `amp-age-${current}` : undefined}
          tabIndex={0}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          onPointerDown={() => (touched.current = true)}
          onTouchStart={() => (touched.current = true)}
          onWheel={() => (touched.current = true)}
          className="amp-no-scrollbar relative h-full overflow-y-scroll"
          style={{
            scrollSnapType: 'y mandatory',
            paddingTop: `calc(var(--amp-target) * ${(VISIBLE - 1) / 2})`,
            paddingBottom: `calc(var(--amp-target) * ${(VISIBLE - 1) / 2})`,
            maskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
            borderRadius: 'var(--amp-radius-tile)',
          }}
        >
          {AGE_BANDS.map((band, i) => {
            const on = band === current
            return (
              <div
                key={band}
                id={`amp-age-${band}`}
                role="option"
                aria-selected={on}
                onClick={() => {
                  pick(i)
                  scrollToIndex(i, true)
                }}
                className="flex cursor-pointer select-none items-center justify-center"
                style={{
                  height: 'var(--amp-target)',
                  scrollSnapAlign: 'center',
                  fontFamily: 'var(--amp-font-display)',
                  fontWeight: 'var(--amp-weight-heavy)',
                  fontSize: on ? 'var(--amp-text-question)' : 'var(--amp-text-title)',
                  color: on ? 'var(--amp-ink)' : 'var(--amp-ink-3)',
                  transition: stateTransition('color', 'font-size'),
                }}
              >
                {AGE_LABEL[band]}
              </div>
            )
          })}
        </div>
      </div>
      {!current && <Hint>Spin or tap to your age</Hint>}
      {sex}
    </div>
  )
}
