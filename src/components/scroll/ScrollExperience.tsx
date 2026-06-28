'use client'

import { useEffect, useState } from 'react'
import { Act1Hero } from './Act1Hero'
import { Act2Quiz } from './Act2Quiz'
import { Act3Analysis } from './Act3Analysis'
import { Act4Reveal } from './Act4Reveal'
import { Act5Bundle } from './Act5Bundle'

type Act = 1 | 2 | 3 | 4 | 5

const TRANSITIONS: Record<Act, string> = {
  1: 'animate-[fade-in_0.6s_ease_both]',
  2: 'animate-[slide-from-right_0.5s_cubic-bezier(0.22,1,0.36,1)_both]',
  // Act 3 enters with no wrapper fade so the charge rail can morph seamlessly
  // into the machine battery across the Act 2 -> Act 3 boundary.
  3: '',
  4: 'animate-[slide-from-right_0.5s_cubic-bezier(0.22,1,0.36,1)_both]',
  5: 'animate-[slide-from-right_0.5s_cubic-bezier(0.22,1,0.36,1)_both]',
}

export function ScrollExperience() {
  const [act, setAct] = useState<Act>(1)
  const [animKey, setAnimKey] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  function goTo(next: Act) {
    setAct(next)
    setAnimKey((k) => k + 1)
    window.scrollTo(0, 0)
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div key={animKey} className={TRANSITIONS[act]}>
        {act === 1 && <Act1Hero onEnterQuiz={() => goTo(2)} reducedMotion={reducedMotion} />}
        {act === 2 && <Act2Quiz onComplete={() => goTo(3)} reducedMotion={reducedMotion} />}
        {act === 3 && <Act3Analysis onComplete={() => goTo(4)} reducedMotion={reducedMotion} />}
        {act === 4 && <Act4Reveal reducedMotion={reducedMotion} />}
        {act === 5 && <Act5Bundle reducedMotion={reducedMotion} />}
      </div>
    </div>
  )
}
