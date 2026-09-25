'use client'

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * Direct manipulation for the consult's drag widgets: the battery, the sleep
 * window, the sun.
 *
 * Pointer events cover mouse, touch and pen in one path. The pointer is
 * captured on press, so a thumb that slides off the element keeps dragging
 * rather than dropping the handle. Positions are reported relative to the
 * element's box, as 0–1 on each axis, on every move — the widget writes them
 * straight into its answer, and while `dragging` is true it turns its own
 * transitions off, so the thing under the finger follows it with no lag.
 */

export interface DragPoint {
  /** 0 at the left edge, 1 at the right. Clamped. */
  x: number
  /** 0 at the top edge, 1 at the bottom. Clamped. */
  y: number
  /** Unclamped pixel offsets from the element's top-left, for geometry that needs them. */
  px: number
  py: number
  width: number
  height: number
}

interface Options {
  onMove: (point: DragPoint, phase: 'start' | 'move') => void
  onEnd?: () => void
}

const clamp = (v: number) => Math.min(1, Math.max(0, v))

export function pointFrom(el: Element, clientX: number, clientY: number): DragPoint | null {
  // An event with no coordinates (a synthetic one, an odd assistive tech) is
  // ignored rather than turned into NaN and written into an answer.
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
  const r = el.getBoundingClientRect()
  const width = r.width || 1
  const height = r.height || 1
  const px = clientX - r.left
  const py = clientY - r.top
  return { x: clamp(px / width), y: clamp(py / height), px, py, width, height }
}

export function useDrag<T extends Element>({ onMove, onEnd }: Options) {
  const ref = useRef<T>(null)
  const [dragging, setDragging] = useState(false)
  const active = useRef<number | null>(null)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<T>) => {
      if (!ref.current || (e.pointerType === 'mouse' && e.button !== 0)) return
      active.current = e.pointerId
      try {
        ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
      } catch {
        // Capture is a nicety; without it the drag still works while on target.
      }
      setDragging(true)
      const point = pointFrom(ref.current, e.clientX, e.clientY)
      if (point) onMove(point, 'start')
    },
    [onMove],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<T>) => {
      if (active.current !== e.pointerId || !ref.current) return
      const point = pointFrom(ref.current, e.clientX, e.clientY)
      if (point) onMove(point, 'move')
    },
    [onMove],
  )

  const finish = useCallback(
    (e: ReactPointerEvent<T>) => {
      if (active.current !== e.pointerId) return
      active.current = null
      setDragging(false)
      onEnd?.()
    },
    [onEnd],
  )

  return {
    ref,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  }
}
