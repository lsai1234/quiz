import { act, render } from '@testing-library/react'
import { Amp } from '../Amp'
import { attachLife } from '../ampLife'
import { AMP_NEXT_EVENT } from '@/lib/consult/amp-rig'

/** Amp, alive (plan Phase 7.2): the SVG face, its poses, and its life. */
const face = (c: HTMLElement) => c.querySelector('.amp-face')!
const amp = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-amp-state]')!

describe('the face', () => {
  it('draws Amp in SVG: his mark, two eyes with pupils, a mouth', () => {
    const { container } = render(<Amp state="idle" />)
    expect(amp(container)).toHaveAttribute('data-amp-drawn', 'svg')
    expect(face(container).querySelector('.amp-mark')).not.toBeNull()
    expect(face(container).querySelectorAll('.amp-eye')).toHaveLength(2)
    expect(face(container).querySelectorAll('.amp-pupil')).toHaveLength(2)
    expect(face(container).querySelector('.amp-mouth')).not.toBeNull()
  })

  it('keeps every state, each with its own pose', () => {
    for (const state of ['idle', 'watching', 'thinking', 'reading', 'calm', 'charged', 'hunch'] as const) {
      const { container, unmount } = render(<Amp state={state} />)
      expect(amp(container)).toHaveAttribute('aria-label', `Amp, ${state}`)
      const eye = amp(container).style.getPropertyValue('--amp-eye')
      expect([state, eye]).toEqual([state, state === 'calm' ? '0.55' : state === 'hunch' ? '0.65' : '1'])
      // Charged: happy arcs for eyes.
      expect([state, face(container).querySelectorAll('.amp-eye').length]).toEqual([state, state === 'charged' ? 0 : 2])
      unmount()
    }
  })

  it('takes the rig: lids, glow and mood', () => {
    const { container, rerender } = render(<Amp state="watching" rig={{ droop: 1, glow: 0.7 }} />)
    expect(amp(container).style.getPropertyValue('--amp-eye')).toBe('0.45')
    expect(container.querySelector('[data-amp-glow]')).toHaveStyle({ opacity: '0.7' })
    rerender(<Amp state="idle" rig={{ mood: 'curious' }} />)
    expect(amp(container)).toHaveAttribute('data-amp-mood', 'curious')
    // Calm holds still: no mood.
    rerender(<Amp state="calm" rig={{ mood: 'curious' }} />)
    expect(amp(container)).not.toHaveAttribute('data-amp-mood')
  })

  it('jitters as a cup is added, and sparks at a confirmed hunch', () => {
    const { container, rerender } = render(<Amp state="idle" reaction={{ name: 'jitter', id: 1 }} />)
    expect(amp(container)).toHaveAttribute('data-amp-reaction', 'jitter')
    expect((face(container) as SVGElement).style.animation).toMatch(/^amp-jitter /)
    rerender(<Amp state="idle" reaction={{ name: 'eureka', id: 2 }} />)
    expect(container.querySelector('.amp-spark')).not.toBeNull()
  })
})

describe('his life', () => {
  let el: HTMLElement
  let detach: () => void
  const animate = jest.fn()
  const original = window.matchMedia
  /** jsdom has no PointerEvent: a MouseEvent carries the coordinates, as a browser's would. */
  const point = (type: string, x: number, y: number, target: EventTarget = window) => target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }))
  beforeEach(() => {
    jest.useFakeTimers()
    // The rendered Amp holds still (reduced motion), so only the life under test moves him.
    window.matchMedia = ((q: string) => ({ ...original(q), matches: q.includes('reduce') })) as typeof window.matchMedia
    animate.mockClear()
    ;(Element.prototype as unknown as { animate: unknown }).animate = animate
    const { container } = render(<div className="amp-consult"><Amp state="idle" size="lg" /></div>)
    el = amp(container)
    el.getBoundingClientRect = () => ({ left: 100, top: 100, width: 80, height: 80, right: 180, bottom: 180, x: 100, y: 100, toJSON: () => ({}) })
    detach = attachLife(el)
  })
  afterEach(() => {
    detach()
    window.matchMedia = original
    jest.useRealTimers()
    delete (Element.prototype as { animate?: unknown }).animate
  })

  it('follows the finger with his eyes, then looks back to the middle', () => {
    point('pointermove', 400, 140)
    act(() => void jest.advanceTimersByTime(20))
    expect(Number(el.style.getPropertyValue('--amp-gx'))).toBeCloseTo(1, 1)
    expect(Number(el.style.getPropertyValue('--amp-gy'))).toBeCloseTo(0, 1)
    point('pointermove', 140, 160)
    act(() => void jest.advanceTimersByTime(20))
    expect(Number(el.style.getPropertyValue('--amp-gy'))).toBeCloseTo(0.14, 1)
    act(() => void jest.advanceTimersByTime(2000))
    expect(el.style.getPropertyValue('--amp-gx')).toBe('')
  })

  it('blinks every few seconds', () => {
    const set = jest.spyOn(el, 'setAttribute')
    const removed = jest.spyOn(el, 'removeAttribute')
    act(() => void jest.advanceTimersByTime(20_000))
    const closes = set.mock.calls.filter(([name]) => name === 'data-blink').length
    expect(closes).toBeGreaterThanOrEqual(3)
    // Every blink opens again (the last may still be mid-blink when the clock stops).
    expect(removed.mock.calls.filter(([name]) => name === 'data-blink').length).toBeGreaterThanOrEqual(closes - 1)
  })

  it('squashes on a tap and stretches on Next, on top of his pose', () => {
    point('pointerdown', 10, 10, document.querySelector('.amp-consult')!)
    window.dispatchEvent(new Event(AMP_NEXT_EVENT))
    expect(animate).toHaveBeenCalledTimes(2)
    expect(animate.mock.calls[0][1]).toMatchObject({ composite: 'add', easing: expect.stringMatching(/^linear\(/) })
    expect(animate.mock.calls[1][0][2].transform).toMatch(/translateY\(-10%\)/)
  })

  it('lets go of everything when detached', () => {
    detach()
    point('pointermove', 400, 140)
    window.dispatchEvent(new Event(AMP_NEXT_EVENT))
    act(() => void jest.advanceTimersByTime(20_000))
    expect(el.style.getPropertyValue('--amp-gx')).toBe('')
    expect(el.hasAttribute('data-blink')).toBe(false)
    expect(animate).not.toHaveBeenCalled()
    detach = () => {}
  })
})
