'use client'

import { useRef, useState, useCallback } from 'react'
import { useQuizStore } from '@/lib/store'
import type {
  Goal, TrainingFrequency, TrainingType, DietLevel,
  CaffeineLevel, Budget, StackPreference,
  TrainingExperience, StimPreference,
} from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubOption { id: string; label: string; sub?: string }
interface SubQuestion { id: string; question: string; hint: string; options: SubOption[] }

function getSubQuestion(step: number, value: string): SubQuestion | null {
  if (step === 1 && (value === '5-6x' || value === 'daily')) return {
    id: 'experience', question: 'How long at this training level?',
    hint: 'Shapes product selection and dosage approach',
    options: [
      { id: 'new',          label: 'Just getting started', sub: 'Under 6 months' },
      { id: 'intermediate', label: 'Building consistency', sub: '6 months – 2 years' },
      { id: 'experienced',  label: 'Established athlete',  sub: '2+ years' },
    ],
  }
  if (step === 2 && value === 'strength') return {
    id: 'strengthFocus', question: "Primary goal with weights?",
    hint: 'Directs the products we prioritise',
    options: [
      { id: 'hypertrophy',  label: 'Build size',       sub: 'Hypertrophy / bodybuilding' },
      { id: 'powerlifting', label: 'Raw strength',     sub: 'Powerlifting / compound focus' },
      { id: 'general',      label: 'General fitness',  sub: 'Well-rounded strength' },
    ],
  }
  if (step === 2 && value === 'sport') return {
    id: 'sportType', question: 'Which sport?',
    hint: 'Different sports have different demand profiles',
    options: [
      { id: 'football',   label: 'Football / Soccer' },
      { id: 'rugby',      label: 'Rugby' },
      { id: 'basketball', label: 'Basketball / Court' },
      { id: 'other',      label: 'Another sport' },
    ],
  }
  if (step === 6 && value === 'high') return {
    id: 'stim', question: 'Want stim pre-workout in your stack?',
    hint: 'Some athletes prefer to control caffeine separately',
    options: [
      { id: 'yes', label: 'Yes — bring the kick' },
      { id: 'no',  label: 'No — stim-free please' },
    ],
  }
  return null
}

// ─── Step data ────────────────────────────────────────────────────────────────

const STEP_META = [
  { section: 'YOUR GOALS',   q: 'What are you training for?',           hint: 'Select everything that applies.' },
  { section: 'TRAINING',     q: 'How often do you train?',              hint: 'Pick your typical week.' },
  { section: 'TRAINING',     q: 'What type of training?',               hint: 'Choose what fits best.' },
  { section: 'LIFESTYLE',    q: 'Any lifestyle factors?',               hint: 'Helps fine-tune your selections.' },
  { section: 'NUTRITION',    q: 'How clean is your diet?',              hint: 'Honest answer = better results.' },
  { section: 'SUPPLEMENTS',  q: "What are you already taking?",         hint: "We won't double up." },
  { section: 'CAFFEINE',     q: "What's your caffeine tolerance?",      hint: 'Affects pre-workout choice.' },
  { section: 'BUDGET',       q: "Monthly budget?",                      hint: "We'll build within it." },
  { section: 'YOUR ROUTINE', q: 'How complete should your routine be?', hint: 'Sets how many products we recommend.' },
]

