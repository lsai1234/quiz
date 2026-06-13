'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuizStore } from '@/lib/store'
import { fetchRecommendedStack } from '@/lib/recommendation'
import { buildStackBlueprint } from '@/lib/stack-blueprint'
import { personaliseBlueprint } from '@/lib/stack-blueprint/personalise'
import { useProducts } from '@/hooks/useProducts'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import type {
  Goal, TrainingFrequency, TrainingType, DietLevel,
  CaffeineLevel, Budget, StackPreference,
  TrainingExperience, StimPreference,
} from '@/lib/types'
import { ProgressBar } from './ProgressBar'
import { LiveFeedback } from './LiveFeedback'

// ─── Sub-question types ────────────────────────────────────────────────────────

interface SubOption { id: string; label: string; sub?: string }
interface SubQuestion {
  id: string
  question: string
  hint: string
  options: SubOption[]
}

function getSubQuestion(step: number, value: string): SubQuestion | null {
  if (step === 1 && (value === '5-6x' || value === 'daily')) {
    return {
      id: 'experience',
      question: 'How long at this training level?',
      hint: 'Shapes which products and doses we include',
      options: [
        { id: 'new',          label: 'Just getting started', sub: 'Under 6 months at this intensity' },
        { id: 'intermediate', label: 'Building consistency', sub: '6 months to 2 years' },
        { id: 'experienced',  label: 'Established athlete',  sub: '2+ years at this level' },
      ],
    }
  }
  if (step === 2 && value === 'strength') {
    return {
      id: 'strengthFocus',
      question: "What's your primary goal with weights?",
      hint: 'Prioritises the right products for your style',
      options: [
        { id: 'hypertrophy', label: 'Build size',         sub: 'Hypertrophy / bodybuilding focus' },
        { id: 'powerlifting', label: 'Build raw strength', sub: 'Powerlifting / compound-heavy' },
        { id: 'general',     label: 'General fitness',    sub: 'Well-rounded strength development' },
      ],
    }
  }
  if (step === 2 && value === 'sport') {
    return {
      id: 'sportType',
      question: 'Which sport are you training for?',
      hint: 'Different sports have different demand profiles',
      options: [
        { id: 'football',   label: 'Football / Soccer',      sub: 'Speed, endurance, agility' },
        { id: 'rugby',      label: 'Rugby',                  sub: 'Strength, power, contact sport' },
        { id: 'basketball', label: 'Basketball / Court',     sub: 'Explosiveness, court endurance' },
        { id: 'other',      label: 'Another sport',          sub: "We'll build for general athletic performance" },
      ],
    }
  }
  if (step === 6 && value === 'high') {
    return {
      id: 'stim',
      question: 'Want stimulant pre-workout in your stack?',
      hint: 'Some athletes prefer to control caffeine separately',
      options: [
        { id: 'yes', label: 'Yes — bring the kick',  sub: 'Include stimulant pre-workout' },
        { id: 'no',  label: 'No — keep it clean',    sub: "I'll manage my own caffeine intake" },
      ],
    }
  }
  return null
}

// ─── Option components ─────────────────────────────────────────────────────────

function SingleOption({
  label, sub, selected, onClick,
}: { label: string; sub?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 transition-all duration-200 active:scale-[0.97] text-left ${
        selected
          ? 'border-[var(--color-accent)] bg-[color-mix(in_oklch,var(--color-accent)_6%,transparent)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)]'
      }`}
    >
      <div
        className={`flex-shrink-0 w-1 h-8 rounded-full transition-all duration-300 ${
          selected ? 'bg-[var(--color-accent)]' : 'bg-transparent'
        }`}
      />
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-semibold leading-tight transition-colors ${
            selected ? 'text-[var(--color-text)]' : 'text-[var(--color-text-2)]'
          }`}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {label}
        </div>
        {sub && <div className="text-xs text-[var(--color-muted)] mt-0.5">{sub}</div>}
      </div>
      {selected && (
        <div
          className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-accent)] flex items-center justify-center"
          style={{ animation: 'check-pop 0.25s cubic-bezier(0.34,1.56,0.64,1) both' }}
        >
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="#09090b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
  )
}

