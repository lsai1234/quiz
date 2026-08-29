'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuizStore } from '@/lib/store'
import { levelForStackPreference } from '@/lib/stack-blueprint/pricing'
import { GOALS_DATA, GOAL_LABELS, TRACK_CARDS, WELLBEING_DATA } from '@/lib/quiz-goals'
import { AnswerOption } from '@/components/quiz/AnswerOption'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import { ChargeRail } from '@/components/quiz/ChargeRail'
import { Reflection } from '@/components/quiz/v2/Reflection'
import { funnel } from '@/lib/analytics/quiz'
import { emptyInterview, type BankQuestion, type InterviewState } from '@/lib/quiz-v2/types'
import { answerQuestion, previousQuestionId, rewindTo, setForm, setGoals, setTrack } from '@/lib/quiz-v2/interview'
import { endedEarly, planNext } from '@/lib/quiz-v2/planner'
import { projectAnswers } from '@/lib/quiz-v2/project'
import { questionById } from '@/lib/quiz-v2/bank'
import { DRIVERS, rankedDrivers } from '@/lib/quiz-v2/drivers'
import { useSteer } from '@/lib/quiz-v2/steer'
import { useQuizArmState } from '@/lib/experiments/client'
import type { StackIdentity, Goal, AgeBracket, Gender, WeightBand } from '@/lib/types'

/**
 * The adaptive interview — v2's Act 2.
 *
 * Same chrome as v1 on purpose: the same charge rail, the same answer control,
 * the same header and footer. If the two arms looked different, a conversion
 * gap could be coming from the visual design rather than the questions, and the
 * experiment would answer nothing. What differs is what it asks and how it
 * decides.
 *
 * ── Nothing here ever awaits the network ────────────────────────────────────
 * The next question comes from `planNext`, which is pure and synchronous. The
 * AI steer runs one question ahead in the background and is consulted only if
 * it has already landed. There is deliberately no loading state on a question,
 * because there is nothing to load — see `steer.ts`.
 */

/** driverId → the plain-language line, for the review recap. */
const DRIVER_HEARD: Record<string, string> = Object.fromEntries(
  Object.entries(DRIVERS).map(([id, meta]) => [id, meta.heard]),
)

const FALLBACK_IDENTITY: StackIdentity = {
  name: 'Peak Protocol',
  archetype: 'The Performance Athlete',
  description:
    'Your stack is built around output and recovery. These selections may suit your goals and are commonly used by people with similar profiles.',
  focusAreas: ['Performance Output', 'Faster Recovery', 'Daily Energy'],
  routineFitScore: 84,
}

function CHRGDIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="#00D4FF" />
    </svg>
  )
}

interface Props {
  onComplete: () => void
  reducedMotion: boolean
}