const GOALS_DATA: Array<{ id: Goal; label: string; icon: string }> = [
  { id: 'muscle',      label: 'Build muscle',   icon: '💪' },
  { id: 'energy',      label: 'Boost energy',   icon: '⚡' },
  { id: 'performance', label: 'Performance',    icon: '🏆' },
  { id: 'hydration',   label: 'Hydration',      icon: '💧' },
  { id: 'recovery',    label: 'Recovery',       icon: '🔄' },
  { id: 'health',      label: 'General health', icon: '🌿' },
  { id: 'cutting',     label: 'Lose body fat',  icon: '🔥' },
  { id: 'bulking',     label: 'Gain mass',      icon: '📈' },
]
const FREQ_DATA: Array<{ id: TrainingFrequency; label: string; sub: string }> = [
  { id: '1-2x',  label: '1–2× per week', sub: 'Occasional' },
  { id: '3-4x',  label: '3–4× per week', sub: 'Regular training' },
  { id: '5-6x',  label: '5–6× per week', sub: 'Serious athlete' },
  { id: 'daily', label: 'Every day',     sub: 'Elite / professional' },
]
const TYPE_DATA: Array<{ id: TrainingType; label: string; sub: string }> = [
  { id: 'strength', label: 'Strength / Weights', sub: 'Lifting, powerlifting' },
  { id: 'cardio',   label: 'Cardio / Endurance', sub: 'Running, cycling' },
  { id: 'hiit',     label: 'HIIT / CrossFit',    sub: 'High-intensity intervals' },
  { id: 'sport',    label: 'Team / Field Sport',  sub: 'Football, rugby, basketball' },
  { id: 'mixed',    label: 'Mixed / General',     sub: 'Combination of styles' },
]
const LIFESTYLE_DATA = [
  { id: 'vegan',       label: 'Plant-based diet',    icon: '🌱' },
  { id: 'poor-sleep',  label: 'Poor sleep / stress', icon: '😴' },
  { id: 'desk-job',    label: 'Desk-based job',      icon: '💻' },
  { id: 'high-stress', label: 'High stress',         icon: '🧠' },
]
const DIET_DATA: Array<{ id: DietLevel; label: string; sub: string }> = [
  { id: 'clean',        label: 'Very clean',      sub: 'High protein, tracked macros' },
  { id: 'mostly-good',  label: 'Mostly on point', sub: 'Healthy most of the time' },
  { id: 'inconsistent', label: 'Inconsistent',    sub: 'Good and bad days' },
  { id: 'poor',         label: 'Needs work',      sub: 'Convenience-led' },
]
const SUPPS_DATA = [
  { id: 'protein',     label: 'Protein',     icon: '🥤' },
  { id: 'creatine',    label: 'Creatine',    icon: '⚗️' },
  { id: 'pre-workout', label: 'Pre-workout', icon: '🚀' },
  { id: 'vitamins',    label: 'Vitamins',    icon: '💊' },
  { id: 'none',        label: 'None yet',    icon: '✕' },
]
const CAFFEINE_DATA: Array<{ id: CaffeineLevel; label: string; sub: string }> = [
  { id: 'none',   label: 'None',             sub: 'Avoid stimulants completely' },
  { id: 'low',    label: 'Low / occasional', sub: 'One coffee occasionally' },
  { id: 'medium', label: 'Moderate',         sub: '1–2 coffees daily' },
  { id: 'high',   label: 'High tolerance',   sub: '3+ coffees, used to stims' },
]
const BUDGET_DATA: Array<{ id: Budget; label: string; sub: string }> = [
  { id: 'under-50', label: 'Under £50/mo', sub: '2–3 core essentials' },
  { id: '50-100',   label: '£50–£100/mo',  sub: '3–5 products, solid coverage' },
  { id: '100-150',  label: '£100–£150/mo', sub: '5–7 products, performance stack' },
  { id: '150-plus', label: '£150+/mo',     sub: '7+ products, complete coverage' },
]
const PREF_DATA: Array<{ id: StackPreference; label: string; sub: string }> = [
  { id: 'simple',   label: 'Just the essentials', sub: '2–3 products — the ones that move the needle most' },
  { id: 'balanced', label: 'A solid routine',      sub: '4–5 products for well-rounded coverage' },
  { id: 'complete', label: 'All-in',               sub: '6+ products — every angle covered' },
]

const TOTAL = STEP_META.length

// ─── Single option component used by every question ───────────────────────────
// Fully controlled — no internal state. selected comes only from props.
// Hover styles guarded inside globals.css with @media (hover: hover).

