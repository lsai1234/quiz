'use client'

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useQuizStore } from '@/lib/store'
import { useProducts } from '@/hooks/useProducts'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
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

// Vitamin options shown when "vitamins" is selected in step 6
const VITAMIN_OPTIONS = [
  { id: 'vitamin-d',    label: 'Vitamin D',        icon: '☀️' },
  { id: 'omega-3',      label: 'Omega-3 / Fish oil', icon: '🐟' },
  { id: 'multivitamin', label: 'Multivitamin',     icon: '💊' },
  { id: 'vitamin-c',    label: 'Vitamin C',        icon: '🍊' },
  { id: 'b-complex',    label: 'B12 / B-complex',  icon: '⚡' },
  { id: 'magnesium',    label: 'Magnesium',        icon: '🌙' },
  { id: 'zinc',         label: 'Zinc',             icon: '🔩' },
  { id: 'other',        label: 'Other / unsure',   icon: '✦' },
]

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
  { section: 'TRAINING',      q: 'When do you usually train?',      hint: 'Caffeine timing matters — tells us whether to include stimulants.' },
  { section: 'YOUR STYLE',    q: 'What formats do you prefer?',     hint: "We'll match your stack to products you'll actually use." },
  { section: 'BUDGET',        q: 'Monthly supplement budget?',      hint: "Selects your products and sets your stack size — last one." },
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

// Everyday wellbeing goals — shown below the performance grid on the goal step
const WELLBEING_DATA: Array<{ id: Goal; label: string; icon: string }> = [
  { id: 'sleep-better',    label: 'Sleep better',        icon: '😴' },
  { id: 'less-stress',     label: 'Less stress',         icon: '🧘' },
  { id: 'focus',           label: 'Focus & brain fog',   icon: '🧠' },
  { id: 'immune',          label: 'Immune support',      icon: '🛡️' },
  { id: 'skin-hair-nails', label: 'Skin, hair & nails',  icon: '✨' },
  { id: 'gut-health',      label: 'Gut health',          icon: '🦠' },
  { id: 'menopause',       label: 'Menopause support',   icon: '🌡' },
]

// Goals we don't yet stock products for — shown greyed out
const COMING_SOON_GOALS: Array<{ id: string; label: string; icon: string }> = []

// ─── Wellbeing follow-up question bank ────────────────────────────────────────
// One question max is shown inline on the goal step. The question chosen is the
// one whose `serves` list covers the most of the user's selected goals.
// `triggers` must include at least one selected goal for the question to be
// eligible — performance-only users never see these.

interface WellbeingQuestion {
  id: string
  triggers: Goal[]   // at least one of these must be selected to be eligible
  serves: Goal[]     // used for greedy max-coverage prioritisation
  question: string
  hint: string
  options: Array<{ id: string; label: string; sub?: string }>
}

const WELLBEING_QUESTIONS: WellbeingQuestion[] = [
  {
    id: 'sleepQuality',
    triggers: ['sleep-better', 'less-stress'],
    serves: ['sleep-better', 'less-stress', 'recovery'],
    question: "How's your sleep at the moment?",
    hint: 'Shapes which sleep support we recommend',
    options: [
      { id: 'switch-off', label: 'Hard to switch off at night' },
      { id: 'wake-night', label: 'Wake up during the night' },
      { id: 'wake-tired', label: 'Sleep enough, still wake tired' },
      { id: 'fine',       label: "Sleep's fine, actually" },
    ],
  },
  {
    id: 'stressPattern',
    triggers: ['less-stress', 'focus'],
    serves: ['less-stress', 'focus', 'energy'],
    question: 'When does it hit you hardest?',
    hint: 'Helps us target the right support',
    options: [
      { id: 'morning-fog',     label: 'Morning fog — slow to get going' },
      { id: 'afternoon-crash', label: 'Afternoon crash' },
      { id: 'evening-wired',   label: "Wired in the evening, can't wind down" },
      { id: 'all-day',         label: 'Tense all day' },
    ],
  },
  {
    id: 'immuneBaseline',
    triggers: ['immune'],
    serves: ['immune', 'health'],
    question: 'How often do you get run down?',
    hint: 'Sets how much immune support to include',
    options: [
      { id: 'often',     label: 'Catch everything going round' },
      { id: 'sometimes', label: 'A couple of times a year' },
      { id: 'rarely',    label: 'Rarely ill — just want insurance' },
    ],
  },
  {
    id: 'collagenOk',
    triggers: ['skin-hair-nails'],
    serves: ['skin-hair-nails'],
    question: 'Our skin & hair support uses bovine collagen — any restrictions?',
    hint: "We'll only recommend products you can actually take",
    options: [
      { id: 'ok',     label: 'No restrictions' },
      { id: 'veggie', label: 'Vegetarian / vegan' },
    ],
  },
]

