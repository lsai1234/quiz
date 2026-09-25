import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SCENES } from '@/lib/consult/flow'
import { sleepHours } from '@/lib/consult/reactions'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { SceneRenderer } from '../scenes/registry'
import { energyWord, levelAt } from '../scenes/ChargeDial'
import { MIN_GAP, TRACK_SPAN, fromTrack, moveHandle, toTrack } from '../scenes/SleepWindow'
import { DAYLIGHT_STEPS, stepNearest, sunPosition } from '../scenes/SunArc'

// jsdom has no PointerEvent, and without one the coordinates on a fired
// pointer event are dropped. A MouseEvent carries them.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? 'mouse'
    }
  }
  ;(window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent = PointerEventPolyfill
}

function Harness({ id, start = {}, spy }: { id: string; start?: Partial<ConsultAnswers>; spy?: (a: ConsultAnswers) => void }) {
  const [answers, setAnswers] = useState<ConsultAnswers>({ ...EMPTY_ANSWERS, ...start })
  return (
    <SceneRenderer
      scene={SCENES.find((s) => s.id === id)!}
      answers={answers}
      comfort={false}
      order={SCENES.map((s) => s.id)}
      onEdit={() => undefined}
      onAnswer={(patch) => {
        const next = { ...answers, ...patch }
        setAnswers(next)
        spy?.(next)
      }}
    />
  )
}

/** Give an element a layout box, since jsdom lays nothing out. */
function box(el: Element, width: number, height: number) {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) })
}

function drag(el: Element, points: [number, number][]) {
  const [first, ...rest] = points
  fireEvent.pointerDown(el, { pointerId: 1, clientX: first[0], clientY: first[1], button: 0 })
  for (const [x, y] of rest) fireEvent.pointerMove(el, { pointerId: 1, clientX: x, clientY: y })
  fireEvent.pointerUp(el, { pointerId: 1 })
}

