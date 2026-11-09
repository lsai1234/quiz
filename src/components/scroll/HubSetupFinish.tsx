'use client'

import { useEffect, useState } from 'react'
import { useQuizStore } from '@/lib/store'
import { dayFromQuiz } from '@/lib/routine'
import { HUB_PLAN_COPY as C } from '@/lib/hub-plan/copy'

/**
 * The end of the quiz in hub mode (`/?then=hub`, after joining the hub on its
 * own): instead of the results page, their day, goals, first name and how they
 * train go to their account for the training plan's first setup, and they land
 * in the hub. Nothing about their health is sent.
 */
export function HubSetupFinish() {
  const [failed, setFailed] = useState(false)

  // A test view (`?test=quiz`): nothing is saved; say what would happen.
  const [test] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('test') === 'quiz')

  useEffect(() => {
    if (test) return
    const a = useQuizStore.getState().answers
    const seed = {
      day: dayFromQuiz(a),
      goals: [a.primaryGoal, ...(a.goals ?? [])].filter(Boolean),
      firstName: a.name ?? null,
      stackName: null,
      training: { types: a.trainingType ?? [], experience: a.trainingExperience ?? null, focus: a.trainingFocus ?? null },
    }
    let live = true
    fetch('/api/hub/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed }) })
      .then((res) => {
        if (!live) return
        if (res.ok) window.location.assign('/myhub?welcome=1')
        else setFailed(true)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [test])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-[#0A0A0A]" data-hub-setup-finish>
      {test ? (
        <>
          <p className="text-[15px] text-white/85 max-w-sm leading-snug">Test view: a new member’s answers would be saved here, and they’d land in their hub with their training plan ready to build. Nothing was saved.</p>
          <a href="/api/portal/test-views/open?view=hub-only-paying" className="mt-5 px-5 py-3 rounded-xl text-[14px] font-bold text-[#0A0A0A] bg-[#00D4FF]">
            See a sample hub member
          </a>
        </>
      ) : failed ? (
        <>
          <p className="text-[15px] text-white/85 max-w-sm leading-snug">{C.setupFailed}</p>
          <a href="/myhub" className="mt-5 px-5 py-3 rounded-xl text-[14px] font-bold text-[#0A0A0A] bg-[#00D4FF]">
            {C.setupGoToHub}
          </a>
        </>
      ) : (
        <>
          <span aria-hidden className="h-10 w-10 rounded-full border-2 border-white/15 border-t-[#00D4FF] animate-spin" />
          <p className="mt-5 text-[15px] font-semibold text-white/85" role="status">
            {C.setupSaving}
          </p>
        </>
      )}
    </div>
  )
}