/** Greedy set cover: returns the smallest set of follow-ups (max 3) that
 *  together cover every selected wellbeing goal. One question can serve
 *  several goals, so most users see 1–2. */
function pickWellbeingQuestions(goals: Goal[]): WellbeingQuestion[] {
  const selected: WellbeingQuestion[] = []
  const uncovered = new Set(goals.filter(g => WELLBEING_QUESTIONS.some(q => q.triggers.includes(g))))
  while (uncovered.size > 0 && selected.length < 3) {
    let best: WellbeingQuestion | null = null
    let bestCoverage = 0
    for (const q of WELLBEING_QUESTIONS) {
      if (selected.includes(q)) continue
      if (!q.triggers.some(t => uncovered.has(t))) continue
      const coverage = q.serves.filter(s => uncovered.has(s)).length
      if (coverage > bestCoverage) {
        bestCoverage = coverage
        best = q
      }
    }
    if (!best) break
    selected.push(best)
    best.serves.forEach(s => uncovered.delete(s))
    best.triggers.forEach(t => uncovered.delete(t))
  }
  return selected
}
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
  { id: 'vegan',        label: 'Plant-based diet',       icon: '🌱' },
  { id: 'poor-sleep',   label: 'Struggling with sleep',  icon: '😴' },
  { id: 'desk-job',     label: 'Desk job / sedentary',   icon: '💻' },
  { id: 'high-stress',  label: 'High stress levels',     icon: '🧠' },
  { id: 'joint-issues', label: 'Joint or old injuries',  icon: '🦴' },
]

