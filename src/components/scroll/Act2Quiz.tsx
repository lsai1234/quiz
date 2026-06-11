'use client'

import { useRef, useState, useCallback } from 'react'
import { useQuizStore } from '@/lib/store'
import type {
  Goal, TrainingFrequency, TrainingType, DietLevel,
  CaffeineLevel, Budget, StackPreference,
  TrainingExperience, StimPreference, AgeBracket, Gender,
} from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubOption { id: string; label: string; sub?: string }
interface SubQuestion { id: string; question: string; hint: string; options: SubOption[] }

function getSubQuestion(step: number, value: string): SubQuestion | null {
  if (step === 2 && (value === '5-6x' || value === 'daily')) return {
    id: 'experience', question: 'How long at this training level?',
    hint: 'Shapes product selection and dosage approach',
    options: [
      { id: 'new',          label: 'Just getting started', sub: 'Under 6 months' },
      { id: 'intermediate', label: 'Building consistency', sub: '6 months – 2 years' },
      { id: 'experienced',  label: 'Established athlete',  sub: '2+ years' },
    ],
  }
  if (step === 3 && value === 'strength') return {
    id: 'strengthFocus', question: "Primary goal with weights?",
    hint: 'Directs the products we prioritise',
    options: [
      { id: 'hypertrophy',  label: 'Build size',       sub: 'Hypertrophy / bodybuilding' },
      { id: 'powerlifting', label: 'Raw strength',     sub: 'Powerlifting / compound focus' },
      { id: 'general',      label: 'General fitness',  sub: 'Well-rounded strength' },
    ],
  }
  if (step === 3 && value === 'sport') return {
    id: 'sportType', question: 'Which sport?',
    hint: 'Different sports have different demand profiles',
    options: [
      { id: 'football',   label: 'Football / Soccer' },
      { id: 'rugby',      label: 'Rugby' },
      { id: 'basketball', label: 'Basketball / Court' },
      { id: 'other',      label: 'Another sport' },
    ],
  }
  if (step === 7 && value === 'high') return {
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
  { section: 'ABOUT YOU',     q: "Let's start with you.",           hint: "Helps us build a stack that's actually personal to you." },
  { section: 'YOUR GOAL',     q: "What's the main goal?",           hint: "Pick everything that applies — we'll prioritise by what you choose most." },
  { section: 'TRAINING',      q: 'How often do you train?',         hint: 'Your frequency shapes the whole stack.' },
  { section: 'TRAINING',      q: "What's your training style?",     hint: 'Choose what fits closest.' },
  { section: 'LIFESTYLE',     q: 'Tell us about yourself',          hint: 'Select anything that applies — helps us fine-tune.' },
  { section: 'NUTRITION',     q: "How's the diet?",                 hint: 'Honest answer = better results.' },
  { section: 'WHAT YOU HAVE', q: 'Already using any of these?',     hint: "We won't recommend what you've already got." },
  { section: 'ENERGY',        q: 'How do you handle caffeine?',     hint: 'Shapes your pre-workout recommendation.' },
  { section: 'BUDGET',        q: 'Monthly supplement budget?',      hint: "We'll build the best stack within your range." },
  { section: 'YOUR STACK',    q: 'How do you want to build?',       hint: "Last one. Let's lock in your stack." },
]

const GOALS_DATA: Array<{ id: Goal; label: string; icon: string }> = [
  { id: 'muscle',      label: 'Build muscle',     icon: '💪' },
  { id: 'cutting',     label: 'Get lean',         icon: '🔥' },
  { id: 'energy',      label: 'More energy',      icon: '⚡' },
  { id: 'performance', label: 'Peak performance', icon: '🏆' },
  { id: 'recovery',    label: 'Recover faster',   icon: '😴' },
  { id: 'health',      label: 'Feel healthier',   icon: '🌿' },
  { id: 'bulking',     label: 'Gain mass',        icon: '📈' },
  { id: 'hydration',   label: 'Stay hydrated',    icon: '💧' },
]
const FREQ_DATA: Array<{ id: TrainingFrequency; label: string; sub: string }> = [
  { id: '1-2x',  label: '1–2× a week',  sub: 'Casual — just getting started' },
  { id: '3-4x',  label: '3–4× a week',  sub: 'Regular training' },
  { id: '5-6x',  label: '5–6× a week',  sub: 'Serious athlete' },
  { id: 'daily', label: 'Every day',    sub: 'Elite / professional level' },
]
const TYPE_DATA: Array<{ id: TrainingType; label: string; sub: string }> = [
  { id: 'strength', label: 'Weights / Lifting',  sub: 'Gym, powerlifting, bodybuilding' },
  { id: 'cardio',   label: 'Cardio / Endurance', sub: 'Running, cycling, swimming' },
  { id: 'hiit',     label: 'HIIT / CrossFit',    sub: 'High-intensity intervals' },
  { id: 'sport',    label: 'Sport',              sub: 'Football, rugby, basketball…' },
  { id: 'mixed',    label: 'Mixed training',     sub: 'Bit of everything' },
]
const LIFESTYLE_DATA = [
  { id: 'vegan',       label: 'Plant-based',            icon: '🌱' },
  { id: 'poor-sleep',  label: 'Struggling with sleep',  icon: '😴' },
  { id: 'desk-job',    label: 'Desk job / sedentary',   icon: '💻' },
  { id: 'high-stress', label: 'High stress levels',     icon: '🧠' },
]
const DIET_DATA: Array<{ id: DietLevel; label: string; sub: string }> = [
  { id: 'clean',        label: 'On point',               sub: 'Tracked macros, high protein' },
  { id: 'mostly-good',  label: 'Pretty good',            sub: 'Healthy most of the time' },
  { id: 'inconsistent', label: 'Hit and miss',           sub: 'Good days and bad days' },
  { id: 'poor',         label: 'Room for improvement',   sub: 'Convenience-first right now' },
]
const SUPPS_DATA = [
  { id: 'protein',     label: 'Protein',        icon: '🥤' },
  { id: 'creatine',    label: 'Creatine',       icon: '⚗️' },
  { id: 'pre-workout', label: 'Pre-workout',    icon: '⚡' },
  { id: 'vitamins',    label: 'Vitamins',       icon: '💊' },
  { id: 'none',        label: 'Starting fresh', icon: '✦' },
]
const CAFFEINE_DATA: Array<{ id: CaffeineLevel; label: string; sub: string }> = [
  { id: 'none',   label: 'I avoid it',      sub: 'Prefer stim-free always' },
  { id: 'low',    label: 'Occasionally',    sub: 'One coffee here and there' },
  { id: 'medium', label: 'Daily coffee',    sub: '1–2 cups a day' },
  { id: 'high',   label: 'High tolerance',  sub: '3+ coffees, used to pre-workout' },
]
const BUDGET_DATA: Array<{ id: Budget; label: string; sub: string }> = [
  { id: 'under-50', label: 'Under £50/mo', sub: '2–3 core essentials' },
  { id: '50-100',   label: '£50–£100/mo',  sub: '3–5 products, solid coverage' },
  { id: '100-150',  label: '£100–£150/mo', sub: '5–7 products, performance stack' },
  { id: '150-plus', label: '£150+/mo',     sub: '7+ products, complete coverage' },
]
const PREF_DATA: Array<{ id: StackPreference; label: string; sub: string }> = [
  { id: 'simple',   label: 'Quick wins',    sub: '2–3 products — the ones that actually move the needle' },
  { id: 'balanced', label: 'Proper stack',  sub: '4–5 products — solid, well-rounded coverage' },
  { id: 'complete', label: 'Full throttle', sub: '6+ products — every angle covered' },
]

const TOTAL = STEP_META.length

// ─── Stack progress — 5 capsule pills that fill as you answer questions ──────

function StackProgress({ step, total }: { step: number; total: number }) {
  // Maps 9 steps onto 5 capsules: each lights up every ~2 steps
  const filled = Math.round(((step + 1) / total) * 5)
  return (
    <div className="flex items-center gap-1.5" aria-label={`${filled} of 5 stack ingredients chosen`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const active     = i < filled
        const justFilled = i === filled - 1
        return (
          <div
            key={i}
            className="h-2 rounded-full transition-all duration-500"
            style={{
              width:     active ? 26 : 18,
              background: active ? '#00D4FF' : 'rgba(255,255,255,0.15)',
              boxShadow: active ? '0 0 8px rgba(0,212,255,0.65)' : undefined,
              animation: justFilled ? 'scale-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both' : undefined,
            }}
          />
        )
      })}
    </div>
  )
}

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

  // Personal info step local state
  const [localName, setLocalName] = useState(answers.name || '')
  const [localAge, setLocalAge] = useState<AgeBracket | ''>(answers.ageBracket || '')
  const [localGender, setLocalGender] = useState<Gender | ''>(answers.gender || '')

  // ─── Navigation ─────────────────────────────────────────────────────────────

  function clearPending() {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    pendingTimerRef.current = null
  }

  function advance() {
    clearPending()
    setSubQuestion(null)
    setSubAnswerId(null)
    if (step === 0) {
      setAnswer('name', localName.trim())
      if (localAge) setAnswer('ageBracket', localAge as AgeBracket)
      if (localGender) setAnswer('gender', localGender as Gender)
    }
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
      case 0: return !!localName.trim() && !!localAge
      case 1: return answers.goals.length > 0
      case 4: return true
      case 6: return true
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
        <div className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col items-center justify-center gap-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-[#00D4FF]/20 border-t-[#00D4FF] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <CHRGDIcon size={24} />
            </div>
          </div>
          <div className="text-center">
            <p className="text-xl font-black text-white mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
              Building your stack…
            </p>
            <p className="text-sm text-white/35">Personalising every pick</p>
          </div>
          <div className="flex gap-1.5 mt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-2 w-6 rounded-full bg-[#00D4FF] animate-pulse"
                style={{ boxShadow: '0 0 8px rgba(0,212,255,0.6)', animationDelay: `${i * 0.18}s` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Top bar — logo left, capsule stack-progress right */}
      <div className="fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-between px-5">
        <div className="flex items-center gap-2">
          <CHRGDIcon size={18} />
          <span className="text-white/50 text-xs font-bold tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
            getCHRGD
          </span>
        </div>
        <StackProgress step={step} total={TOTAL} />
      </div>

      {/* Back button */}
      {step > 0 && (
        <button
          onClick={goBack}
          className="fixed top-[58px] left-4 z-40 w-8 h-8 flex items-center justify-center rounded-full bg-white/6 text-white/40 active:opacity-50"
          aria-label="Back"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Step content — key forces re-mount on step change, CSS slide handles transition */}
      <div className="min-h-screen flex flex-col justify-center px-5 pt-28 pb-32 max-w-lg mx-auto">
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

          {/* ── Step 0: Personal info ── */}
          {step === 0 && (
            <div className="flex flex-col gap-6">
              <div>
                <label
                  className="text-xs font-bold tracking-widest uppercase text-white/30 mb-2 block"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  First name
                </label>
                <input
                  type="text"
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  placeholder="Your first name"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && localName.trim() && localAge) advance() }}
                  className="w-full px-5 py-4 rounded-2xl bg-white/[0.04] border border-white/10 text-white text-sm font-medium placeholder-white/20 focus:outline-none focus:border-[#00D4FF]/50 focus:bg-white/[0.06] transition-colors"
                  style={{ fontFamily: 'var(--font-display)' }}
                />
              </div>

              <div>
                <label
                  className="text-xs font-bold tracking-widest uppercase text-white/30 mb-2 block"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Age
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    { id: '16-24' as AgeBracket, label: 'Under 25' },
                    { id: '25-34' as AgeBracket, label: '25–34' },
                    { id: '35-44' as AgeBracket, label: '35–44' },
                    { id: '45+'  as AgeBracket, label: '45+' },
                  ]).map(({ id, label }) => (
                    <AnswerOption
                      key={`age-${id}`}
                      label={label} multi
                      selected={localAge === id}
                      onClick={() => setLocalAge(id)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label
                  className="text-xs font-bold tracking-widest uppercase text-white/30 mb-2 block"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Gender <span className="normal-case font-normal tracking-normal text-white/15">· optional</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    { id: 'male'          as Gender, label: 'Male' },
                    { id: 'female'        as Gender, label: 'Female' },
                    { id: 'nonbinary'     as Gender, label: 'Non-binary' },
                    { id: 'not-specified' as Gender, label: 'Prefer not to say' },
                  ]).map(({ id, label }) => (
                    <AnswerOption
                      key={`gender-${id}`}
                      label={label} multi
                      selected={localGender === id}
                      onClick={() => setLocalGender(prev => prev === id ? '' : id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Goals (multi) ── */}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-2.5">
              {GOALS_DATA.map(({ id, label, icon }) => (
                <AnswerOption
                  key={`1-${id}`}
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

          {/* ── Step 2: Frequency (single) ── */}
          {step === 2 && (
            <div className="flex flex-col gap-2.5">
              {FREQ_DATA.map(({ id, label, sub }) => (
                <AnswerOption
                  key={`2-${id}`}
                  label={label} sub={sub}
                  selected={answers.trainingFrequency === id}
                  onClick={() => handleSingle('trainingFrequency', id)}
                />
              ))}
            </div>
          )}

          {/* ── Step 3: Type (single) ── */}
          {step === 3 && (
            <div className="flex flex-col gap-2.5">
              {TYPE_DATA.map(({ id, label, sub }) => (
                <AnswerOption
                  key={`3-${id}`}
                  label={label} sub={sub}
                  selected={answers.trainingType === id}
                  onClick={() => handleSingle('trainingType', id)}
                />
              ))}
            </div>
          )}

          {/* ── Step 4: Lifestyle (multi) ── */}
          {step === 4 && (
            <div className="grid grid-cols-2 gap-2.5">
              {LIFESTYLE_DATA.map(({ id, label, icon }) => (
                <AnswerOption
                  key={`4-${id}`}
                  icon={icon} label={label} multi
                  selected={answers.lifestyle.includes(id)}
                  onClick={() => {
                    const c = answers.lifestyle
                    setAnswer('lifestyle', c.includes(id) ? c.filter(x => x !== id) : [...c, id])
                  }}
                />
              ))}
              <AnswerOption
                key="4-none"
                icon="✓" label="None of these" multi
                selected={answers.lifestyle.length === 0}
                onClick={() => setAnswer('lifestyle', [])}
              />
            </div>
          )}

          {/* ── Step 5: Diet (single) ── */}
          {step === 5 && (
            <div className="flex flex-col gap-2.5">
              {DIET_DATA.map(({ id, label, sub }) => (
                <AnswerOption
                  key={`5-${id}`}
                  label={label} sub={sub}
                  selected={answers.diet === id}
                  onClick={() => handleSingle('diet', id)}
                />
              ))}
            </div>
          )}

          {/* ── Step 6: Current supps (multi) ── */}
          {step === 6 && (
            <div className="grid grid-cols-2 gap-2.5">
              {SUPPS_DATA.map(({ id, label, icon }) => (
                <AnswerOption
                  key={`6-${id}`}
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

          {/* ── Step 7: Caffeine (single) ── */}
          {step === 7 && (
            <div className="flex flex-col gap-2.5">
              {CAFFEINE_DATA.map(({ id, label, sub }) => (
                <AnswerOption
                  key={`7-${id}`}
                  label={label} sub={sub}
                  selected={answers.caffeineLevel === id}
                  onClick={() => handleSingle('caffeineLevel', id)}
                />
              ))}
            </div>
          )}

          {/* ── Step 8: Budget (single) ── */}
          {step === 8 && (
            <div className="flex flex-col gap-2.5">
              {BUDGET_DATA.map(({ id, label, sub }) => (
                <AnswerOption
                  key={`8-${id}`}
                  label={label} sub={sub}
                  selected={answers.budget === id}
                  onClick={() => handleSingle('budget', id)}
                />
              ))}
            </div>
          )}

          {/* ── Step 9: Stack pref (single, explicit CTA) ── */}
          {step === 9 && (
            <div className="flex flex-col gap-2.5">
              {PREF_DATA.map(({ id, label, sub }) => (
                <AnswerOption
                  key={`9-${id}`}
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

      {/* CTA — personal info, multi-select steps */}
      {[0, 1, 4, 6].includes(step) && (
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
              {step === 0 && localName.trim()
                ? `Continue, ${localName.trim()} →`
                : step === 1 && answers.goals.length > 0
                  ? `Continue with ${answers.goals.length} goal${answers.goals.length > 1 ? 's' : ''} →`
                  : 'Continue →'}
            </button>
          </div>
        </div>
      )}

      {step === 9 && (
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
              Build my stack →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
