'use client'

import { useEffect, useState } from 'react'
import { useQuizStore } from '@/lib/store'
import { QuizV2 } from './QuizV2'
import { Act3Analysis } from '@/components/scroll/Act3Analysis'
import { Act4Reveal } from '@/components/scroll/Act4Reveal'

/**
 * The adaptive interview as a page of its own, at `/quizv2`.
 *
 * The same three acts a customer gets on the homepage — interview, analysis,
 * results — minus the hero, so the quiz starts on the first tap rather than
 * after a scroll. Two audiences for that: the founders reviewing v2 without
 * switching it on, and the e2e suite, which should not have to drive an
 * animated hero to reach the thing under test.
 *
 * It always renders v2 regardless of the experiment setting. That is the point
 * of the URL, and it is safe because being here is a deliberate act — the split
 * that decides what customers see lives in `ScrollExperience`, on `/`.
 *
 * The run always starts clean. A half-finished interview resumed from a
 * previous visit is exactly the wrong thing on a review URL, where the reviewer
 * has come to see the quiz from the top.
 */

type Act = 2 | 3 | 4

export function QuizV2Experience() {
  const [act, setAct] = useState<Act>(2)
  const [animKey, setAnimKey] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    // Rehydrate first, then clear: the persisted store would otherwise land
    // after the reset and resurrect the previous run.
    void useQuizStore.persist.rehydrate()
    useQuizStore.getState().reset()
    setReady(true)
  }, [])

  function goTo(next: Act) {
    setAct(next)
    setAnimKey((k) => k + 1)
    window.scrollTo(0, 0)
  }

  // `min-h-screen` is `100vh` — the LARGE viewport, which in the browsers this
  // whole measurement exists for is taller than the window. That would leave the
  // page scrollable behind a shell that is exactly window-height, and scrolling
  // it would carry the Continue button off the bottom. Same measured value as
  // the shell, so there is nothing to scroll.
  const fill = { minHeight: 'var(--app-height, 100dvh)' }

  if (!ready) return <div className="bg-[#0A0A0A]" style={fill} />

  return (
    <div className="overflow-x-hidden" style={fill}>
      <div key={animKey} className={act === 3 ? '' : 'animate-[fade-in_0.4s_ease_both]'}>
        {act === 2 && <QuizV2 onComplete={() => goTo(3)} reducedMotion={reducedMotion} />}
        {act === 3 && <Act3Analysis onComplete={() => goTo(4)} reducedMotion={reducedMotion} />}
        {act === 4 && <Act4Reveal reducedMotion={reducedMotion} />}
      </div>
    </div>
  )
}