// Wellbeing-track lifestyle options — sleep/stress are already covered by the
// goal follow-ups, so these focus on context that changes recommendations
const WELLBEING_LIFESTYLE_DATA = [
  { id: 'vegan',        label: 'Plant-based diet',           icon: '🌱' },
  { id: 'desk-job',     label: 'Desk job / mostly indoors',  icon: '💻' },
  { id: 'shift-work',   label: 'Shift work / irregular hours', icon: '🌙' },
  { id: 'run-down',     label: 'Get run down easily',        icon: '🤧' },
  { id: 'active',       label: 'Train or exercise regularly', icon: '🏃' },
  { id: 'joint-issues', label: 'Joint or old injuries',      icon: '🦴' },
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

// Wellbeing-track version — asks directly about the supplements we'd
// recommend so the engine never doubles up
const WELLBEING_SUPPS_DATA = [
  { id: 'multivitamin', label: 'Multivitamin',     icon: '💊' },
  { id: 'vitamin-d',    label: 'Vitamin D',        icon: '☀️' },
  { id: 'omega-3',      label: 'Omega-3 / Fish oil', icon: '🐟' },
  { id: 'magnesium',    label: 'Magnesium',        icon: '🌙' },
  { id: 'none',         label: 'None of these',    icon: '✦' },
]
const TRAINING_TIME_DATA: Array<{ id: string; label: string; sub: string }> = [
  { id: 'morning',   label: 'Morning',   sub: 'Before 11am' },
  { id: 'lunchtime', label: 'Midday',    sub: '11am–2pm' },
  { id: 'evening',   label: 'Evening',   sub: 'After 5pm' },
  { id: 'varies',    label: 'Varies',    sub: 'No fixed time' },
]
const CAFFEINE_DATA: Array<{ id: CaffeineLevel; label: string; sub: string }> = [
  { id: 'none',   label: 'I avoid it',      sub: 'Prefer stim-free always' },
  { id: 'low',    label: 'Occasionally',    sub: 'One coffee here and there' },
  { id: 'medium', label: 'Daily coffee',    sub: '1–2 cups a day' },
  { id: 'high',   label: 'High tolerance',  sub: '3+ coffees, used to pre-workout' },
]
// Budget options — each one also implicitly sets stackPreference.
// 'includes' is computed dynamically from quiz answers — see useBudgetPreview below.
const BUDGET_DATA: Array<{
  id: Budget; name: string; budget: string; sub: string
  pref: StackPreference; slots: number
}> = [
  {
    id: 'under-30', name: 'Starter Bundle',   budget: 'Up to £30/mo',
    sub: 'The essentials that move the needle most',
    pref: 'simple', slots: 2,
  },
  {
    id: '30-50',    name: 'Saver Bundle',      budget: '£30–50/mo',
    sub: 'Core supplements to cover your main goal',
    pref: 'simple', slots: 3,
  },
  {
    id: '50-80',    name: 'Performance Bundle', budget: '£50–80/mo',
    sub: 'A well-rounded daily stack',
    pref: 'balanced', slots: 5,
  },
  {
    id: '80-plus',  name: 'Complete Bundle',   budget: '£80+/mo',
    sub: 'Every angle covered — nothing left out',
    pref: 'complete', slots: 7,
  },
]

/** Formats ranked slot titles into a short "includes" preview string. */
function formatIncludes(slots: Array<{ title: string }>, count: number): string {
  if (slots.length === 0) return 'Personalised to your goals'
  const shown = slots.slice(0, Math.min(count, slots.length))
  if (shown.length <= 2) return shown.map(s => s.title).join(' + ')
  const extra = count - (shown.length - 1)
  const main = shown.slice(0, shown.length - 1).map(s => s.title).join(', ')
  const last = extra > 1 ? `+ ${extra} more` : `+ ${shown[shown.length - 1].title}`
  return `${main} ${last}`
}

const FORMAT_DATA = [
  { id: 'powder',   label: 'Powders',        sub: 'Shakes, pre-workout, creatine',  icon: '🥤' },
  { id: 'capsules', label: 'Capsules / Tabs', sub: 'Easy to take anywhere',          icon: '💊' },
  { id: 'bars',     label: 'Bars & Snacks',   sub: 'On-the-go protein hits',         icon: '🍫' },
  { id: 'any',      label: 'No preference',   sub: 'Best product regardless of form', icon: '✦' },
]

// Question copy overrides for the wellbeing track
const WELLBEING_STEP_OVERRIDES: Record<number, { q: string; hint: string }> = {
  4: { q: 'Tell us about your day-to-day', hint: 'Select anything that applies — context changes what we recommend.' },
  6: { q: 'Already taking any of these?',  hint: "We won't recommend what you've already got covered." },
  8: { q: 'When do you usually move or exercise?', hint: 'Even light exercise timing affects what we recommend.' },
}

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
    step, answers, nextStep, prevStep, setStep,
    setGoals, setAnswer, setIdentity, setSelectedProducts, setStackLevel, setAiStackMeta,
  } = useQuizStore()

  // Hydrate live catalogue while the user answers the quiz
  useProducts()
  const { products: liveCatalogue } = useCatalogueProducts() // Populates store.catalogueProducts for blueprint generation

  // Pre-compute the full ranked stack (with unlimited budget) so budget cards
  // can show the *actual* products the user would get — not hardcoded text.
  const rankedSlots = useMemo(() => {
    if (answers.goals.length === 0) return []
    try {
      const catalogue = liveCatalogue.length > 0 ? liveCatalogue : MOCK_CATALOGUE
      const preview = buildStackBlueprint(
        { ...answers, budget: '80-plus', stackPreference: 'complete' },
        catalogue,
      )
      return preview.slots
    } catch {
      return []
    }
  }, [
    answers.goals, answers.lifestyle, answers.currentSupplements,
    answers.currentVitamins, answers.stimPreference, answers.caffeineLevel,
    answers.wellbeingAnswers, answers.diet, answers.preferredFormats,
    answers.trainingFocus, answers.gender, answers.ageBracket,
    answers.trainingTime, answers.trainingExperience, liveCatalogue,
  ])

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
  const [localExactAge, setLocalExactAge] = useState<number | null>(answers.exactAge ?? null)

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
      if (localExactAge !== null) setAnswer('exactAge', localExactAge)
    }
    if (step >= TOTAL - 1) { handleFinish(); return }
    setDirection('forward')
    setAnimKey((k) => k + 1)
    // Wellbeing track skips the training questions (steps 2–3)
    if (step === 1 && answers.track === 'wellbeing') { setStep(4); return }
    nextStep()
  }

  function goBack() {
    clearPending()
    setSubQuestion(null)
    setSubAnswerId(null)
    setDirection('back')
    setAnimKey((k) => k + 1)
    // Wellbeing track skips the training questions (steps 2–3)
    if (step === 4 && answers.track === 'wellbeing') { setStep(1); return }
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
      const { fetchRecommendedStack } = await import('@/lib/recommendation')
      const { buildStackBlueprint } = await import('@/lib/stack-blueprint')
      const { personaliseBlueprint } = await import('@/lib/stack-blueprint/personalise')

      const catalogueProducts = useQuizStore.getState().catalogueProducts
      const baseBlueprint = buildStackBlueprint(answers, catalogueProducts)

      // Run the AI passes concurrently so the reveal stays snappy. Each falls
      // back to deterministic output on failure.
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

      onComplete()
    } catch { setIsGenerating(false) }
  }

  // ─── Derived state ───────────────────────────────────────────────────────────

  const canContinue = (() => {
    switch (step) {
      case 0: return !!localAge
      case 1: return answers.goals.length > 0
      case 4: return true
      case 6: return true
      case 9: return true
      default: return false
    }
  })()

  const slideClass = reducedMotion
    ? ''
    : direction === 'forward'
      ? 'animate-[slide-from-right_0.32s_cubic-bezier(0.22,1,0.36,1)_both]'
      : 'animate-[slide-from-left_0.32s_cubic-bezier(0.22,1,0.36,1)_both]'

  const stepMeta = STEP_META[step]
  const override = answers.track === 'wellbeing' ? WELLBEING_STEP_OVERRIDES[step] : undefined
  const { section } = stepMeta
  const q = override?.q ?? stepMeta.q
  const hint = override?.hint ?? stepMeta.hint

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
                  First name <span className="normal-case font-normal tracking-normal text-white/15">· optional</span>
                </label>
                <input
                  type="text"
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  placeholder="Your first name"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && localAge) advance() }}
                  className="w-full px-5 py-4 rounded-2xl bg-white/[0.04] border border-white/10 text-white text-sm font-medium placeholder-white/20 focus:outline-none focus:border-[#00D4FF]/50 focus:bg-white/[0.06] transition-colors"
                  style={{ fontFamily: 'var(--font-display)' }}
                />
                <p className="text-[11px] text-white/20 mt-2">Personalises your results</p>
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
                {/* Exact age slider — optional, improves accuracy */}
                <div className="mt-4 px-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] text-white/30">
                      For more accurate results, set your exact age
                    </p>
                    {localExactAge !== null && (
                      <span className="text-xs font-bold text-[#00D4FF]">{localExactAge}</span>
                    )}
                  </div>
                  <input
                    type="range"
                    min={16}
                    max={70}
                    step={1}
                    value={localExactAge ?? 25}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      setLocalExactAge(v)
                      // Auto-select the matching bracket
                      if (v < 25) setLocalAge('16-24')
                      else if (v < 35) setLocalAge('25-34')
                      else if (v < 45) setLocalAge('35-44')
                      else setLocalAge('45+')
                    }}
                    onFocus={() => { if (localExactAge === null) setLocalExactAge(25) }}
                    className="w-full h-1 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: localExactAge !== null
                        ? `linear-gradient(to right, #00D4FF ${((( localExactAge - 16) / 54) * 100).toFixed(1)}%, rgba(255,255,255,0.12) 0%)`
                        : 'rgba(255,255,255,0.12)',
                    }}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-white/20">16</span>
                    <span className="text-[10px] text-white/20">70+</span>
                  </div>
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

          {/* ── Step 1: Track chooser → goals (multi) ── */}
          {step === 1 && !answers.track && (
            <div className="flex flex-col gap-3">
              {([
                {
                  id: 'performance' as const, icon: '🏋️', label: 'Performance & training',
                  sub: 'Build muscle, energy, recovery — for people who train',
                },
                {
                  id: 'wellbeing' as const, icon: '🌿', label: 'Everyday wellbeing',
                  sub: 'Sleep, stress, focus, immunity — how you feel day to day',
                },
              ]).map(({ id, icon, label, sub }) => (
                <button
                  key={`track-${id}`}
                  onClick={() => {
                    setAnswer('track', id)
                    setGoals([])
                    setAnswer('wellbeingAnswers', {})
                  }}
                  className="w-full flex items-center gap-4 px-5 py-6 rounded-2xl border border-white/10 bg-white/[0.04] text-left option-hover transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF]/50"
                >
                  <span className="text-3xl leading-none">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>{label}</div>
                    <div className="text-xs mt-1 text-white/35">{sub}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="text-white/30">
                    <path d="M8 4L14 10L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Performance track — the normal goal grid, unchanged */}
          {step === 1 && answers.track === 'performance' && (
            <div>
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
              <button
                onClick={() => { setAnswer('track', null); setGoals([]) }}
                className="mt-5 text-xs text-white/30 underline underline-offset-2"
              >
                ← Switch to everyday wellbeing
              </button>
            </div>
          )}

          {/* Wellbeing track — its own goal screen */}
          {step === 1 && answers.track === 'wellbeing' && (
            <div>
              {answers.gender === 'female' && answers.ageBracket === '45+' && !answers.goals.includes('menopause') && (
                <div
                  className="mb-4 px-4 py-3 rounded-xl border border-[#00D4FF]/20 bg-[#00D4FF]/5 text-xs text-[#00D4FF]/80 leading-snug cursor-pointer"
                  onClick={() => setGoals([...answers.goals, 'menopause'])}
                >
                  <span className="font-bold">Suggested for you:</span> Menopause Support is often the highest-impact pick for women 45+ — tap to add it.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                {WELLBEING_DATA.map(({ id, label, icon }) => (
                  <AnswerOption
                    key={`1w-${id}`}
                    icon={icon} label={label} multi
                    selected={answers.goals.includes(id)}
                    onClick={() => {
                      const c = answers.goals
                      setGoals(c.includes(id) ? c.filter(g => g !== id) : [...c, id])
                    }}
                  />
                ))}
                <AnswerOption
                  key="1w-health"
                  icon="🌿" label="General health" multi
                  selected={answers.goals.includes('health')}
                  onClick={() => {
                    const c = answers.goals
                    setGoals(c.includes('health') ? c.filter(g => g !== 'health') : [...c, 'health'])
                  }}
                />
                {COMING_SOON_GOALS.map(({ id, label, icon }) => (
                  <div
                    key={`1cs-${id}`}
                    aria-disabled
                    className="flex flex-col items-start gap-1.5 px-4 py-4 rounded-2xl border border-white/6 bg-white/[0.02] text-white/25 cursor-not-allowed relative"
                  >
                    <span className="text-xl leading-none opacity-50">{icon}</span>
                    <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{label}</span>
                    <span className="absolute top-2.5 right-2.5 text-[8px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full border border-white/10 text-white/25">
                      Soon
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { setAnswer('track', null); setGoals([]); setAnswer('wellbeingAnswers', {}) }}
                className="mt-5 text-xs text-white/30 underline underline-offset-2"
              >
                ← Switch to performance & training
              </button>

              {/* Wellbeing follow-ups — greedy set cover over selected goals */}
              {pickWellbeingQuestions(answers.goals).map((wq) => (
                <div
                  key={`wqblock-${wq.id}`}
                  className="mt-6 pt-5 border-t border-white/8"
                  style={{ animation: reducedMotion ? undefined : 'slide-up-in 0.3s cubic-bezier(0.22,1,0.36,1) both' }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-px h-4 bg-[#00D4FF]" />
                    <span
                      className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#00D4FF]"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      Quick follow-up
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                    {wq.question}
                  </p>
                  <p className="text-xs text-white/35 mb-3">{wq.hint}</p>
                  <div className="flex flex-col gap-2">
                    {wq.options.map(({ id, label, sub }) => (
                      <AnswerOption
                        key={`wq-${wq.id}-${id}`}
                        label={label} sub={sub}
                        selected={answers.wellbeingAnswers[wq.id] === id}
                        onClick={() => setAnswer('wellbeingAnswers', { ...answers.wellbeingAnswers, [wq.id]: id })}
                      />
                    ))}
                  </div>
                </div>
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

          {/* ── Step 4: Lifestyle (multi) — option set varies by track ── */}
          {step === 4 && (
            <div className="grid grid-cols-2 gap-2.5">
              {(answers.track === 'wellbeing' ? WELLBEING_LIFESTYLE_DATA : LIFESTYLE_DATA).map(({ id, label, icon }) => (
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

          {/* ── Step 6: Current supps (multi) — option set varies by track ── */}
          {step === 6 && answers.track === 'wellbeing' && (
            <div className="grid grid-cols-2 gap-2.5">
              {WELLBEING_SUPPS_DATA.map(({ id, label, icon }) => (
                <AnswerOption
                  key={`6w-${id}`}
                  icon={icon} label={label} multi
                  selected={id === 'none' ? answers.currentVitamins.length === 0 : answers.currentVitamins.includes(id)}
                  onClick={() => {
                    if (id === 'none') { setAnswer('currentVitamins', []); return }
                    const c = answers.currentVitamins
                    setAnswer('currentVitamins', c.includes(id) ? c.filter(x => x !== id) : [...c, id])
                  }}
                />
              ))}
            </div>
          )}
          {step === 6 && answers.track !== 'wellbeing' && (
            <div>
              <div className="grid grid-cols-2 gap-2.5">
                {SUPPS_DATA.map(({ id, label, icon }) => (
                  <AnswerOption
                    key={`6-${id}`}
                    icon={icon} label={label} multi
                    selected={id === 'none' ? answers.currentSupplements.length === 0 : answers.currentSupplements.includes(id)}
                    onClick={() => {
                      if (id === 'none') { setAnswer('currentSupplements', []); setAnswer('currentVitamins', []); return }
                      const c = answers.currentSupplements.filter(x => x !== 'none')
                      setAnswer('currentSupplements', c.includes(id) ? c.filter(x => x !== id) : [...c, id])
                    }}
                  />
                ))}
              </div>
              {/* Vitamin follow-up — shown when vitamins is selected */}
              {answers.currentSupplements.includes('vitamins') && (
                <div
                  className="mt-6 pt-5 border-t border-white/8"
                  style={{ animation: 'slide-up-in 0.3s cubic-bezier(0.22,1,0.36,1) both' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-px h-4 bg-[#00D4FF]" />
                    <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#00D4FF]"
                      style={{ fontFamily: 'var(--font-display)' }}>
                      Which vitamins?
                    </span>
                  </div>
                  <p className="text-xs text-white/35 mb-4">
                    We won't double up on what you're already taking
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {VITAMIN_OPTIONS.map(({ id, label, icon }) => (
                      <AnswerOption
                        key={`vit-${id}`}
                        icon={icon} label={label} multi
                        selected={answers.currentVitamins.includes(id)}
                        onClick={() => {
                          const c = answers.currentVitamins
                          setAnswer('currentVitamins', c.includes(id) ? c.filter(x => x !== id) : [...c, id])
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
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

          {/* ── Step 8: Training time (single) ── */}
          {step === 8 && (
            <div className="flex flex-col gap-2.5">
              {TRAINING_TIME_DATA.map(({ id, label, sub }) => (
                <AnswerOption
                  key={`8t-${id}`}
                  label={label} sub={sub}
                  selected={answers.trainingTime === id}
                  onClick={() => {
                    setAnswer('trainingTime', id as any)
                    clearPending()
                    pendingTimerRef.current = setTimeout(() => advance(), 320)
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Step 9: Product format preferences (multi, continue button) ── */}
          {step === 9 && (
            <div className="flex flex-col gap-2.5">
              {FORMAT_DATA.map(({ id, label, sub, icon }) => (
                <AnswerOption
                  key={`9-${id}`}
                  icon={icon} label={label} sub={sub} multi
                  selected={id === 'any'
                    ? answers.preferredFormats.includes('any')
                    : answers.preferredFormats.includes(id) && !answers.preferredFormats.includes('any')}
                  onClick={() => {
                    if (id === 'any') {
                      setAnswer('preferredFormats', answers.preferredFormats.includes('any') ? [] : ['any'])
                      return
                    }
                    const c = answers.preferredFormats.filter(x => x !== 'any')
                    setAnswer('preferredFormats', c.includes(id) ? c.filter(x => x !== id) : [...c, id])
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Step 10: Budget bundles (single — also sets stack preference) ── */}
          {step === 10 && (
            <div className="flex flex-col gap-3">
              {BUDGET_DATA.map(({ id, name, budget, sub, pref, slots }) => {
                const active = answers.budget === id
                const actualCount = Math.min(slots, rankedSlots.length || slots)
                const includes = formatIncludes(rankedSlots, slots)
                return (
                  <button
                    key={`9-${id}`}
                    onClick={() => { setAnswer('budget', id); setAnswer('stackPreference', pref) }}
                    className={[
                      'w-full flex flex-col gap-2 px-5 py-4 rounded-2xl border text-left',
                      'transition-all duration-150 active:scale-[0.98]',
                      active
                        ? 'border-[#00D4FF] bg-[#00D4FF]/8 text-white'
                        : 'border-white/10 bg-white/[0.04] text-white/70 option-hover',
                    ].join(' ')}
                    style={active ? { boxShadow: '0 0 0 1px rgba(0,212,255,0.2), inset 0 0 24px rgba(0,212,255,0.05)' } : undefined}
                  >
                    {/* Top row — name + budget range */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>{name}</span>
                      <div className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border transition-colors ${
                        active ? 'border-[#00D4FF]/40 text-[#00D4FF] bg-[#00D4FF]/10' : 'border-white/15 text-white/35'
                      }`}>{budget}</div>
                    </div>
                    {/* Sub — what it's for */}
                    <p className={`text-xs leading-snug ${active ? 'text-white/60' : 'text-white/30'}`}>{sub}</p>
                    {/* Includes line — dynamic from quiz answers */}
                    <div className="flex items-start gap-1.5">
                      <span className={`text-[10px] mt-px ${active ? 'text-[#00D4FF]/60' : 'text-white/20'}`}>Includes</span>
                      <span className={`text-[11px] font-medium leading-snug ${active ? 'text-white/70' : 'text-white/25'}`}>{includes}</span>
                    </div>
                    {/* Count badge */}
                    <div className="flex justify-end">
                      <span className={`text-[9px] font-bold tracking-widest uppercase ${active ? 'text-[#00D4FF]/70' : 'text-white/15'}`}>
                        {actualCount} product{actualCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </button>
                )
              })}
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
      {[0, 1, 4, 6, 9].includes(step) && (
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

      {step === 10 && (
        <div className="fixed bottom-0 left-0 right-0 px-5 pt-4 pb-8 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/90 to-transparent z-30">
          <div className="max-w-lg mx-auto">
            <button
              onClick={advance}
              disabled={!answers.budget}
              className={`w-full py-4 rounded-2xl text-sm font-bold tracking-wide transition-all active:scale-95 ${
                answers.budget
                  ? 'bg-[#00D4FF] text-[#0A0A0A]'
                  : 'bg-white/8 text-white/20 cursor-not-allowed'
              }`}
              style={{
                fontFamily: 'var(--font-display)',
                ...(answers.budget ? { animation: 'pulse-glow 2s ease-in-out infinite' } : {}),
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
