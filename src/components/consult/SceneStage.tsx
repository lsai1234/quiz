'use client'

import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { sceneEnterClass, type Direction } from '@/lib/consult/motion'
import { useReducedMotion } from '@/hooks/useReducedMotion'

/**
 * Scene transitions (build S7).
 *
 * Each scene is keyed, so a change of scene mounts a fresh one that slides in
 * from the side you're travelling towards — from the right going forward, from
 * the left going back. The outgoing scene leaves instantly rather than
 * animating out: two full-screen scenes on top of each other for half a second
 * is where the flicker and the layout jump come from, and the incoming slide
 * alone reads as movement.
 *
 * On arrival, focus moves to the new question, so a screen reader announces it
 * and keyboard users start from the top of the scene. The very first scene
 * does not steal focus — nobody has navigated yet. The page also returns to
 * the top, so a scene is never entered half-scrolled.
 */

interface Props {
  sceneKey: string
  direction: Direction
  headingRef: RefObject<HTMLElement | null>
  children: ReactNode
}

export function SceneStage({ sceneKey, direction, headingRef, children }: Props) {
  const reduced = useReducedMotion()
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    window.scrollTo({ top: 0 })
    headingRef.current?.focus({ preventScroll: true })
  }, [sceneKey, headingRef])

  return (
    <div key={sceneKey} className={sceneEnterClass(direction, reduced)} data-scene={sceneKey} data-direction={direction}>
      {children}
    </div>
  )
}