function MultiOption({
  icon, label, selected, onClick,
}: { icon: string; label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-1.5 px-4 py-4 rounded-2xl border-2 transition-all duration-200 active:scale-[0.95] text-left ${
        selected
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-bg)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-2)]'
      }`}
    >
      <span className="text-xl leading-none">{icon}</span>
      <span
        className={`text-xs font-semibold leading-tight ${selected ? 'text-[var(--color-bg)]' : ''}`}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {label}
      </span>
    </button>
  )
}

function SubQuestionBlock({
  sub, selectedId, onSelect,
}: { sub: SubQuestion; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div
      className="mt-6 pt-6 border-t border-[var(--color-border)]"
      style={{ animation: 'slide-up-in 0.35s cubic-bezier(0.22,1,0.36,1) both' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-px h-4 bg-[var(--color-accent)]" />
        <span
          className="text-[10px] font-bold tracking-[0.22em] uppercase text-[var(--color-accent)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Follow-up
        </span>
      </div>
      <h3
        className="text-base font-bold mb-1"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {sub.question}
      </h3>
      <p className="text-xs text-[var(--color-muted)] mb-4">{sub.hint}</p>
      <div className="flex flex-col gap-2.5">
        {sub.options.map((opt) => (
          <SingleOption
            key={opt.id}
            label={opt.label}
            sub={opt.sub}
            selected={selectedId === opt.id}
            onClick={() => onSelect(opt.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Step data ─────────────────────────────────────────────────────────────────

const GOALS: Array<{ id: Goal; label: string; icon: string }> = [
  { id: 'muscle',      label: 'Build muscle',   icon: '💪' },
  { id: 'energy',      label: 'Boost energy',   icon: '⚡' },
  { id: 'performance', label: 'Performance',    icon: '🏆' },
  { id: 'hydration',   label: 'Hydration',      icon: '💧' },
  { id: 'recovery',    label: 'Recovery',       icon: '🔄' },
  { id: 'health',      label: 'General health', icon: '🌿' },
  { id: 'cutting',     label: 'Lose body fat',  icon: '🔥' },
  { id: 'bulking',     label: 'Gain mass',      icon: '📈' },
]

const FREQ: Array<{ id: TrainingFrequency; label: string; sub: string }> = [
  { id: '1-2x',  label: '1–2× per week', sub: 'Occasional / recreational' },
  { id: '3-4x',  label: '3–4× per week', sub: 'Regular training' },
  { id: '5-6x',  label: '5–6× per week', sub: 'Serious athlete' },
  { id: 'daily', label: 'Every day',     sub: 'Elite / professional' },
]

const TYPES: Array<{ id: TrainingType; label: string; sub: string }> = [
  { id: 'strength', label: 'Strength / Weights',  sub: 'Lifting, powerlifting, bodybuilding' },
  { id: 'cardio',   label: 'Cardio / Endurance',  sub: 'Running, cycling, swimming' },
  { id: 'hiit',     label: 'HIIT / CrossFit',     sub: 'High-intensity interval training' },
  { id: 'sport',    label: 'Team / Field Sport',  sub: 'Football, rugby, basketball' },
  { id: 'mixed',    label: 'Mixed / General',     sub: 'Combination of training styles' },
]

const LIFESTYLE_OPTS = [
  { id: 'vegan',       label: 'Plant-based diet',    icon: '🌱' },
  { id: 'poor-sleep',  label: 'Poor sleep / stress', icon: '😴' },
  { id: 'desk-job',    label: 'Desk-based job',      icon: '💻' },
  { id: 'high-stress', label: 'High-stress life',    icon: '🧠' },
]

const DIET_OPTS: Array<{ id: DietLevel; label: string; sub: string }> = [
  { id: 'clean',        label: 'Very clean',      sub: 'High protein, whole foods, tracked macros' },
  { id: 'mostly-good',  label: 'Mostly on point', sub: 'Healthy most of the time' },
  { id: 'inconsistent', label: 'Inconsistent',    sub: 'Good when I remember, bad when busy' },
  { id: 'poor',         label: 'Needs work',      sub: 'Convenience-led, not optimised' },
]

const CURRENT_SUPPS = [
  { id: 'protein',     label: 'Protein powder', icon: '🥤' },
  { id: 'creatine',    label: 'Creatine',       icon: '⚗️' },
  { id: 'pre-workout', label: 'Pre-workout',    icon: '🚀' },
  { id: 'vitamins',    label: 'Vitamins',        icon: '💊' },
  { id: 'none',        label: 'None yet',        icon: '✕' },
]

const CAFFEINE_OPTS: Array<{ id: CaffeineLevel; label: string; sub: string }> = [
  { id: 'none',   label: 'None at all',      sub: 'I avoid stimulants completely' },
  { id: 'low',    label: 'Low / occasional', sub: 'One coffee here and there' },
  { id: 'medium', label: 'Moderate',         sub: '1–2 coffees daily' },
  { id: 'high',   label: 'High tolerance',   sub: '3+ coffees, used to stimulants' },
]

const BUDGET_OPTS: Array<{ id: Budget; label: string; sub: string; detail: string }> = [
  { id: 'under-30', label: 'Under £30/mo', sub: 'Starter — 1–2 essentials only',           detail: '1–2 products' },
  { id: '30-50',    label: '£30–£50/mo',   sub: 'Core — the products that move the needle', detail: '2–3 products' },
  { id: '50-80',    label: '£50–£80/mo',   sub: 'Performance — solid all-round coverage',   detail: '3–5 products' },
  { id: '80-plus',  label: '£80+/mo',      sub: 'Complete — every angle covered',           detail: '5–7 products' },
]

const PREF_OPTS: Array<{ id: StackPreference; label: string; sub: string }> = [
  { id: 'simple',   label: 'Keep it simple',   sub: '2–3 core products, no fuss' },
  { id: 'balanced', label: 'Balanced',         sub: 'Good coverage without overdoing it' },
  { id: 'complete', label: 'The full picture', sub: 'Every angle covered' },
]

const STEP_META = [
  { section: 'YOUR GOALS',  q: 'What are you training for?',      hint: 'Select everything that applies.' },
  { section: 'TRAINING',    q: 'How often do you train?',         hint: 'Pick your typical week.' },
  { section: 'TRAINING',    q: 'What type of training?',          hint: 'Choose what fits best.' },
  { section: 'LIFESTYLE',   q: 'Any lifestyle factors?',          hint: 'Helps us fine-tune your selections.' },
  { section: 'NUTRITION',   q: 'How clean is your diet?',         hint: 'Honest answer gets better results.' },
  { section: 'SUPPLEMENTS', q: "What are you already taking?",    hint: "We won't double up on anything." },
  { section: 'CAFFEINE',    q: "What's your caffeine tolerance?", hint: 'Affects pre-workout selection.' },
  { section: 'BUDGET',      q: "What's your monthly budget?",     hint: "We'll build exactly within it." },
  { section: 'STACK STYLE', q: 'How do you like your stack?',     hint: 'Simple and focused, or complete coverage?' },
]

// ─── Live feedback ─────────────────────────────────────────────────────────────

function getFreqFeedback(freq: TrainingFrequency, goals: Goal[]): string {
  const high = freq === '5-6x' || freq === 'daily'
  if (high && (goals.includes('muscle') || goals.includes('performance')))
    return 'Training at that frequency places real demand on recovery. Your stack will prioritise muscle protein synthesis and post-session repair.'
  if (freq === '1-2x')
    return "You're keeping training purposeful. We'll focus on products that deliver clear value without overcomplicating your routine."
  return "Your training volume shapes everything we select. We're building around output and recovery for your schedule."
}

function getTypeFeedback(type: TrainingType): string {
  const map: Record<TrainingType, string> = {
    strength: 'Strength training depletes phosphocreatine and creates mechanical stress. Creatine and protein will be central to your stack.',
    cardio:   'Cardio athletes lose electrolytes and need sustained energy. Hydration and endurance support will feature prominently.',
    hiit:     "HIIT demands both aerobic and anaerobic capacity. We'll build a stack that supports intensity and rapid recovery between sessions.",
    sport:    "Team sport requires multi-directional power and sustained focus. Your stack will balance strength, speed and endurance.",
    mixed:    "Mixed training means your body needs broad support. We'll balance performance, recovery and health across your selections.",
  }
  return map[type]
}

// ─── Main component ────────────────────────────────────────────────────────────

export function QuizFlow() {
  const router = useRouter()
  const {
    step, answers, nextStep, prevStep,
    setGoals, setAnswer, setIdentity, setStackLevel, setSelectedProducts, setAiStackMeta,
  } = useQuizStore()

  // Kick off the catalogue fetch as soon as the quiz mounts so live
  // Shopify products are in the store by the time the stack is built
  useProducts()
  useCatalogueProducts() // Populates store.catalogueProducts with live Shopify data

  const [feedback, setFeedback] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [animKey, setAnimKey] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [subQuestion, setSubQuestion] = useState<SubQuestion | null>(null)
  const [subAnswerId, setSubAnswerId] = useState<string | null>(null)
  const [advancePending, setAdvancePending] = useState(false)

  const { section, q, hint } = STEP_META[step] ?? STEP_META[0]
  const isMultiStep = [0, 3, 5].includes(step)
  const isFinalStep = step === 8

  const canAdvance = (() => {
    if (subQuestion && !subAnswerId) return false
    switch (step) {
      case 0: return answers.goals.length > 0
      case 1: return !!answers.trainingFrequency
      case 2: return !!answers.trainingType
      case 3: return true
      case 4: return !!answers.diet
      case 5: return true
      case 6: return !!answers.caffeineLevel
      case 7: return !!answers.budget
      case 8: return !!answers.stackPreference
      default: return false
    }
  })()

  // ─── Navigation ───────────────────────────────────────────────────────────────

  function doAdvance() {
    if (step === 8) { handleFinish(); return }

    if (step === 1 && answers.trainingFrequency) {
      setFeedback(getFreqFeedback(answers.trainingFrequency, answers.goals))
      return
    }
    if (step === 2 && answers.trainingType) {
      setFeedback(getTypeFeedback(answers.trainingType))
      return
    }

    setDirection('forward')
    setAnimKey((k) => k + 1)
    setSubQuestion(null)
    setSubAnswerId(null)
    setAdvancePending(false)
    nextStep()
  }

  function goBack() {
    setDirection('back')
    setAnimKey((k) => k + 1)
    setSubQuestion(null)
    setSubAnswerId(null)
    setAdvancePending(false)
    prevStep()
  }

  function dismissFeedback() {
    setFeedback(null)
    setDirection('forward')
    setAnimKey((k) => k + 1)
    setSubQuestion(null)
    setSubAnswerId(null)
    nextStep()
  }

  // Auto-advance for single-select steps
  const handleSingleSelect = useCallback(
    (
      key: 'trainingFrequency' | 'trainingType' | 'diet' | 'caffeineLevel' | 'budget' | 'stackPreference',
      value: TrainingFrequency | TrainingType | DietLevel | CaffeineLevel | Budget | StackPreference,
    ) => {
      setAnswer(key, value as never)

      if (isFinalStep) return // final step uses explicit button

      const sub = getSubQuestion(step, value as string)
      if (sub) {
        setTimeout(() => {
          setSubAnswerId(null)
          setSubQuestion(sub)
        }, 180)
        return
      }

      setAdvancePending(true)
      setTimeout(() => {
        doAdvance()
      }, 340)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, isFinalStep],
  )

  function handleSubAnswer(subId: string, optId: string) {
    setSubAnswerId(optId)
    if (subId === 'experience') setAnswer('trainingExperience', optId as TrainingExperience)
    if (subId === 'strengthFocus' || subId === 'sportType') setAnswer('trainingFocus', optId)
    if (subId === 'stim') setAnswer('stimPreference', optId as StimPreference)
    setTimeout(doAdvance, 340)
  }

  async function handleFinish() {
    setIsGenerating(true)
    try {
      // Read catalogue at call time — live Shopify products if loaded.
      const catalogueProducts = useQuizStore.getState().catalogueProducts
      const baseBlueprint = buildStackBlueprint(answers, catalogueProducts)

      // Run the AI passes concurrently so the reveal stays snappy. Each falls
      // back to deterministic output on failure (personaliseBlueprint and
      // fetchRecommendedStack never reject; only identity can, → outer catch).
      const [identity, stack, blueprint] = await Promise.all([
        fetch('/api/generate-identity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(answers),
        }).then(r => r.json()),
        fetchRecommendedStack(answers, useQuizStore.getState().catalogue),
        personaliseBlueprint(answers, baseBlueprint, catalogueProducts),
      ])

      setIdentity(identity)
      setSelectedProducts(stack.core)
      setAiStackMeta(stack.aiReasons, stack.personalised)
      setStackLevel(
        answers.stackPreference === 'simple' ? 'essentials'
          : answers.stackPreference === 'complete' ? 'complete'
            : 'performance',
      )
      useQuizStore.getState().setStackBlueprint(blueprint)

      router.push('/reveal')
    } catch {
      setIsGenerating(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const slideAnim = direction === 'forward'
    ? 'animate-[slide-from-right_0.32s_cubic-bezier(0.22,1,0.36,1)_both]'
    : 'animate-[slide-from-left_0.32s_cubic-bezier(0.22,1,0.36,1)_both]'

  return (
    <>
      {feedback && <LiveFeedback message={feedback} onDismiss={dismissFeedback} />}

      {isGenerating && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--color-bg)]">
          <div className="w-12 h-12 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)] animate-spin mb-6" />
          <p className="text-sm text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-display)' }}>
            Building your identity…
          </p>
        </div>
      )}

      <div className="flex flex-col min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-[var(--color-bg)]/95 backdrop-blur-sm px-5 pt-4 pb-3">
          <div className="max-w-md mx-auto flex items-center gap-3">
            {step > 0 && !advancePending && (
              <button
                onClick={goBack}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-muted)] active:opacity-50"
                aria-label="Back"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <div className="flex-1">
              <ProgressBar step={step} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pt-5 pb-40 max-w-md mx-auto w-full">
          <div key={animKey} className={slideAnim}>
            {/* Section label + question */}
            <div className="mb-6">
              <span
                className="text-[10px] font-bold tracking-[0.22em] uppercase text-[var(--color-accent)] opacity-80"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {section}
              </span>
              <h2
                className="text-[1.75rem] font-black leading-tight tracking-tight mt-1"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {q}
              </h2>
              <p className="text-sm text-[var(--color-muted)] mt-1.5">{hint}</p>
            </div>

            {/* Step 0: Goals */}
            {step === 0 && (
              <div className="grid grid-cols-2 gap-2.5">
                {GOALS.map(({ id, label, icon }) => (
                  <MultiOption
                    key={id}
                    icon={icon}
                    label={label}
                    selected={answers.goals.includes(id)}
                    onClick={() => {
                      const curr = answers.goals
                      setGoals(curr.includes(id) ? curr.filter((g) => g !== id) : [...curr, id])
                    }}
                  />
                ))}
              </div>
            )}

            {/* Step 1: Frequency */}
            {step === 1 && (
              <div className="flex flex-col gap-2.5">
                {FREQ.map(({ id, label, sub }) => (
                  <SingleOption
                    key={id}
                    label={label}
                    sub={sub}
                    selected={answers.trainingFrequency === id}
                    onClick={() => handleSingleSelect('trainingFrequency', id)}
                  />
                ))}
                {subQuestion && (
                  <SubQuestionBlock
                    sub={subQuestion}
                    selectedId={subAnswerId}
                    onSelect={(optId) => handleSubAnswer(subQuestion.id, optId)}
                  />
                )}
              </div>
            )}

            {/* Step 2: Training type */}
            {step === 2 && (
              <div className="flex flex-col gap-2.5">
                {TYPES.map(({ id, label, sub }) => (
                  <SingleOption
                    key={id}
                    label={label}
                    sub={sub}
                    selected={answers.trainingType === id}
                    onClick={() => handleSingleSelect('trainingType', id)}
                  />
                ))}
                {subQuestion && (
                  <SubQuestionBlock
                    sub={subQuestion}
                    selectedId={subAnswerId}
                    onSelect={(optId) => handleSubAnswer(subQuestion.id, optId)}
                  />
                )}
              </div>
            )}

            {/* Step 3: Lifestyle */}
            {step === 3 && (
              <div className="grid grid-cols-2 gap-2.5">
                {LIFESTYLE_OPTS.map(({ id, label, icon }) => (
                  <MultiOption
                    key={id}
                    icon={icon}
                    label={label}
                    selected={answers.lifestyle.includes(id)}
                    onClick={() => {
                      const curr = answers.lifestyle
                      setAnswer(
                        'lifestyle',
                        curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
                      )
                    }}
                  />
                ))}
                <MultiOption
                  icon="✓"
                  label="None of these"
                  selected={answers.lifestyle.length === 0}
                  onClick={() => setAnswer('lifestyle', [])}
                />
              </div>
            )}

            {/* Step 4: Diet */}
            {step === 4 && (
              <div className="flex flex-col gap-2.5">
                {DIET_OPTS.map(({ id, label, sub }) => (
                  <SingleOption
                    key={id}
                    label={label}
                    sub={sub}
                    selected={answers.diet === id}
                    onClick={() => handleSingleSelect('diet', id)}
                  />
                ))}
              </div>
            )}

            {/* Step 5: Current supplements */}
            {step === 5 && (
              <div className="grid grid-cols-2 gap-2.5">
                {CURRENT_SUPPS.map(({ id, label, icon }) => (
                  <MultiOption
                    key={id}
                    icon={icon}
                    label={label}
                    selected={
                      id === 'none'
                        ? answers.currentSupplements.length === 0
                        : answers.currentSupplements.includes(id)
                    }
                    onClick={() => {
                      if (id === 'none') { setAnswer('currentSupplements', []); return }
                      const curr = answers.currentSupplements.filter((x) => x !== 'none')
                      setAnswer(
                        'currentSupplements',
                        curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
                      )
                    }}
                  />
                ))}
              </div>
            )}

            {/* Step 6: Caffeine */}
            {step === 6 && (
              <div className="flex flex-col gap-2.5">
                {CAFFEINE_OPTS.map(({ id, label, sub }) => (
                  <SingleOption
                    key={id}
                    label={label}
                    sub={sub}
                    selected={answers.caffeineLevel === id}
                    onClick={() => handleSingleSelect('caffeineLevel', id)}
                  />
                ))}
                {subQuestion && (
                  <SubQuestionBlock
                    sub={subQuestion}
                    selectedId={subAnswerId}
                    onSelect={(optId) => handleSubAnswer(subQuestion.id, optId)}
                  />
                )}
              </div>
            )}

            {/* Step 7: Budget */}
            {step === 7 && (
              <div className="flex flex-col gap-2.5">
                {BUDGET_OPTS.map(({ id, label, sub, detail }) => (
                  <button
                    key={id}
                    onClick={() => handleSingleSelect('budget', id)}
                    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 transition-all duration-200 active:scale-[0.97] text-left ${
                      answers.budget === id
                        ? 'border-[var(--color-accent)] bg-[color-mix(in_oklch,var(--color-accent)_6%,transparent)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-1 h-8 rounded-full transition-all ${answers.budget === id ? 'bg-[var(--color-accent)]' : 'bg-transparent'}`} />
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm font-semibold ${answers.budget === id ? 'text-[var(--color-text)]' : 'text-[var(--color-text-2)]'}`}
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {label}
                      </div>
                      <div className="text-xs text-[var(--color-muted)] mt-0.5">{sub}</div>
                    </div>
                    <div
                      className={`text-xs font-semibold flex-shrink-0 transition-colors ${answers.budget === id ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
                      style={answers.budget === id ? { animation: 'slide-up-in 0.22s ease both' } : {}}
                    >
                      {detail}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Step 8: Stack preference */}
            {step === 8 && (
              <div className="flex flex-col gap-2.5">
                {PREF_OPTS.map(({ id, label, sub }) => (
                  <SingleOption
                    key={id}
                    label={label}
                    sub={sub}
                    selected={answers.stackPreference === id}
                    onClick={() => setAnswer('stackPreference', id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom CTA — only for multi-select + final step */}
        {(isMultiStep || isFinalStep) && (
          <div className="fixed bottom-0 left-0 right-0 px-5 pt-4 pb-8 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/90 to-transparent">
            <div className="max-w-md mx-auto">
              <button
                onClick={doAdvance}
                disabled={!canAdvance}
                className={`w-full py-4 rounded-2xl text-base font-bold tracking-wide transition-all active:scale-95 ${
                  canAdvance
                    ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)] cursor-not-allowed'
                }`}
                style={{
                  fontFamily: 'var(--font-display)',
                  ...(isFinalStep && canAdvance ? { animation: 'pulse-glow 2s ease-in-out infinite' } : {}),
                }}
              >
                {isFinalStep
                  ? 'Reveal my stack identity →'
                  : step === 0 && answers.goals.length > 0
                    ? `Continue with ${answers.goals.length} goal${answers.goals.length > 1 ? 's' : ''} →`
                    : 'Continue →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