describe('C5 charge dial', () => {
  it('maps the battery to 1–10, never 0', () => {
    expect(levelAt(0)).toBe(1)
    expect(levelAt(0.05)).toBe(1)
    expect(levelAt(0.35)).toBe(4)
    expect(levelAt(1)).toBe(10)
  })

  it('changes its word as it fills', () => {
    expect([1, 4, 5, 8, 10].map(energyWord)).toEqual(['Running on empty', 'Pretty flat', 'Getting by', 'Pretty charged', 'Buzzing'])
  })

  it('works by drag', () => {
    const spy = jest.fn()
    render(<Harness id="energy" spy={spy} />)
    const dial = screen.getByRole('slider', { name: 'Afternoon energy' })
    box(dial, 300, 90)
    drag(dial, [[30, 40], [120, 40], [200, 40]])
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ energy: 7 }))
    expect(dial).toHaveAttribute('aria-valuetext', '7 out of 10, pretty charged')
  })

  it('works by tap', () => {
    const spy = jest.fn()
    render(<Harness id="energy" spy={spy} />)
    const dial = screen.getByRole('slider')
    box(dial, 300, 90)
    drag(dial, [[100, 40]])
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ energy: 4 }))
  })

  it('works by keyboard arrows', () => {
    const spy = jest.fn()
    render(<Harness id="energy" start={{ energy: 5 }} spy={spy} />)
    const dial = screen.getByRole('slider')
    fireEvent.keyDown(dial, { key: 'ArrowRight' })
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ energy: 6 }))
    fireEvent.keyDown(dial, { key: 'End' })
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ energy: 10 }))
    fireEvent.keyDown(dial, { key: 'ArrowUp' })
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe('C6 sleep window', () => {
  const night = { bed: 23 * 60, wake: 7 * 60, quality: null }

  it('reads the bar from 20:00 to 12:00', () => {
    expect(toTrack(20 * 60)).toBe(0)
    expect(toTrack(12 * 60)).toBe(TRACK_SPAN)
    expect(fromTrack(toTrack(23 * 60 + 30))).toBe(23 * 60 + 30)
  })

  it('keeps the handles from crossing', () => {
    const w = moveHandle(night, 'bed', toTrack(9 * 60))
    expect(toTrack(w.wake) - toTrack(w.bed)).toBe(MIN_GAP)
    const v = moveHandle(night, 'wake', 0)
    expect(toTrack(v.wake) - toTrack(v.bed)).toBe(MIN_GAP)
  })

  it('keeps both handles on the bar', () => {
    expect(toTrack(moveHandle(night, 'bed', -500).bed)).toBe(0)
    expect(toTrack(moveHandle(night, 'wake', 5000).wake)).toBe(TRACK_SPAN)
  })

  it('moves in quarter hours', () => {
    expect(moveHandle(night, 'bed', toTrack(22 * 60 + 7)).bed).toBe(22 * 60)
    expect(moveHandle(night, 'bed', toTrack(22 * 60 + 8)).bed).toBe(22 * 60 + 15)
  })

  it('always shows the right hours, across midnight', () => {
    for (let bed = 0; bed <= TRACK_SPAN - MIN_GAP; bed += 45) {
      for (let wake = bed + MIN_GAP; wake <= TRACK_SPAN; wake += 45) {
        expect(sleepHours({ bed: fromTrack(bed), wake: fromTrack(wake), quality: null })).toBe((wake - bed) / 60)
      }
    }
  })

  it('drags the nearer handle and counts the hours live', () => {
    render(<Harness id="sleep" />)
    const bar = screen.getByRole('slider', { name: 'Bedtime' }).parentElement!
    box(bar, 320, 100)
    // 23:00 sits at 60px; 07:00 at 220px. Grab near the wake handle, pull it to 08:00 (240px).
    drag(bar, [[215, 50], [240, 50]])
    expect(screen.getByRole('slider', { name: 'Wake-up' })).toHaveAttribute('aria-valuetext', '08:00')
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('moves each handle by keyboard, a quarter hour at a time', () => {
    const spy = jest.fn()
    render(<Harness id="sleep" spy={spy} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Bedtime' }), { key: 'ArrowLeft' })
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ sleep: expect.objectContaining({ bed: 22 * 60 + 45 }) }))
  })

  it('rates quality in one tap and keeps the window', () => {
    const spy = jest.fn()
    render(<Harness id="sleep" start={{ sleep: { bed: 1380, wake: 390, quality: null } }} spy={spy} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Restless' }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ sleep: { bed: 1380, wake: 390, quality: 'broken' } }))
  })
})

describe('C7 sun arc', () => {
  it('has four clear steps, rising along the arc', () => {
    expect(DAYLIGHT_STEPS).toHaveLength(4)
    const ys = DAYLIGHT_STEPS.map((_, i) => sunPosition(i).y)
    expect([...ys].sort((a, b) => b - a)).toEqual(ys)
  })

  it('snaps a drag to the nearest step', () => {
    for (let i = 0; i < 4; i++) {
      const p = sunPosition(i)
      expect(stepNearest(p.x + 4, p.y - 3)).toBe(i)
    }
  })

  it('works with the keyboard', () => {
    const spy = jest.fn()
    render(<Harness id="daylight" start={{ daylight: 'hardly' }} spy={spy} />)
    const sun = screen.getByRole('slider', { name: 'Daylight' })
    fireEvent.keyDown(sun, { key: 'ArrowRight' })
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ daylight: 'some' }))
    fireEvent.keyDown(sun, { key: 'End' })
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ daylight: 'daily' }))
  })

  it('can be tapped by step instead of dragged', () => {
    render(<Harness id="daylight" />)
    fireEvent.click(screen.getByRole('radio', { name: 'Most days' }))
    expect(screen.getByRole('radio', { name: 'Most days' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('slider', { name: 'Daylight' })).toHaveAttribute('aria-valuetext', 'Most days')
  })

  it('is not answered until touched', () => {
    render(<Harness id="daylight" />)
    expect(screen.getByRole('slider', { name: 'Daylight' })).toHaveAttribute('aria-valuetext', 'Not set')
  })
})