function AnswerOption({
  label, sub, icon, selected, multi, onClick,
}: {
  label: string; sub?: string; icon?: string; selected: boolean
  multi?: boolean; onClick: () => void
}) {
  if (multi) {
    return (
      <button
        onClick={onClick}
        aria-pressed={selected}
        className={[
          'flex flex-col items-start gap-1.5 px-4 py-4 rounded-2xl border text-left w-full',
          'transition-[background-color,border-color] duration-150',
          'active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF]/50',
          selected
            ? 'border-[#00D4FF] bg-[#00D4FF] text-[#0A0A0A]'
            : 'border-white/10 bg-white/[0.04] text-white/65 option-hover',
        ].join(' ')}
      >
        {icon && <span className="text-xl leading-none">{icon}</span>}
        <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{label}</span>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'w-full flex items-center gap-4 px-5 py-4 rounded-2xl border text-left',
        'transition-[background-color,border-color,box-shadow] duration-150',
        'active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF]/50',
        selected
          ? 'border-[#00D4FF] bg-[#00D4FF]/10 text-white'
          : 'border-white/10 bg-white/[0.04] text-white/70 option-hover',
      ].join(' ')}
      style={selected ? { boxShadow: '0 0 0 1px rgba(0,212,255,0.25), inset 0 0 20px rgba(0,212,255,0.06)' } : undefined}
    >
      <div className={`shrink-0 w-1 h-7 rounded-full transition-colors duration-150 ${selected ? 'bg-[#00D4FF]' : 'bg-transparent'}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{label}</div>
        {sub && <div className="text-xs mt-0.5 text-white/35">{sub}</div>}
      </div>
      {selected && (
        <div
          className="shrink-0 w-5 h-5 rounded-full bg-[#00D4FF] flex items-center justify-center"
          style={{ animation: 'check-pop 0.22s cubic-bezier(0.34,1.56,0.64,1) both' }}
        >
          <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="#0A0A0A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
  )
}

// ─── getCHRGD icon ────────────────────────────────────────────────────────────

function CHRGDIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.15)} viewBox="0 0 100 115" fill="none">
      <rect x="36" y="1" width="28" height="13" rx="6" fill="white" />
      <rect x="6" y="12" width="88" height="101" rx="28" fill="none" stroke="white" strokeWidth="7" />
      <rect x="19" y="28" width="62" height="13" rx="4" fill="white" />
      <rect x="19" y="48" width="62" height="13" rx="4" fill="white" />
      <path d="M58 22L32 62H51L40 97L76 52H57L58 22Z" fill="#00D4FF" />
    </svg>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props { onComplete: () => void; reducedMotion: boolean }

export function Act2Quiz({ onComplete, reducedMotion }: Props) {
  const {
    step, answers, nextStep, prevStep,
    setGoals, setAnswer, setIdentity, setSelectedProducts, setStackLevel,
  } = useQuizStore()

  const [animKey, setAnimKey] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [subQuestion, setSubQuestion] = useState<SubQuestion | null>(null)
  const [subAnswerId, setSubAnswerId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Navigation ─────────────────────────────────────────────────────────────

  function clearPending() {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    pendingTimerRef.current = null
  }

  function advance() {
    clearPending()
    setSubQuestion(null)
    setSubAnswerId(null)
    if (step >= TOTAL - 1) { handleFinish(); return }
    setDirection('forward')
    setAnimKey((k) => k + 1)
    nextStep()
  }

  function goBack() {
    clearPending()
    setSubQuestion(null)
    setSubAnswerId(null)
    setDirection('back')
    setAnimKey((k) => k + 1)
    prevStep()
  }

  // Single-select: auto-advance after 320ms so the user sees their selection
  const handleSingle = useCallback(
    (key: string, value: string) => {
      setAnswer(key as keyof typeof answers, value as never)
      clearPending()
      const sub = getSubQuestion(step, value)
      if (sub) {
        pendingTimerRef.current = setTimeout(() => {
          setSubAnswerId(null)
          setSubQuestion(sub)
        }, 200)
        return
      }
      pendingTimerRef.current = setTimeout(() => advance(), 320)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step],
  )

  function handleSubAnswer(subId: string, optId: string) {
    setSubAnswerId(optId)
    if (subId === 'experience') setAnswer('trainingExperience', optId as TrainingExperience)
    else if (subId === 'strengthFocus' || subId === 'sportType') setAnswer('trainingFocus', optId)
    else if (subId === 'stim') setAnswer('stimPreference', optId as StimPreference)
    clearPending()
    pendingTimerRef.current = setTimeout(() => advance(), 320)
  }

  async function handleFinish() {
    setIsGenerating(true)
    try {
      const { buildRecommendedStack } = await import('@/lib/recommendation')
      const res = await fetch('/api/generate-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      })
      const identity = await res.json()
      setIdentity(identity)
      const stack = buildRecommendedStack(answers)
      setSelectedProducts(stack.core)
      setStackLevel(
        answers.stackPreference === 'simple' ? 'essentials'
          : answers.stackPreference === 'complete' ? 'complete'
            : 'performance',
      )
      onComplete()
    } catch { setIsGenerating(false) }
  }

  // ─── Derived state ───────────────────────────────────────────────────────────

  const canContinue = (() => {
    switch (step) {
      case 0: return answers.goals.length > 0
      case 3: return true
      case 5: return true
      default: return false
    }
  })()

  const slideClass = reducedMotion
    ? ''
    : direction === 'forward'
      ? 'animate-[slide-from-right_0.32s_cubic-bezier(0.22,1,0.36,1)_both]'
      : 'animate-[slide-from-left_0.32s_cubic-bezier(0.22,1,0.36,1)_both]'

  const { section, q, hint } = STEP_META[step]

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen bg-[#0A0A0A] text-white">

      {/* Generating overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#00D4FF] animate-spin mb-5" />
          <p className="text-sm text-white/50" style={{ fontFamily: 'var(--font-display)' }}>
            Analysing your profile…
          </p>
        </div>
      )}

      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-40 h-0.5 bg-white/8">
        <div
          className="h-full bg-[#00D4FF] transition-all duration-500 ease-out"
          style={{ width: `${((step + 1) / TOTAL) * 100}%` }}
        />
      </div>

      {/* Top bar */}
      <div className="fixed top-3 left-0 right-0 z-40 flex items-center justify-between px-5">
        <div className="flex items-center gap-2">
          <CHRGDIcon size={18} />
          <span className="text-white/50 text-xs font-bold tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
            getCHRGD
          </span>
        </div>
        <span className="text-[11px] font-bold tracking-widest text-white/25" style={{ fontFamily: 'var(--font-display)' }}>
          {step + 1} / {TOTAL}
        </span>
      </div>

      {/* Back button */}
      {step > 0 && (
        <button
          onClick={goBack}
          className="fixed top-[52px] left-4 z-40 w-8 h-8 flex items-center justify-center rounded-full bg-white/6 text-white/40 active:opacity-50"
          aria-label="Back"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Step content — key forces re-mount on step change, CSS slide handles transition */}
      <div className="min-h-screen flex flex-col justify-center px-5 pt-24 pb-32 max-w-lg mx-auto">
        <div key={`${step}-${animKey}`} className={slideClass}>

          {/* Section + question */}
          <span
            className="text-[10px] font-bold tracking-[0.28em] uppercase text-[#00D4FF] mb-3 block"
            style={{ fontFamily: 'var(--font-display)', textShadow: '0 0 14px rgba(0,212,255,0.4)' }}
          >
            {section}
          </span>
          <h2
            className="text-[1.9rem] font-black leading-tight tracking-tight text-white mb-2"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {q}
          </h2>
          <p className="text-sm text-white/35 mb-7">{hint}</p>

          {/* ── Step 0: Goals (multi) ── */}
          {step === 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              {GOALS_DATA.map(({ id, label, icon }) => (
                <AnswerOption
                  key={`0-${id}`}
                  icon={icon} label={label} multi
                  selected={answers.goals.includes(id)}
                  onClick={() => {
                    const c = answers.goals
                    setGoals(c.includes(id) ? c.filter(g => g !== id) : [...c, id])
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Step 1: Frequency (single) ── */}
          {step === 1 && (
            <div className="flex flex-col gap-2.5">
              {FREQ_DATA.map(({ id, label, sub }) => (
                <AnswerOption
                  key={`1-${id}`}
                  label={label} sub={sub}
                  selected={answers.trainingFrequency === id}
                  onClick={() => handleSingle('trainingFrequency', id)}
                />
              ))}
            </div>
          )}

          {/* ── Step 2: Type (single) ── */}
          {step === 2 && (
            <div className="flex flex-col gap-2.5">
              {TYPE_DATA.map(({ id, label, sub }) => (
                <AnswerOption
                  key={`2-${id}`}
                  label={label} sub={sub}
                  selected={answers.trainingType === id}
                  onClick={() => handleSingle('trainingType', id)}
                />
              ))}
            </div>
          )}

          {/* ── Step 3: Lifestyle (multi) ── */}
          {step === 3 && (
            <div className="grid grid-cols-2 gap-2.5">
              {LIFESTYLE_DATA.map(({ id, label, icon }) => (
                <AnswerOption
                  key={`3-${id}`}
                  icon={icon} label={label} multi
                  selected={answers.lifestyle.includes(id)}
                  onClick={() => {
                    const c = answers.lifestyle
                    setAnswer('lifestyle', c.includes(id) ? c.filter(x => x !== id) : [...c, id])
                  }}
                />
              ))}
              <AnswerOption
                key="3-none"
                icon="✓" label="None" multi
                selected={answers.lifestyle.length === 0}
                onClick={() => setAnswer('lifestyle', [])}
              />
            </div>
          )}

          {/* ── Step 4: Diet (single) ── */}
          {step === 4 && (
            <div className="flex flex-col gap-2.5">
              {DIET_DATA.map(({ id, label, sub }) => (
                <AnswerOption
                  key={`4-${id}`}
                  label={label} sub={sub}
                  selected={answers.diet === id}
                  onClick={() => handleSingle('diet', id)}
                />
              ))}
            </div>
          )}

          {/* ── Step 5: Current supps (multi) ── */}
          {step === 5 && (
            <div className="grid grid-cols-2 gap-2.5">
              {SUPPS_DATA.map(({ id, label, icon }) => (
                <AnswerOption
                  key={`5-${id}`}
                  icon={icon} label={label} multi
                  selected={id === 'none' ? answers.currentSupplements.length === 0 : answers.currentSupplements.includes(id)}
                  onClick={() => {
                    if (id === 'none') { setAnswer('currentSupplements', []); return }
                    const c = answers.currentSupplements.filter(x => x !== 'none')
                    setAnswer('currentSupplements', c.includes(id) ? c.filter(x => x !== id) : [...c, id])
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Step 6: Caffeine (single) ── */}
          {step === 6 && (
            <div className="flex flex-col gap-2.5">
              {CAFFEINE_DATA.map(({ id, label, sub }) => (
                <AnswerOption
                  key={`6-${id}`}
                  label={label} sub={sub}
                  selected={answers.caffeineLevel === id}
                  onClick={() => handleSingle('caffeineLevel', id)}
                />
              ))}
            </div>
          )}

          {/* ── Step 7: Budget (single) ── */}
          {step === 7 && (
            <div className="flex flex-col gap-2.5">
              {BUDGET_DATA.map(({ id, label, sub }) => (
                <AnswerOption
                  key={`7-${id}`}
                  label={label} sub={sub}
                  selected={answers.budget === id}
                  onClick={() => handleSingle('budget', id)}
                />
              ))}
            </div>
          )}

          {/* ── Step 8: Stack pref (single, explicit CTA) ── */}
          {step === 8 && (
            <div className="flex flex-col gap-2.5">
              {PREF_DATA.map(({ id, label, sub }) => (
                <AnswerOption
                  key={`8-${id}`}
                  label={label} sub={sub}
                  selected={answers.stackPreference === id}
                  onClick={() => setAnswer('stackPreference', id)}
                />
              ))}
            </div>
          )}

          {/* Sub-question */}
          {subQuestion && (
            <div
              className="mt-8 pt-6 border-t border-white/8"
              style={{ animation: reducedMotion ? undefined : 'slide-up-in 0.3s cubic-bezier(0.22,1,0.36,1) both' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-px h-4 bg-[#00D4FF]" />
                <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#00D4FF]"
                  style={{ fontFamily: 'var(--font-display)' }}>
                  Follow-up
                </span>
              </div>
              <p className="text-base font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                {subQuestion.question}
              </p>
              <p className="text-xs text-white/35 mb-4">{subQuestion.hint}</p>
              <div className="flex flex-col gap-2">
                {subQuestion.options.map((opt) => (
                  <AnswerOption
                    key={`sub-${subQuestion.id}-${opt.id}`}
                    label={opt.label} sub={opt.sub}
                    selected={subAnswerId === opt.id}
                    onClick={() => handleSubAnswer(subQuestion.id, opt.id)}
                  />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* CTA — multi-select steps and final step */}
      {[0, 3, 5].includes(step) && (
        <div className="fixed bottom-0 left-0 right-0 px-5 pt-4 pb-8 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/90 to-transparent z-30">
          <div className="max-w-lg mx-auto">
            <button
              onClick={advance}
              disabled={!canContinue}
              className={`w-full py-4 rounded-2xl text-sm font-bold tracking-wide transition-opacity active:scale-95 ${
                canContinue
                  ? 'bg-white text-[#0A0A0A]'
                  : 'bg-white/8 text-white/20 cursor-not-allowed'
              }`}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {step === 0 && answers.goals.length > 0
                ? `Continue with ${answers.goals.length} goal${answers.goals.length > 1 ? 's' : ''} →`
                : 'Continue →'}
            </button>
          </div>
        </div>
      )}

      {step === 8 && (
        <div className="fixed bottom-0 left-0 right-0 px-5 pt-4 pb-8 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/90 to-transparent z-30">
          <div className="max-w-lg mx-auto">
            <button
              onClick={advance}
              disabled={!answers.stackPreference}
              className={`w-full py-4 rounded-2xl text-sm font-bold tracking-wide transition-all active:scale-95 ${
                answers.stackPreference
                  ? 'bg-[#00D4FF] text-[#0A0A0A]'
                  : 'bg-white/8 text-white/20 cursor-not-allowed'
              }`}
              style={{
                fontFamily: 'var(--font-display)',
                ...(answers.stackPreference ? { animation: 'pulse-glow 2s ease-in-out infinite' } : {}),
              }}
            >
              Reveal my stack identity →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
