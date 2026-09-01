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
  // Hidden on terminal screens (e.g. checkout success) where the plan scene no
  // longer exists — detected by the #scene-plan anchor leaving the DOM.
  const [visible, setVisible] = useState(true)
  const [reduced, setReduced] = useState(false)
  /*
   * Retracted while reading down the page.
   *
   * The rail floats over the content — that is what lets it stay reachable —
   * and on a phone that means it sits on top of whatever is at the top of the
   * viewport. Scrolling down through the product cards, it covered the price
   * and the first line of the description of the card being read.
   *
   * So it gets out of the way in the direction where nobody is looking for it,
   * and comes straight back on the first upward scroll, which is the gesture
   * somebody makes when they want to go somewhere else. Reduced motion keeps it
   * pinned rather than animating it in and out.
   */
  const [retracted, setRetracted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    let frame = 0
    let lastY = typeof window === 'undefined' ? 0 : window.scrollY
    const compute = () => {
      frame = 0
      const y = window.scrollY
      // A small threshold, so a thumb resting on the page does not flicker it.
      if (Math.abs(y - lastY) > 6) {
        setRetracted(y > lastY && y > 120)
        lastY = y
      }
      let current = 0
      SCENES.forEach((s, i) => {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top <= 90) current = i
      })
      setActive(current)
      setVisible(!!document.getElementById('scene-plan'))
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(compute) }
    compute()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    // Structural changes only (childList) so the success screen swapping in/out
    // re-runs the check; attribute mutations from GSAP tweens are ignored.
    const mo = new MutationObserver(schedule)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      mo.disconnect()
    }
  }, [])

  const go = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })

  if (!mounted || !visible) return null

  return createPortal(
    /*
     * `top-3` was measured from the top of the VIEWPORT, which on a notched
     * phone is behind the status bar — the rail sat under the clock. The inset
     * is the device's own answer to where content may start; the 0.75rem is the
     * gap we wanted on a screen that has no notch.
     */
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
        transform: retracted && !reduced ? 'translateY(-160%)' : 'translateY(0)',
        opacity: retracted && !reduced ? 0 : 1,
        transition: reduced ? undefined : 'transform 0.25s ease, opacity 0.2s ease',
      }}
    >
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
