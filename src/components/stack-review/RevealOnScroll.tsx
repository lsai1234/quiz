'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Stagger offset in ms applied to the reveal transition. */
  delay?: number
}

/**
 * Fades + lifts its child into view as it scrolls into the viewport — the
 * scene-level polish for the stack list. Reveals immediately under
 * reduced-motion, and a timeout safety net guarantees content is never left
 * hidden if the observer somehow doesn't fire.
 */
export function RevealOnScroll({ children, delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    if (reduced) { setShown(true); return }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect() }
      },
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    // Safety net — never leave a card stuck at opacity 0.
    const t = setTimeout(() => { setShown(true); io.disconnect() }, 1500)
    return () => { io.disconnect(); clearTimeout(t) }
  }, [reduced])

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(10px)',
        transition: reduced ? 'none' : `opacity 0.5s ease ${delay}ms, transform 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}