export function QuizV2({ onComplete, reducedMotion }: Props) {
  const { interview, setInterview, setAnswers, setIdentity, setStackLevel, setStackReady } = useQuizStore()
  const { budget: budgetConfig, aiSteer } = useQuizArmState()

  // The interview lives in the store so a refresh resumes it. Seeded on first
  // mount from whichever budget the founder has set for this track.
  const state: InterviewState = useMemo(
    () => interview ?? emptyInterview(budgetConfig.performance),
    [interview, budgetConfig.performance],
  )

  const update = useCallback((next: InterviewState) => setInterview(next), [setInterview])

  const { prefer, reflection, prefetch } = useSteer(state, aiSteer)

  const planned = useMemo(() => planNext(state, undefined, prefer), [state, prefer])
  const current = planned.question
  const onReview = current === null

  const [multiPicks, setMultiPicks] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [animKey, setAnimKey] = useState(0)
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)

  // Local mirrors for the compound personal screen, committed on Continue.
  const [localName, setLocalName] = useState(state.form.name)
  const [localAge, setLocalAge] = useState<AgeBracket | ''>(state.form.ageBracket ?? '')
  const [localGender, setLocalGender] = useState<Gender | ''>(state.form.gender ?? '')
  const [localWeight, setLocalWeight] = useState<WeightBand | ''>(state.form.weightBand ?? '')

  // ── Funnel ────────────────────────────────────────────────────────────────
  const startTsRef = useRef(0)
  const stepEnterRef = useRef(0)
  const currentRef = useRef<{ id: string; index: number }>({ id: 'goals', index: 0 })
  const startedRef = useRef(false)
  const completedRef = useRef(false)

  const index = state.asked.length
  const total = state.budget

  useEffect(() => {
    startTsRef.current = performance.now()
    if (!startedRef.current) {
      startedRef.current = true
      funnel.start({ track: state.track, drinksMode: false })
    }
    const onLeave = () => {
      if (completedRef.current) return
      funnel.abandon({
        lastStepId: currentRef.current.id,
        index: currentRef.current.index,
        msTotal: Math.round(performance.now() - startTsRef.current),
      })
    }
    window.addEventListener('pagehide', onLeave)
    return () => window.removeEventListener('pagehide', onLeave)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentId = current?.id ?? 'review'
  useEffect(() => {
    currentRef.current = { id: currentId, index }
    stepEnterRef.current = performance.now()
    funnel.stepView({ stepId: currentId, index, total, track: state.track, drinksMode: false })
    setMultiPicks(state.picked[currentId] ?? [])
    optionsRef.current?.scrollTo({ top: 0 })
    if (!reducedMotion) {
      const t = setTimeout(() => headingRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  // ── Navigation ────────────────────────────────────────────────────────────

  const clearPending = () => {
    if (pendingRef.current) clearTimeout(pendingRef.current)
    pendingRef.current = null
  }

  const commit = useCallback((next: InterviewState) => {
    clearPending()
    funnel.stepComplete({
      stepId: currentId, index,
      msOnStep: Math.round(performance.now() - stepEnterRef.current),
    })
    setDirection('forward')
    setAnimKey((k) => k + 1)
    update(next)
    // Fire the steer for the question after the one about to render. The next
    // question is drawn from the planner immediately and does not wait for it —
    // this reply is for the decision after that. See `steer.ts`.
    prefetch(next)
  }, [currentId, index, update, prefetch])

  const answerCurrent = useCallback((optionIds: string[]) => {
    if (!current) return
    commit(answerQuestion(state, current, optionIds))
  }, [current, state, commit])

  /** Single-choice: register the tap, then move on a beat later. */
  const pickSingle = (optionId: string) => {
    if (!current) return
    clearPending()
    setMultiPicks([optionId])
    pendingRef.current = setTimeout(() => answerCurrent([optionId]), 300)
  }

  /**
   * Multi-select, with the "None of these" rule.
   *
   * Picking the exclusive option clears everything else; picking anything else
   * clears it. Without that the grid happily accepts "Pregnant or
   * breastfeeding" AND "None of these" at the same time, which is not an answer.
   */
  const toggleMulti = (optionId: string) => {
    const exclusiveId = current?.options.find((o) => o.exclusive)?.id
    setMultiPicks((picks) => {
      if (optionId === exclusiveId) return picks.includes(optionId) ? [] : [optionId]
      const without = picks.filter((p) => p !== exclusiveId)
      return without.includes(optionId)
        ? without.filter((p) => p !== optionId)
        : [...without, optionId]
    })
  }

  const goBack = () => {
    clearPending()
    const prev = previousQuestionId(state, currentId)
    if (!prev) return
    funnel.stepBack({ from: currentId, to: prev, via: 'back' })
    setDirection('back')
    setAnimKey((k) => k + 1)
    update(rewindTo(state, prev))
  }

  /**
   * Jump back from the review screen.
   *
   * Discards everything after the edited answer, because everything after it
   * was chosen *because* of it — the interview asked about sleep only because
   * the user said their mornings were slow. Keeping the downstream answers
   * would leave the recommendation built on a path the user has just told us
   * they are not on. The review screen says so before they tap.
   */
  const editFrom = (questionId: string) => {
    funnel.stepBack({ from: 'review', to: questionId, via: 'edit' })
    setDirection('back')
    setAnimKey((k) => k + 1)
    update(rewindTo(state, questionId))
  }

  const commitPersonal = () => {
    if (!current) return
    const withForm = setForm(state, {
      name: localName.trim(),
      ageBracket: (localAge || null) as AgeBracket | null,
      gender: (localGender || null) as Gender | null,
      weightBand: (localWeight || null) as WeightBand | null,
    })
    commit(answerQuestion(withForm, current, []))
  }

  // ── Finish ────────────────────────────────────────────────────────────────

  const generateStack = useCallback(async (answers: ReturnType<typeof projectAnswers>) => {
    try {
      const { buildStackBlueprint } = await import('@/lib/stack-blueprint')
      const { personaliseBlueprint } = await import('@/lib/stack-blueprint/personalise')
      const { loadCatalogue } = await import('@/lib/catalogue/load')
      // AWAIT the catalogue — building against whatever happens to be in the
      // store yields a stack of ids the shop does not have. Same reasoning as
      // v1; see the note there.
      const { products: catalogueProducts } = await loadCatalogue()
      const base = buildStackBlueprint(answers, catalogueProducts)
      const [identity, blueprint] = await Promise.all([
        fetch('/api/generate-identity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(answers),
        }).then((r) => r.json()).catch(() => FALLBACK_IDENTITY),
        personaliseBlueprint(answers, base, catalogueProducts),
      ])
      setIdentity(identity ?? FALLBACK_IDENTITY)
      setStackLevel(levelForStackPreference(answers.stackPreference))
      useQuizStore.getState().setStackBlueprint(blueprint)
    } catch {
      if (!useQuizStore.getState().identity) setIdentity(FALLBACK_IDENTITY)
    } finally {
      useQuizStore.getState().setStackReady(true)
    }
  }, [setIdentity, setStackLevel])

  const finish = () => {
    completedRef.current = true
    const answers = projectAnswers(state)

    for (const d of rankedDrivers(state.drivers)) {
      funnel.driverResolved({ driverId: d.id, confidence: Math.round(d.weight * 100) / 100 })
    }
    if (endedEarly(state)) {
      funnel.earlyExit({ askedCount: state.asked.length, budget: state.budget })
    }
    funnel.complete({
      track: state.track,
      drinksMode: false,
      goalCount: state.goals.length,
      primaryGoal: state.primaryGoal ?? undefined,
      budget: null,
      msTotal: Math.round(performance.now() - startTsRef.current),
    })

    // Hand the engine the canonical shape. Everything downstream — reveal,
    // pricing, share card, checkout — is untouched by v2 existing.
    setAnswers(answers)
    setStackReady(false)
    setIsGenerating(true)
    void generateStack(answers)
    onComplete()
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const charge = Math.min(92, Math.round(8 + (index / Math.max(1, total)) * 84))
  const [surgeKey, setSurgeKey] = useState(0)
  const prevChargeRef = useRef(charge)
  useEffect(() => {
    if (charge > prevChargeRef.current) setSurgeKey((k) => k + 1)
    prevChargeRef.current = charge
  }, [charge])

  const isGoals = currentId === 'goals'
  const isForm = current?.select === 'form'
  const isMulti = current?.select === 'multi'
  const needsContinue = onReview || isGoals || isForm || isMulti

  const canContinue = (() => {
    if (onReview) return true
    if (isGoals) return !!state.track && state.goals.length > 0
    if (isForm) return !!localAge
    if (isMulti) return multiPicks.length >= (current?.minPicks ?? 0)
    return false
  })()

  const continueNeeds = (() => {
    if (canContinue) return null
    if (isGoals) return state.track ? 'Pick at least one goal' : 'Choose where to start'
    if (isForm) return 'Add your age to continue'
    if (isMulti) return 'Pick at least one'
    return null
  })()

  const slideClass = reducedMotion
    ? ''
    : direction === 'forward'
      ? 'animate-[slide-from-right_0.32s_cubic-bezier(0.22,1,0.36,1)_both]'
      : 'animate-[slide-from-left_0.32s_cubic-bezier(0.22,1,0.36,1)_both]'

  const onContinue = () => {
    if (onReview) { finish(); return }
    if (isForm) { commitPersonal(); return }
    if (isGoals) { commit(answerQuestion(state, current!, [])); return }
    answerCurrent(multiPicks)
  }

  const headerCopy = onReview
    ? { section: 'REVIEW', prompt: 'Here is what we heard.', hint: 'Tap anything to change it.' }
    : { section: current!.section, prompt: current!.prompt, hint: current!.hint }

  return (
    <div className="relative flex flex-col h-[100dvh] bg-[#0A0A0A] overflow-hidden">
      <ChargeRail charge={charge} surgeKey={surgeKey} reducedMotion={reducedMotion} />

      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-0"
        style={{ height: 180, background: 'radial-gradient(120% 100% at 50% 135%, rgba(0,212,255,0.06), transparent 70%)' }}
      />

      {isGenerating && (
        <div className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col items-center justify-center gap-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-[#00D4FF]/20 border-t-[#00D4FF] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center"><CHRGDIcon size={24} /></div>
          </div>
          <div className="text-center">
            <p className="text-xl font-semibold text-white mb-1.5 tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Fully charged
            </p>
            <p className="text-sm text-white/35">Building around what you told us…</p>
          </div>
        </div>
      )}

      {/* Brand + progress */}
      <div className="relative z-20 shrink-0 flex items-center justify-between pl-5 pr-[42px] pt-5 pb-1">
        <div className="flex items-center gap-2.5">
          {index > 0 && (
            <button
              onClick={goBack}
              className="-ml-1 w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white/80 transition-colors"
              aria-label="Back"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <CHRGDIcon size={16} />
          <span className="text-white/40 text-[11px] font-semibold tracking-[0.18em]" style={{ fontFamily: 'var(--font-display)' }}>
            getCHRGD
          </span>
        </div>
        <span className="text-[10px] font-medium tracking-[0.12em] text-white/25 tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
          {onReview ? 'FINAL STEP' : `${index + 1} / ${total}`}
        </span>
      </div>

      {/* Header */}
      <div className="relative z-10 shrink-0 pl-5 pr-[42px] pt-4 pb-4">
        <div key={`h-${currentId}-${animKey}`} className={`max-w-lg mx-auto w-full ${slideClass}`}>
          <span className="text-[10px] font-semibold tracking-[0.26em] uppercase text-white/35 mb-3 block" style={{ fontFamily: 'var(--font-display)' }}>
            {headerCopy.section}
          </span>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.02em] text-white outline-none"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {headerCopy.prompt}
          </h2>
          <p className="text-sm text-white/40 mt-2.5 leading-snug">{headerCopy.hint}</p>

          {/* What the last answer told us. Only ever rendered if it arrived in
              time — it is never waited for, and never shows a placeholder. */}
          {!onReview && index > 0 && <Reflection text={reflection} reducedMotion={reducedMotion} />}

          {index === 0 && (
            <p className="text-[11px] text-white/25 mt-2">
              {total} questions, and they change based on what you say · about a minute
            </p>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="relative z-10 flex-1 min-h-0">
        <div ref={optionsRef} className="absolute inset-0 overflow-y-auto scrollbar-hide pl-5 pr-[42px] pb-5">
          <div key={`o-${currentId}-${animKey}`} className={`max-w-lg mx-auto w-full ${slideClass}`}>

            {isGoals && !state.track && (
              <div className="flex flex-col gap-3">
                {TRACK_CARDS.map(({ id: tid, icon, label, sub }) => (
                  <button
                    key={`track-${tid}`}
                    onClick={() => update(setGoals(setTrack(state, tid), []))}
                    className="group w-full flex items-center gap-4 px-5 py-5 rounded-xl border border-white/[0.08] bg-white/[0.015] text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.04] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40"
                  >
                    <QuizIcon name={icon} size={22} className="shrink-0 text-white/45 transition-colors duration-200 group-hover:text-[#00D4FF]" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-medium text-white" style={{ fontFamily: 'var(--font-display)' }}>{label}</div>
                      <div className="text-[13px] mt-1 text-white/40 leading-snug">{sub}</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="text-white/25 transition-transform duration-200 group-hover:translate-x-0.5">
                      <path d="M8 4L14 10L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {isGoals && state.track && (
              <GoalGrids
                track={state.track}
                goals={state.goals}
                onToggle={(g) => {
                  const next = state.goals.includes(g)
                    ? state.goals.filter((x) => x !== g)
                    : [...state.goals, g]
                  update(setGoals(state, next))
                }}
                onSwitch={() => update(setGoals(setTrack(state, state.track === 'performance' ? 'wellbeing' : 'performance'), []))}
              />
            )}

            {!isGoals && current && current.select === 'single' && (
              <div className="flex flex-col gap-2.5">
                {current.options.map((o) => (
                  <AnswerOption
                    key={`${current.id}-${o.id}`}
                    label={o.label} sub={o.sub} icon={o.icon}
                    selected={multiPicks.includes(o.id)}
                    onClick={() => pickSingle(o.id)}
                  />
                ))}
              </div>
            )}

            {!isGoals && current && current.select === 'multi' && (
              <div>
                <div className="grid grid-cols-2 gap-2.5">
                  {current.options.map((o) => (
                    <AnswerOption
                      key={`${current.id}-${o.id}`}
                      label={o.label} sub={o.sub} icon={o.icon} multi
                      // An exclusive option reads as chosen while nothing is —
                      // so the screen always shows an answer rather than a blank
                      // grid the reader has to work out is a valid state.
                      selected={
                        multiPicks.includes(o.id) ||
                        (!!o.exclusive && multiPicks.length === 0)
                      }
                      onClick={() => toggleMulti(o.id)}
                    />
                  ))}
                </div>
                {current.reassurance && (
                  <p className="text-[12px] text-white/30 leading-snug mt-3 px-1">
                    {current.reassurance}
                  </p>
                )}
              </div>
            )}

            {isForm && (
              <PersonalFields
                name={localName} onName={setLocalName}
                age={localAge} onAge={setLocalAge}
                gender={localGender} onGender={setLocalGender}
                weight={localWeight} onWeight={setLocalWeight}
                onSubmit={() => { if (canContinue) onContinue() }}
              />
            )}

            {onReview && <ReviewRows state={state} onEdit={editFrom} />}
          </div>
        </div>
      </div>

      {/* CTA */}
      {needsContinue && (
        <div className="relative z-20 shrink-0 pl-5 pr-[42px] pt-3 pb-7 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A] to-transparent">
          <div className="max-w-lg mx-auto">
            <button
              onClick={onContinue}
              disabled={!canContinue}
              className={`w-full py-4 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.99] ${
                canContinue
                  ? onReview ? 'bg-[#00D4FF] text-[#0A0A0A]' : 'bg-white text-[#0A0A0A]'
                  : 'bg-white/[0.06] text-white/25 cursor-not-allowed'
              }`}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {continueNeeds ? continueNeeds
                : onReview ? 'Build my stack'
                : isGoals ? `Continue with ${state.goals.length} goal${state.goals.length > 1 ? 's' : ''}`
                : isForm && localName.trim() ? `Continue, ${localName.trim()}`
                : 'Continue'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Screens ──────────────────────────────────────────────────────────────────

function GoalGrids({
  track, goals, onToggle, onSwitch,
}: {
  track: 'performance' | 'wellbeing'
  goals: Goal[]
  onToggle: (g: Goal) => void
  onSwitch: () => void
}) {
  const Heading = ({ children }: { children: string }) => (
    <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/35 mb-2.5" style={{ fontFamily: 'var(--font-display)' }}>
      {children}
    </p>
  )
  return (
    <div>
      {track === 'performance' && (
        <>
          <Heading>Performance</Heading>
          <div className="grid grid-cols-2 gap-2.5">
            {GOALS_DATA.map(({ id, label, icon }) => (
              <AnswerOption key={`g-${id}`} icon={icon} label={label} multi selected={goals.includes(id)} onClick={() => onToggle(id)} />
            ))}
          </div>
          <div className="mt-6"><Heading>Everyday wellness</Heading></div>
        </>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {WELLBEING_DATA.map(({ id, label, icon }) => (
          <AnswerOption key={`gw-${id}`} icon={icon} label={label} multi selected={goals.includes(id)} onClick={() => onToggle(id)} />
        ))}
        {track === 'wellbeing' && (
          <AnswerOption icon="leaf" label="General health" multi selected={goals.includes('health')} onClick={() => onToggle('health')} />
        )}
      </div>
      <button onClick={onSwitch} className="mt-5 text-xs text-white/30 underline underline-offset-2">
        {track === 'performance' ? '← Switch to everyday wellness only' : '← Switch to performance + wellness'}
      </button>
    </div>
  )
}

/** Age bands read as prose, not as their ids — "Under 25", and en-dashes in
 *  the ranges. Same labels v1 shows, so the two screens match. */
const AGE_CHOICES: Array<[AgeBracket, string]> = [
  ['16-24', 'Under 25'],
  ['25-34', '25\u201334'],
  ['35-44', '35\u201344'],
  ['45+', '45+'],
]

const GENDER_CHOICES: Array<[Gender, string]> = [
  ['male', 'Male'],
  ['female', 'Female'],
  ['nonbinary', 'Non-binary'],
  ['not-specified', 'Prefer not to say'],
]

const WEIGHT_CHOICES: Array<[WeightBand, string]> = [
  ['under-60', 'Under 60kg'],
  ['60-75', '60\u201375kg'],
  ['75-90', '75\u201390kg'],
  ['90-105', '90\u2013105kg'],
  ['105-plus', '105kg+'],
]

/**
 * The "a little about you" screen.
 *
 * v1's, field for field: the same labels, the same optional markers, the same
 * helper lines saying what each answer buys, and the same answer control in a
 * grid. It looked different in v2 for no reason other than that it was written
 * separately, and a visual difference between the arms on a screen that asks
 * the identical question is a difference the experiment would have to explain.
 */
function PersonalFields({
  name, onName, age, onAge, gender, onGender, weight, onWeight, onSubmit,
}: {
  name: string; onName: (v: string) => void
  age: AgeBracket | ''; onAge: (v: AgeBracket) => void
  gender: Gender | ''; onGender: (v: Gender | '') => void
  weight: WeightBand | ''; onWeight: (v: WeightBand | '') => void
  /** Enter in the name field continues, once an age is chosen. */
  onSubmit: () => void
}) {
  const Label = ({ children, optional }: { children: string; optional?: boolean }) => (
    <label
      className="text-xs font-bold tracking-widest uppercase text-white/30 mb-2 block"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
      {optional && (
        <span className="normal-case font-normal tracking-normal text-white/15"> · optional</span>
      )}
    </label>
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Label optional>First name</Label>
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Your first name"
          autoFocus
          autoComplete="given-name"
          onKeyDown={(e) => { if (e.key === 'Enter' && age) onSubmit() }}
          className="w-full px-5 py-4 rounded-2xl bg-white/[0.04] border border-white/10 text-white text-sm font-medium placeholder-white/20 focus:outline-none focus:border-[#00D4FF]/50 focus:bg-white/[0.06] transition-colors"
          style={{ fontFamily: 'var(--font-display)' }}
        />
        <p className="text-[11px] text-white/20 mt-2">Personalises your results</p>
      </div>

      <div>
        <Label>Age</Label>
        <div className="grid grid-cols-2 gap-2.5">
          {AGE_CHOICES.map(([id, label]) => (
            <AnswerOption key={`age-${id}`} label={label} multi selected={age === id} onClick={() => onAge(id)} />
          ))}
        </div>
      </div>

      <div>
        <Label optional>Gender</Label>
        <div className="grid grid-cols-2 gap-2.5">
          {GENDER_CHOICES.map(([id, label]) => (
            <AnswerOption
              key={`gender-${id}`} label={label} multi
              selected={gender === id}
              onClick={() => onGender(gender === id ? '' : id)}
            />
          ))}
        </div>
      </div>

      <div>
        <Label optional>Weight</Label>
        <div className="grid grid-cols-3 gap-2.5">
          {WEIGHT_CHOICES.map(([id, label]) => (
            <AnswerOption
              key={`weight-${id}`} label={label} multi
              selected={weight === id}
              onClick={() => onWeight(weight === id ? '' : id)}
            />
          ))}
        </div>
        <p className="text-[11px] text-white/20 mt-2">Makes your protein &amp; creatine doses accurate</p>
      </div>
    </div>
  )
}

/**
 * The review screen, which in v2 is also the payoff.
 *
 * v1's review lists the answers. This lists them under a line saying what the
 * interview concluded, because that is the moment the whole redesign exists
 * for: the person sees that the questions went somewhere.
 */
function ReviewRows({ state, onEdit }: { state: InterviewState; onEdit: (id: string) => void }) {
  const drivers = rankedDrivers(state.drivers).slice(0, 3)

  const rows = state.asked
    .map((id) => {
      const q = questionById(id)
      if (!q) return null
      if (id === 'goals') {
        return {
          id, label: 'Goals',
          value: state.goals.map((g) => GOAL_LABELS[g] ?? g).join(', ') || '—',
        }
      }
      if (q.select === 'form') {
        // Labels, not ids: "35–44 · 75–90kg", never "35-44 · 75-90".
        const bits = [
          state.form.name.trim(),
          AGE_CHOICES.find(([a]) => a === state.form.ageBracket)?.[1] ?? '',
          WEIGHT_CHOICES.find(([w]) => w === state.form.weightBand)?.[1] ?? '',
        ]
        return { id, label: 'You', value: bits.filter(Boolean).join(' \u00b7 ') || '\u2014' }
      }
      const picked = state.picked[id] ?? []
      const labels = q.options.filter((o) => picked.includes(o.id)).map((o) => o.label)
      if (labels.length === 0) return null
      return { id, label: q.section, value: labels.join(', ') }
    })
    .filter((r): r is { id: string; label: string; value: string } => r !== null)

  return (
    <div className="flex flex-col gap-2">
      {drivers.length > 0 && (
        <div className="mb-2 px-4 py-4 rounded-xl border border-[#00D4FF]/25 bg-[#00D4FF]/[0.04]">
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#00D4FF]/80" style={{ fontFamily: 'var(--font-display)' }}>
            What we picked up
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {drivers.map((d) => (
              <li key={d.id} className="text-[13.5px] text-white/80 leading-snug flex gap-2">
                <span className="text-[#00D4FF] shrink-0">·</span>
                <span>{DRIVER_HEARD[d.id]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.map((r) => (
        <button
          key={r.id}
          onClick={() => onEdit(r.id)}
          className="w-full flex items-start justify-between gap-3 px-4 py-3.5 rounded-xl border border-white/[0.08] bg-white/[0.015] text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.04] active:scale-[0.99]"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-white/30" style={{ fontFamily: 'var(--font-display)' }}>{r.label}</p>
            <p className="text-sm font-medium text-white mt-1 leading-snug">{r.value}</p>
          </div>
          <span className="text-[11px] font-semibold text-[#00D4FF] flex-shrink-0 mt-0.5">Edit</span>
        </button>
      ))}

      <p className="text-[11px] text-white/25 mt-2 leading-snug">
        Changing an answer re-asks what came after it — the later questions were chosen because of
        it.
      </p>
    </div>
  )
}
