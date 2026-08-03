'use client'

import { useEffect, useState } from 'react'
import { useQuizStore, hasQuizProgress } from '@/lib/store'
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
  // Resume-prompt state. `hydrated` flips once the persisted store has been
  // rehydrated post-mount (store uses skipHydration to avoid an SSR mismatch),
  // and the prompt is dismissed once the user chooses either way.
  const [hydrated, setHydrated] = useState(false)
  const [resumeDismissed, setResumeDismissed] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    void useQuizStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  function goTo(next: Act) {
    setAct(next)
    setAnimKey((k) => k + 1)
    window.scrollTo(0, 0)
  }

  const canResume = hydrated && !resumeDismissed && act === 1 && hasQuizProgress()

  return (
    <div className="min-h-screen overflow-x-hidden">
      {canResume && (
        <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3">
          <div
            className="flex items-center gap-3 max-w-md w-full rounded-2xl border px-4 py-3 backdrop-blur-md"
            style={{ background: 'rgba(10,10,10,0.85)', borderColor: 'rgba(0,212,255,0.3)', boxShadow: '0 10px 40px -12px rgba(0,212,255,0.45)' }}
          >
            <p className="flex-1 text-[13px] text-white/85 leading-snug">
              Pick up where you left off?
            </p>
            <button
              onClick={() => { setResumeDismissed(true); goTo(2) }}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-[#0A0A0A] bg-[#00D4FF] active:scale-95"
            >
              Resume
            </button>
            <button
              onClick={() => { useQuizStore.getState().reset(); setResumeDismissed(true) }}
              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white/60 hover:text-white/90"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}
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
