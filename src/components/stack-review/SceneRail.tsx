'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const ACCENT = '#00D4FF'
// The old pill's colour, rgba(18,18,20,0.82), at full opacity.
const BAR_BG = 'rgb(18,18,20)'
const HAIRLINE = '1px solid rgba(255,255,255,0.1)'

/**
 * The bar's height below the safe-area inset. Act4Reveal reserves the same
 * space at the top of the page, so the You card starts below the bar rather
 * than under it. The scene anchors' `scroll-mt-[calc(env(safe-area-inset-top)+4.5rem)]`
 * is this plus a 1rem gap.
 */
export const SCENE_RAIL_HEIGHT = '3.5rem'

/** The space the bar takes at the top of the screen: the inset plus the bar. */
export const SCENE_RAIL_RESERVE = `calc(env(safe-area-inset-top, 0px) + ${SCENE_RAIL_HEIGHT})`

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
 * The line a scene's top has to reach to count as the current one: where a
 * jump to it lands (the anchor's own scroll margin, which carries the
 * safe-area inset), plus a little slack for a hand-scrolled page. With no
 * margin to read it falls back to the anchors' 4.5rem.
 */
function landingLine(el: HTMLElement): number {
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop)
  return (Number.isFinite(margin) ? margin : 72) + 18
}

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
   * The bar is pinned over the top of the viewport — that is what lets it stay
   * reachable — and on a phone that strip is part of whatever is being read.
   *
   * So it gets out of the way in the direction where nobody is looking for it,
   * and comes straight back on the first upward scroll, which is the gesture
   * somebody makes when they want to go somewhere else. That is the usual
   * header pattern, and it reads as one now the bar is solid and full width:
   * what it covers on the way back is behind it, not showing around a pill.
   * Reduced motion keeps it pinned rather than animating it in and out.
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
        if (el && el.getBoundingClientRect().top <= landingLine(el)) current = i
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
     * A full-width solid bar, not a floating pill. The pill was centred and 82%
     * opaque, so the page showed around and through it, and a line near the
     * top read as half covered. A solid bar with a hairline edge reads as the
     * top of the screen, and Act4Reveal reserves its height so nothing starts
     * underneath it. The safe-area inset is padding, so on a notched phone the
     * bar's colour runs up behind the status bar and the buttons sit below it.
     */
    <div
      data-scene-rail
      className="fixed inset-x-0 top-0 z-40"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: BAR_BG,
        transform: retracted && !reduced ? 'translateY(-100%)' : 'translateY(0)',
        opacity: retracted && !reduced ? 0 : 1,
        transition: reduced ? undefined : 'transform 0.25s ease, opacity 0.2s ease',
      }}
    >
      <div
        className="flex items-center justify-center px-4"
        style={{ height: SCENE_RAIL_HEIGHT, borderBottom: HAIRLINE }}
      >
        <div className="flex items-center gap-1 rounded-full p-1" style={{ border: HAIRLINE }}>
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
      </div>
    </div>,
    document.body,
  )
}
