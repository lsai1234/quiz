'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const ACCENT = '#00D4FF'

/**
 * The three scenes of Act 4, in scroll order. Each maps to a DOM anchor id
 * rendered by Act4Reveal (identity) and StackReviewPage (stack, plan).
 */
const SCENES = [
  { id: 'scene-you', label: 'You' },
  { id: 'scene-stack', label: 'Stack' },
  { id: 'scene-plan', label: 'Plan' },
] as const

/**
 * A pinned segmented rail — You · Stack · Plan — so the user always knows where
 * they are in the reveal and can jump between scenes. Portaled to <body> so its
 * fixed position isn't captured by Act 4's transformed/overflow-clipped wrappers
 * (the same reason the sticky checkout bar is portaled).
 */
export function SceneRail() {
  const [mounted, setMounted] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    let frame = 0
    const compute = () => {
      frame = 0
      let current = 0
      SCENES.forEach((s, i) => {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top <= 90) current = i
      })
      setActive(current)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(compute) }
    compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  if (!mounted) return null

  return createPortal(
    <div className="fixed top-3 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
      <div
        className="pointer-events-auto flex items-center gap-1 rounded-full p-1"
        style={{
          background: 'rgba(18,18,20,0.82)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 8px 24px -10px rgba(0,0,0,0.6)',
        }}
      >
        {SCENES.map((s, i) => {
          const isActive = active === i
          return (
            <button
              key={s.id}
              onClick={() => go(s.id)}
              aria-current={isActive ? 'true' : undefined}
              className="px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-all"
              style={{
                fontFamily: 'var(--font-display)',
                color: isActive ? '#0A0A0A' : 'rgba(255,255,255,0.62)',
                background: isActive ? ACCENT : 'transparent',
              }}
            >
              {s.label}
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
