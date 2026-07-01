'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import { useQuizStore } from '@/lib/store'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { calculatePricing, levelForStackPreference, qualifiesForFreeDelivery } from '@/lib/stack-blueprint/pricing'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { activeSteps, stepCopy, type StepId } from '@/lib/quiz-flow'
import { ChargeRail } from '@/components/quiz/ChargeRail'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import type {
  Goal, TrainingFrequency, TrainingType, DietLevel,
  CaffeineLevel, Budget, StackPreference,
  TrainingExperience, StimPreference, AgeBracket, Gender, StackIdentity,
} from '@/lib/types'

// Client-side fallback identity so the reveal is never empty if the identity
// request fails outright (the API also returns its own fallback on a 200).
const FALLBACK_IDENTITY: StackIdentity = {
  name: 'Peak Protocol',
  archetype: 'The Performance Athlete',
  description:
    'Your stack is built around output and recovery. These selections may suit your goals and are commonly used by people with similar profiles.',
  focusAreas: ['Performance Output', 'Faster Recovery', 'Daily Energy'],
  routineFitScore: 84,
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubOption { id: string; label: string; sub?: string }
interface SubQuestion { id: string; question: string; hint: string; options: SubOption[] }

// Conditional follow-up shown inline after certain single-choice answers.
function getSubQuestion(stepId: StepId, value: string): SubQuestion | null {
  if (stepId === 'frequency' && (value === '5-6x' || value === 'daily')) return {
    id: 'experience', question: 'How long at this training level?',
    hint: 'Shapes product selection and dosage approach',
    options: [
      { id: 'new',          label: 'Just getting started', sub: 'Under 6 months' },
      { id: 'intermediate', label: 'Building consistency', sub: '6 months – 2 years' },
      { id: 'experienced',  label: 'Established athlete',  sub: '2+ years' },
    ],
  }
  if (stepId === 'type' && value === 'strength') return {
    id: 'strengthFocus', question: 'Primary goal with weights?',
    hint: 'Directs the products we prioritise',
    options: [
      { id: 'hypertrophy',  label: 'Build size',       sub: 'Hypertrophy / bodybuilding' },
      { id: 'powerlifting', label: 'Raw strength',     sub: 'Powerlifting / compound focus' },
      { id: 'general',      label: 'General fitness',  sub: 'Well-rounded strength' },
    ],
  }
  if (stepId === 'type' && value === 'sport') return {
    id: 'sportType', question: 'Which sport?',
    hint: 'Different sports have different demand profiles',
    options: [
      { id: 'football',   label: 'Football / Soccer' },
      { id: 'rugby',      label: 'Rugby' },
      { id: 'basketball', label: 'Basketball / Court' },
      { id: 'other',      label: 'Another sport' },
    ],
  }
  if (stepId === 'caffeine' && value === 'high') return {
    id: 'stim', question: 'Want stim pre-workout in your stack?',
    hint: 'Some athletes prefer to control caffeine separately',
    options: [
      { id: 'yes', label: 'Yes — bring the kick' },
      { id: 'no',  label: 'No — stim-free please' },
    ],
  }
  return null
}

// Vitamin options shown when "vitamins" is selected in the supps step
const VITAMIN_OPTIONS = [
  { id: 'vitamin-d',    label: 'Vitamin D',        icon: 'sun' },
  { id: 'omega-3',      label: 'Omega-3 / Fish oil', icon: 'droplet' },
  { id: 'multivitamin', label: 'Multivitamin',     icon: 'capsule' },
  { id: 'vitamin-c',    label: 'Vitamin C',        icon: 'citrus' },
  { id: 'b-complex',    label: 'B12 / B-complex',  icon: 'bolt' },
  { id: 'magnesium',    label: 'Magnesium',        icon: 'hexagon' },
  { id: 'zinc',         label: 'Zinc',             icon: 'diamond' },
  { id: 'other',        label: 'Other / unsure',   icon: 'sparkle' },
]

const GOALS_DATA: Array<{ id: Goal; label: string; icon: string }> = [
  { id: 'muscle',      label: 'Build muscle',     icon: 'dumbbell' },
  { id: 'cutting',     label: 'Get lean',         icon: 'flame' },
  { id: 'energy',      label: 'More energy',      icon: 'bolt' },
  { id: 'performance', label: 'Peak performance', icon: 'peak' },
  { id: 'recovery',    label: 'Recover faster',   icon: 'refresh' },
  { id: 'health',      label: 'Feel healthier',   icon: 'heart' },
  { id: 'bulking',     label: 'Gain mass',        icon: 'trending-up' },
  { id: 'hydration',   label: 'Stay hydrated',    icon: 'droplet' },
]

const WELLBEING_DATA: Array<{ id: Goal; label: string; icon: string }> = [
  { id: 'sleep-better',    label: 'Sleep better',        icon: 'moon' },
  { id: 'less-stress',     label: 'Less stress',         icon: 'wave' },
  { id: 'focus',           label: 'Focus & brain fog',   icon: 'crosshair' },
  { id: 'immune',          label: 'Immune support',      icon: 'shield' },
  { id: 'skin-hair-nails', label: 'Skin, hair & nails',  icon: 'sparkle' },
  { id: 'gut-health',      label: 'Gut health',          icon: 'spiral' },
  { id: 'menopause',       label: 'Menopause support',   icon: 'thermometer' },
]

// ─── Wellbeing follow-up question bank ────────────────────────────────────────

interface WellbeingQuestion {
  id: string
  triggers: Goal[]
  serves: Goal[]
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
      if (coverage > bestCoverage) { bestCoverage = coverage; best = q }
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
  { id: 'vegan',        label: 'Plant-based diet',       icon: 'leaf' },
  { id: 'poor-sleep',   label: 'Struggling with sleep',  icon: 'moon' },
  { id: 'desk-job',     label: 'Desk job / sedentary',   icon: 'monitor' },
  { id: 'high-stress',  label: 'High stress levels',     icon: 'brain' },
  { id: 'joint-issues', label: 'Joint or old injuries',  icon: 'bone' },
]
const WELLBEING_LIFESTYLE_DATA = [
  { id: 'vegan',        label: 'Plant-based diet',           icon: 'leaf' },
  { id: 'desk-job',     label: 'Desk job / mostly indoors',  icon: 'monitor' },
  { id: 'shift-work',   label: 'Shift work / irregular hours', icon: 'clock' },
  { id: 'run-down',     label: 'Get run down easily',        icon: 'trending-down' },
  { id: 'active',       label: 'Train or exercise regularly', icon: 'activity' },
  { id: 'joint-issues', label: 'Joint or old injuries',      icon: 'bone' },
]
const DIET_DATA: Array<{ id: DietLevel; label: string; sub: string }> = [
  { id: 'clean',        label: 'On point',               sub: 'Tracked macros, high protein' },
  { id: 'mostly-good',  label: 'Pretty good',            sub: 'Healthy most of the time' },
  { id: 'inconsistent', label: 'Hit and miss',           sub: 'Good days and bad days' },
  { id: 'poor',         label: 'Room for improvement',   sub: 'Convenience-first right now' },
]
const SUPPS_DATA = [
  { id: 'protein',     label: 'Protein',        icon: 'shaker' },
  { id: 'creatine',    label: 'Creatine',       icon: 'flask' },
  { id: 'pre-workout', label: 'Pre-workout',    icon: 'bolt' },
  { id: 'vitamins',    label: 'Vitamins',       icon: 'capsule' },
  { id: 'none',        label: 'Starting fresh', icon: 'sparkle' },
]
const WELLBEING_SUPPS_DATA = [
  { id: 'multivitamin', label: 'Multivitamin',     icon: 'capsule' },
  { id: 'vitamin-d',    label: 'Vitamin D',        icon: 'sun' },
  { id: 'omega-3',      label: 'Omega-3 / Fish oil', icon: 'droplet' },
  { id: 'magnesium',    label: 'Magnesium',        icon: 'hexagon' },
  { id: 'none',         label: 'None of these',    icon: 'minus' },
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
const BUDGET_DATA: Array<{
  id: Budget; name: string; budget: string; sub: string
  pref: StackPreference; slots: number; icon: string
}> = [
  { id: 'under-30', name: 'Starter Bundle',   budget: 'Up to £30', sub: 'The essentials that move the needle most', pref: 'simple', slots: 2, icon: 'bundle1' },
  { id: '30-50',    name: 'Saver Bundle',      budget: '£30–£50',    sub: 'Core supplements to cover your main goal', pref: 'simple', slots: 3, icon: 'bundle2' },
  { id: '50-80',    name: 'Performance Bundle', budget: '£50–£80',   sub: 'A well-rounded daily stack', pref: 'balanced', slots: 5, icon: 'bundle3' },
  { id: '80-plus',  name: 'Complete Bundle',   budget: '£80+',      sub: 'Every angle covered — nothing left out', pref: 'complete', slots: 7, icon: 'bundle4' },
]

// ─── Bundle sales framing (the budget step) ───────────────────────────────────
// Good / better / best. Each bundle is a prefix of the previewed "complete"
// stack, so we can show exactly what's in each one as a tick-list — the higher
// bundles visibly carry more. Static merchandising badges drive the classic
// pricing-ladder nudge; the subscribe-&-save rate rewards going bigger.

/** Merchandising badge per bundle — the good/better/best sales ladder. */
const BUNDLE_BADGE: Partial<Record<Budget, string>> = {
  '50-80': 'Recommended',
  '80-plus': 'Best value',
}

const FORMAT_DATA = [
  { id: 'powder',   label: 'Powders',        sub: 'Shakes, pre-workout, creatine',  icon: 'shaker' },
  { id: 'capsules', label: 'Capsules / Tabs', sub: 'Easy to take anywhere',          icon: 'capsule' },
  { id: 'bars',     label: 'Bars & Snacks',   sub: 'On-the-go protein hits',         icon: 'bar' },
  { id: 'any',      label: 'No preference',   sub: 'Best product regardless of form', icon: 'grid' },
]

// ─── Label lookups (for the review summary) ───────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  ...Object.fromEntries([...GOALS_DATA, ...WELLBEING_DATA].map(g => [g.id, g.label] as const)),
  health: 'General health',
}
const labelOf = (data: Array<{ id: string; label: string }>, id: string | null) => data.find(d => d.id === id)?.label ?? ''
const labelsOf = (data: Array<{ id: string; label: string }>, ids: string[]) => ids.map(id => labelOf(data, id)).filter(Boolean)

// ─── Single option component ──────────────────────────────────────────────────

// Editorial-minimal selection mark — a small precise check, accent on select.
function CheckMark({ selected, reduced }: { selected: boolean; reduced?: boolean }) {
  return (
    <div
      className={[
        'shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center border transition-all duration-200',
        selected ? 'border-[#00D4FF] bg-[#00D4FF]' : 'border-white/15 bg-transparent',
      ].join(' ')}
      style={selected && !reduced ? { animation: 'check-pop 0.22s cubic-bezier(0.34,1.56,0.64,1) both' } : undefined}
    >
      {selected && (
        <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="#0A0A0A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}

// One refined option card. A leading monoline icon (muted, accent on select)
// gives back at-a-glance scannability without the emoji look; confident type, a
// hairline border, and a crisp accent-selected state with a small check. `multi`
// lays out a compact grid card; otherwise a full-width row with optional sub.
function AnswerOption({
  label, sub, icon, selected, multi, onClick,
}: {
  label: string; sub?: string; icon?: string; selected: boolean
  multi?: boolean; onClick: () => void
}) {
  const base = selected
    ? 'border-[#00D4FF]/55 bg-[#00D4FF]/[0.07]'
    : 'border-white/[0.08] bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.04]'
  const iconColor = selected ? 'text-[#00D4FF]' : 'text-white/40'

  if (multi) {
    return (
      <button
        onClick={onClick}
        aria-pressed={selected}
        className={[
          'relative w-full flex items-center gap-2 text-left rounded-xl border px-3 py-3 pr-8',
          'transition-all duration-200 active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40',
          base,
        ].join(' ')}
      >
        {icon && <QuizIcon name={icon} size={17} className={`shrink-0 transition-colors duration-200 ${iconColor}`} />}
        <span
          className={`text-[13px] font-medium leading-snug ${selected ? 'text-white' : 'text-white/70'}`}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {label}
        </span>
        <div className="absolute top-1/2 right-3 -translate-y-1/2">
          <CheckMark selected={selected} />
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'w-full flex items-center gap-3.5 px-5 py-4 rounded-xl border text-left',
        'transition-all duration-200 active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40',
        base,
      ].join(' ')}
    >
      {icon && <QuizIcon name={icon} size={20} className={`shrink-0 transition-colors duration-200 ${iconColor}`} />}
      <div className="flex-1 min-w-0">
        <div
          className={`text-[15px] font-medium leading-snug ${selected ? 'text-white' : 'text-white/80'}`}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {label}
        </div>
        {sub && <div className="text-[13px] mt-1 text-white/35 leading-snug">{sub}</div>}
      </div>
      <CheckMark selected={selected} />
    </button>
  )
}

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
    step, answers, setStep,
    setGoals, setAnswer, setIdentity, setStackLevel, setStackReady,
  } = useQuizStore()

  const { products: liveCatalogue } = useCatalogueProducts()

  // Active step sequence for the chosen track (single source of truth).
  const seq = useMemo(() => activeSteps(answers.track), [answers.track])
  const index = Math.min(step, seq.length - 1)
  const current = seq[index]
  const id = current.id
  const { section, q, hint } = stepCopy(current, answers.track)
  const isFirst = index === 0

  // Full ranked stack (unlimited budget) so budget cards show real products.
  // Build each bundle's ACTUAL stack at its own budget + preference, so the
  // "what you get" tick-list shows exactly what that bundle would contain — never
  // a product that the bundle's price cap would actually exclude. Aligned to
  // BUDGET_DATA order. Mirrors what generateStack builds when the bundle is picked
  // (AI personalisation only swaps products within slots, never the slot titles).
  const bundlePreviews = useMemo<Array<{ titles: string[]; freeDelivery: boolean }>>(() => {
    if (answers.goals.length === 0) return BUDGET_DATA.map(() => ({ titles: [], freeDelivery: false }))
    const catalogue = liveCatalogue.length > 0 ? liveCatalogue : MOCK_CATALOGUE
    return BUDGET_DATA.map((b) => {
      try {
        const a = { ...answers, budget: b.id, stackPreference: b.pref }
        const bp = buildStackBlueprint(a, catalogue)
        // One-off total decides the free-delivery perk (not shown as a price —
        // the card advertises the one-off budget range instead).
        const { oneOffTotal } = calculatePricing(bp, catalogue, a, undefined, { level: levelForStackPreference(b.pref) })
        return { titles: bp.slots.map((s) => s.title), freeDelivery: qualifiesForFreeDelivery(oneOffTotal) }
      } catch {
        return { titles: [], freeDelivery: false }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    answers.goals, answers.lifestyle, answers.currentSupplements, answers.currentVitamins,
    answers.stimPreference, answers.caffeineLevel, answers.wellbeingAnswers, answers.diet,
    answers.preferredFormats, answers.trainingFocus, answers.gender, answers.ageBracket,
    answers.trainingTime, answers.trainingExperience, liveCatalogue,
  ])

  const [animKey, setAnimKey] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [subQuestion, setSubQuestion] = useState<SubQuestion | null>(null)
  const [subAnswerId, setSubAnswerId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  // Whether the options region has content below the fold (drives the scroll cue).
  const [moreBelow, setMoreBelow] = useState(false)

  // ── Charge rail (the getCHRGD signature) — climbs as you answer ──
  // Tops out at ~92% in the quiz; Act 3 finishes the charge and "powers on".
  const charge = Math.round(8 + (index / Math.max(1, seq.length - 1)) * 84)
  const [surgeKey, setSurgeKey] = useState(0)
  const prevChargeRef = useRef(charge)
  useEffect(() => {
    if (charge > prevChargeRef.current) setSurgeKey((k) => k + 1)
    prevChargeRef.current = charge
  }, [charge])

  // Personal-info local state (written to the store on advance).
  const [localName, setLocalName] = useState(answers.name || '')
  const [localAge, setLocalAge] = useState<AgeBracket | ''>(answers.ageBracket || '')
  const [localGender, setLocalGender] = useState<Gender | ''>(answers.gender || '')
  const [localExactAge, setLocalExactAge] = useState<number | null>(answers.exactAge ?? null)

  // Move focus to the question on every step change (orientation + a11y).
  useEffect(() => {
    if (reducedMotion) return
    const t = setTimeout(() => headingRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [index, reducedMotion])

  // Track whether there's hidden content below in the options region so we can
  // show a "more below" cue — the fix for sub-questions/answers being off-screen.
  const recomputeMoreBelow = () => {
    const el = optionsRef.current
    if (!el) { setMoreBelow(false); return }
    setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 16)
  }
  useEffect(() => {
    const el = optionsRef.current
    if (!el) return
    recomputeMoreBelow()
    el.addEventListener('scroll', recomputeMoreBelow, { passive: true })
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(recomputeMoreBelow)
      ro.observe(el)
      if (el.firstElementChild) ro.observe(el.firstElementChild)
    }
    return () => { el.removeEventListener('scroll', recomputeMoreBelow); ro?.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Recompute after content swaps (step change, sub-question, answer toggles).
  useEffect(() => {
    const t = setTimeout(recomputeMoreBelow, 80)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, animKey, subQuestion, index, answers])

  // When a follow-up sub-question appears, bring it into view so it's never
  // hidden below the fold — the user shouldn't have to guess that it's there.
  useEffect(() => {
    if (!subQuestion) return
    const t = setTimeout(() => {
      subRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
    }, 90)
    return () => clearTimeout(t)
  }, [subQuestion, reducedMotion])

  // ─── Navigation ─────────────────────────────────────────────────────────────

  function clearPending() {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    pendingTimerRef.current = null
  }

  function commitPersonal() {
    setAnswer('name', localName.trim())
    if (localAge) setAnswer('ageBracket', localAge as AgeBracket)
    setAnswer('gender', (localGender || null) as Gender)
    if (localExactAge !== null) setAnswer('exactAge', localExactAge)
  }

  function advance() {
    clearPending()
    setSubQuestion(null)
    setSubAnswerId(null)
    if (id === 'personal') commitPersonal()
    if (id === 'review') { handleFinish(); return }
    setDirection('forward')
    setAnimKey((k) => k + 1)
    setStep(Math.min(index + 1, seq.length - 1))
  }

  function goBack() {
    clearPending()
    setSubQuestion(null)
    setSubAnswerId(null)
    setDirection('back')
    setAnimKey((k) => k + 1)
    setStep(Math.max(index - 1, 0))
  }

  function jumpTo(target: StepId) {
    clearPending()
    const i = seq.findIndex((s) => s.id === target)
    if (i < 0) return
    setSubQuestion(null)
    setSubAnswerId(null)
    setDirection('back')
    setAnimKey((k) => k + 1)
    setStep(i)
  }

  // Single-select: auto-advance after a brief beat so the choice registers.
  function handleSingle(key: string, value: string) {
    setAnswer(key as keyof typeof answers, value as never)
    clearPending()
    const sub = getSubQuestion(id, value)
    if (sub) {
      pendingTimerRef.current = setTimeout(() => { setSubAnswerId(null); setSubQuestion(sub) }, 200)
      return
    }
    pendingTimerRef.current = setTimeout(() => advance(), 340)
  }

  function handleSubAnswer(subId: string, optId: string) {
    setSubAnswerId(optId)
    if (subId === 'experience') setAnswer('trainingExperience', optId as TrainingExperience)
    else if (subId === 'strengthFocus' || subId === 'sportType') setAnswer('trainingFocus', optId)
    else if (subId === 'stim') setAnswer('stimPreference', optId as StimPreference)
    clearPending()
    pendingTimerRef.current = setTimeout(() => advance(), 340)
  }

  function handleFinish() {
    setStackReady(false)
    setIsGenerating(true)
    void generateStack()
    onComplete()
  }

  async function generateStack() {
    try {
      const { buildStackBlueprint } = await import('@/lib/stack-blueprint')
      const { personaliseBlueprint } = await import('@/lib/stack-blueprint/personalise')
      const catalogueProducts = useQuizStore.getState().catalogueProducts
      const baseBlueprint = buildStackBlueprint(answers, catalogueProducts)
      const [identity, blueprint] = await Promise.all([
        fetch('/api/generate-identity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(answers),
        }).then(r => r.json()).catch(() => FALLBACK_IDENTITY),
        personaliseBlueprint(answers, baseBlueprint, catalogueProducts),
      ])
      setIdentity(identity ?? FALLBACK_IDENTITY)
      setStackLevel(levelForStackPreference(answers.stackPreference))
      useQuizStore.getState().setStackBlueprint(blueprint)
    } catch {
      if (!useQuizStore.getState().identity) setIdentity(FALLBACK_IDENTITY)
    } finally {
      useQuizStore.getState().setStackReady(true)
    }
  }

  // ─── Derived state ───────────────────────────────────────────────────────────

  const canContinue = (() => {
    switch (id) {
      case 'goals': return !!answers.track && answers.goals.length > 0
      case 'personal': return !!localAge
      case 'lifestyle': case 'supps': case 'formats': case 'review': return true
      case 'budget': return !!answers.budget
      default: return false
    }
  })()

  const slideClass = reducedMotion
    ? ''
    : direction === 'forward'
      ? 'animate-[slide-from-right_0.32s_cubic-bezier(0.22,1,0.36,1)_both]'
      : 'animate-[slide-from-left_0.32s_cubic-bezier(0.22,1,0.36,1)_both]'

  // ─── Review summary rows ─────────────────────────────────────────────────────

  function reviewRows(): Array<{ label: string; value: string; edit: StepId }> {
    const rows: Array<{ label: string; value: string; edit: StepId }> = []
    rows.push({ label: 'Goals', value: answers.goals.map(g => GOAL_LABELS[g] ?? g).join(', ') || '—', edit: 'goals' })
    if (localAge) rows.push({ label: 'You', value: [localName.trim(), localExactAge ? `${localExactAge}` : localAge].filter(Boolean).join(' · '), edit: 'personal' })
    if (answers.track === 'performance') {
      const t = [labelOf(FREQ_DATA, answers.trainingFrequency), labelOf(TYPE_DATA, answers.trainingType)].filter(Boolean).join(' · ')
      if (t) rows.push({ label: 'Training', value: t, edit: 'frequency' })
    }
    const lifestyleData = answers.track === 'wellbeing' ? WELLBEING_LIFESTYLE_DATA : LIFESTYLE_DATA
    if (answers.lifestyle.length) rows.push({ label: 'Lifestyle', value: labelsOf(lifestyleData, answers.lifestyle).join(', '), edit: 'lifestyle' })
    if (answers.diet) rows.push({ label: 'Diet', value: labelOf(DIET_DATA, answers.diet), edit: 'diet' })
    const have = answers.track === 'wellbeing'
      ? labelsOf(WELLBEING_SUPPS_DATA, answers.currentVitamins)
      : [...labelsOf(SUPPS_DATA, answers.currentSupplements), ...labelsOf(VITAMIN_OPTIONS, answers.currentVitamins)]
    rows.push({ label: 'Already taking', value: have.length ? have.join(', ') : 'Starting fresh', edit: 'supps' })
    if (answers.caffeineLevel) rows.push({ label: 'Caffeine', value: labelOf(CAFFEINE_DATA, answers.caffeineLevel), edit: 'caffeine' })
    if (answers.preferredFormats.length) rows.push({ label: 'Formats', value: answers.preferredFormats.includes('any') ? 'No preference' : labelsOf(FORMAT_DATA, answers.preferredFormats).join(', '), edit: 'formats' })
    const b = BUDGET_DATA.find(x => x.id === answers.budget)
    if (b) rows.push({ label: 'Budget', value: `${b.name} · ${b.budget}`, edit: 'budget' })
    return rows
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed top-0 left-0 right-0 h-[100dvh] bg-[#0A0A0A] text-white flex flex-col overflow-hidden">

      {/* Charge rail — the getCHRGD signature, always in frame */}
      <ChargeRail charge={charge} surgeKey={surgeKey} reducedMotion={reducedMotion} />

      {/* A whisper of charge at the floor — calm, never competes with the question */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-0"
        style={{ height: 180, background: 'radial-gradient(120% 100% at 50% 135%, rgba(0,212,255,0.06), transparent 70%)' }}
      />

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
            <p className="text-xl font-semibold text-white mb-1.5 tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Fully charged
            </p>
            <p className="text-sm text-white/35">Powering on your personalised stack…</p>
          </div>
          <div className="flex gap-1.5 mt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-1.5 w-6 rounded-full bg-[#00D4FF] animate-pulse"
                style={{ boxShadow: '0 0 8px rgba(0,212,255,0.5)', animationDelay: `${i * 0.18}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* Brand + progress bar (persistent) */}
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
          {id === 'review' ? 'FINAL STEP' : `${index + 1} / ${seq.length - 1}`}
        </span>
      </div>

      {/* Header zone — eyebrow + question + hint (always framed) */}
      <div className="relative z-10 shrink-0 pl-5 pr-[42px] pt-4 pb-4">
        <div key={`h-${id}-${animKey}`} className={`max-w-lg mx-auto w-full ${slideClass}`}>
          <span
            className="text-[10px] font-semibold tracking-[0.26em] uppercase text-white/35 mb-3 block"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {section}
          </span>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.02em] text-white outline-none"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {q}
          </h2>
          <p className="text-sm text-white/40 mt-2.5 leading-snug">{hint}</p>
          {isFirst && (
            <p className="text-[11px] text-white/25 mt-2">
              {seq.length - 1} quick questions · about a minute
            </p>
          )}
        </div>
      </div>

      {/* Options zone — the only thing that may scroll, and only within itself */}
      <div className="relative z-10 flex-1 min-h-0">
       <div ref={optionsRef} className="absolute inset-0 overflow-y-auto scrollbar-hide pl-5 pr-[42px] pb-5">
        <div key={`o-${id}-${animKey}`} className={`max-w-lg mx-auto w-full ${slideClass}`}>

          {/* ── Goals (track chooser → goals) ── */}
          {id === 'goals' && !answers.track && (
            <div className="flex flex-col gap-3">
              {([
                { id: 'performance' as const, icon: 'dumbbell', label: 'Performance & training', sub: 'Build muscle, energy, recovery — for people who train' },
                { id: 'wellbeing' as const, icon: 'leaf', label: 'Everyday wellbeing', sub: 'Sleep, stress, focus, immunity — how you feel day to day' },
              ]).map(({ id: tid, icon, label, sub }) => (
                <button
                  key={`track-${tid}`}
                  onClick={() => { setAnswer('track', tid); setGoals([]); setAnswer('wellbeingAnswers', {}) }}
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

          {id === 'goals' && answers.track === 'performance' && (
            <div>
              <div className="grid grid-cols-2 gap-2.5">
                {GOALS_DATA.map(({ id: gid, label, icon }) => (
                  <AnswerOption
                    key={`g-${gid}`}
                    icon={icon} label={label} multi
                    selected={answers.goals.includes(gid)}
                    onClick={() => {
                      const c = answers.goals
                      setGoals(c.includes(gid) ? c.filter(g => g !== gid) : [...c, gid])
                    }}
                  />
                ))}
              </div>
              <button onClick={() => { setAnswer('track', null); setGoals([]) }} className="mt-5 text-xs text-white/30 underline underline-offset-2">
                ← Switch to everyday wellbeing
              </button>
            </div>
          )}

          {id === 'goals' && answers.track === 'wellbeing' && (
            <div>
              <div className="grid grid-cols-2 gap-2.5">
                {WELLBEING_DATA.map(({ id: gid, label, icon }) => (
                  <AnswerOption
                    key={`gw-${gid}`}
                    icon={icon} label={label} multi
                    selected={answers.goals.includes(gid)}
                    onClick={() => {
                      const c = answers.goals
                      setGoals(c.includes(gid) ? c.filter(g => g !== gid) : [...c, gid])
                    }}
                  />
                ))}
                <AnswerOption
                  key="gw-health"
                  icon="leaf" label="General health" multi
                  selected={answers.goals.includes('health')}
                  onClick={() => {
                    const c = answers.goals
                    setGoals(c.includes('health') ? c.filter(g => g !== 'health') : [...c, 'health'])
                  }}
                />
              </div>
              <button onClick={() => { setAnswer('track', null); setGoals([]); setAnswer('wellbeingAnswers', {}) }} className="mt-5 text-xs text-white/30 underline underline-offset-2">
                ← Switch to performance & training
              </button>

              {pickWellbeingQuestions(answers.goals).map((wq) => (
                <div key={`wqblock-${wq.id}`} className="mt-6 pt-5 border-t border-white/8"
                  style={{ animation: reducedMotion ? undefined : 'slide-up-in 0.3s cubic-bezier(0.22,1,0.36,1) both' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-px h-4 bg-[#00D4FF]" />
                    <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#00D4FF]" style={{ fontFamily: 'var(--font-display)' }}>Quick follow-up</span>
                  </div>
                  <p className="text-sm font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>{wq.question}</p>
                  <p className="text-xs text-white/35 mb-3">{wq.hint}</p>
                  <div className="flex flex-col gap-2">
                    {wq.options.map(({ id: oid, label, sub }) => (
                      <AnswerOption
                        key={`wq-${wq.id}-${oid}`}
                        label={label} sub={sub}
                        selected={answers.wellbeingAnswers[wq.id] === oid}
                        onClick={() => setAnswer('wellbeingAnswers', { ...answers.wellbeingAnswers, [wq.id]: oid })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Personal ── */}
          {id === 'personal' && (
            <div className="flex flex-col gap-6">
              <div>
                <label className="text-xs font-bold tracking-widest uppercase text-white/30 mb-2 block" style={{ fontFamily: 'var(--font-display)' }}>
                  First name <span className="normal-case font-normal tracking-normal text-white/15">· optional</span>
                </label>
                <input
                  type="text" value={localName} onChange={(e) => setLocalName(e.target.value)}
                  placeholder="Your first name" autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && localAge) advance() }}
                  className="w-full px-5 py-4 rounded-2xl bg-white/[0.04] border border-white/10 text-white text-sm font-medium placeholder-white/20 focus:outline-none focus:border-[#00D4FF]/50 focus:bg-white/[0.06] transition-colors"
                  style={{ fontFamily: 'var(--font-display)' }}
                />
                <p className="text-[11px] text-white/20 mt-2">Personalises your results</p>
              </div>

              <div>
                <label className="text-xs font-bold tracking-widest uppercase text-white/30 mb-2 block" style={{ fontFamily: 'var(--font-display)' }}>Age</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    { id: '16-24' as AgeBracket, label: 'Under 25' },
                    { id: '25-34' as AgeBracket, label: '25–34' },
                    { id: '35-44' as AgeBracket, label: '35–44' },
                    { id: '45+'  as AgeBracket, label: '45+' },
                  ]).map(({ id: aid, label }) => (
                    <AnswerOption key={`age-${aid}`} label={label} multi selected={localAge === aid} onClick={() => setLocalAge(aid)} />
                  ))}
                </div>
                <div className="mt-4 px-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] text-white/30">For more accurate results, set your exact age</p>
                    {localExactAge !== null && <span className="text-xs font-bold text-[#00D4FF]">{localExactAge}</span>}
                  </div>
                  <input
                    type="range" min={16} max={70} step={1} value={localExactAge ?? 25}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      setLocalExactAge(v)
                      if (v < 25) setLocalAge('16-24')
                      else if (v < 35) setLocalAge('25-34')
                      else if (v < 45) setLocalAge('35-44')
                      else setLocalAge('45+')
                    }}
                    onFocus={() => { if (localExactAge === null) setLocalExactAge(25) }}
                    className="w-full h-1 rounded-full appearance-none cursor-pointer"
                    style={{ background: localExactAge !== null ? `linear-gradient(to right, #00D4FF ${(((localExactAge - 16) / 54) * 100).toFixed(1)}%, rgba(255,255,255,0.12) 0%)` : 'rgba(255,255,255,0.12)' }}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-white/20">16</span>
                    <span className="text-[10px] text-white/20">70+</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold tracking-widest uppercase text-white/30 mb-2 block" style={{ fontFamily: 'var(--font-display)' }}>
                  Gender <span className="normal-case font-normal tracking-normal text-white/15">· optional</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    { id: 'male' as Gender, label: 'Male' },
                    { id: 'female' as Gender, label: 'Female' },
                    { id: 'nonbinary' as Gender, label: 'Non-binary' },
                    { id: 'not-specified' as Gender, label: 'Prefer not to say' },
                  ]).map(({ id: gid, label }) => (
                    <AnswerOption key={`gender-${gid}`} label={label} multi selected={localGender === gid} onClick={() => setLocalGender(prev => prev === gid ? '' : gid)} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Frequency ── */}
          {id === 'frequency' && (
            <div className="flex flex-col gap-2.5">
              {FREQ_DATA.map(({ id: fid, label, sub }) => (
                <AnswerOption key={`f-${fid}`} label={label} sub={sub} selected={answers.trainingFrequency === fid} onClick={() => handleSingle('trainingFrequency', fid)} />
              ))}
            </div>
          )}

          {/* ── Type ── */}
          {id === 'type' && (
            <div className="flex flex-col gap-2.5">
              {TYPE_DATA.map(({ id: tid, label, sub }) => (
                <AnswerOption key={`t-${tid}`} label={label} sub={sub} selected={answers.trainingType === tid} onClick={() => handleSingle('trainingType', tid)} />
              ))}
            </div>
          )}

          {/* ── Lifestyle ── */}
          {id === 'lifestyle' && (
            <div className="grid grid-cols-2 gap-2.5">
              {(answers.track === 'wellbeing' ? WELLBEING_LIFESTYLE_DATA : LIFESTYLE_DATA).map(({ id: lid, label, icon }) => (
                <AnswerOption key={`l-${lid}`} icon={icon} label={label} multi selected={answers.lifestyle.includes(lid)}
                  onClick={() => {
                    const c = answers.lifestyle
                    setAnswer('lifestyle', c.includes(lid) ? c.filter(x => x !== lid) : [...c, lid])
                  }}
                />
              ))}
              <AnswerOption key="l-none" icon="minus" label="None of these" multi selected={answers.lifestyle.length === 0} onClick={() => setAnswer('lifestyle', [])} />
            </div>
          )}

          {/* ── Diet ── */}
          {id === 'diet' && (
            <div className="flex flex-col gap-2.5">
              {DIET_DATA.map(({ id: did, label, sub }) => (
                <AnswerOption key={`d-${did}`} label={label} sub={sub} selected={answers.diet === did} onClick={() => handleSingle('diet', did)} />
              ))}
            </div>
          )}

          {/* ── Supps ── */}
          {id === 'supps' && answers.track === 'wellbeing' && (
            <div className="grid grid-cols-2 gap-2.5">
              {WELLBEING_SUPPS_DATA.map(({ id: sid, label, icon }) => (
                <AnswerOption key={`sw-${sid}`} icon={icon} label={label} multi
                  selected={sid === 'none' ? answers.currentVitamins.length === 0 : answers.currentVitamins.includes(sid)}
                  onClick={() => {
                    if (sid === 'none') { setAnswer('currentVitamins', []); return }
                    const c = answers.currentVitamins
                    setAnswer('currentVitamins', c.includes(sid) ? c.filter(x => x !== sid) : [...c, sid])
                  }}
                />
              ))}
            </div>
          )}
          {id === 'supps' && answers.track !== 'wellbeing' && (
            <div>
              <div className="grid grid-cols-2 gap-2.5">
                {SUPPS_DATA.map(({ id: sid, label, icon }) => (
                  <AnswerOption key={`s-${sid}`} icon={icon} label={label} multi
                    selected={sid === 'none' ? answers.currentSupplements.length === 0 : answers.currentSupplements.includes(sid)}
                    onClick={() => {
                      if (sid === 'none') { setAnswer('currentSupplements', []); setAnswer('currentVitamins', []); return }
                      const c = answers.currentSupplements.filter(x => x !== 'none')
                      setAnswer('currentSupplements', c.includes(sid) ? c.filter(x => x !== sid) : [...c, sid])
                    }}
                  />
                ))}
              </div>
              {answers.currentSupplements.includes('vitamins') && (
                <div className="mt-6 pt-5 border-t border-white/8" style={{ animation: 'slide-up-in 0.3s cubic-bezier(0.22,1,0.36,1) both' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-px h-4 bg-[#00D4FF]" />
                    <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#00D4FF]" style={{ fontFamily: 'var(--font-display)' }}>Which vitamins?</span>
                  </div>
                  <p className="text-xs text-white/35 mb-4">We won&apos;t double up on what you&apos;re already taking</p>
                  <div className="grid grid-cols-2 gap-2">
                    {VITAMIN_OPTIONS.map(({ id: vid, label, icon }) => (
                      <AnswerOption key={`vit-${vid}`} icon={icon} label={label} multi selected={answers.currentVitamins.includes(vid)}
                        onClick={() => {
                          const c = answers.currentVitamins
                          setAnswer('currentVitamins', c.includes(vid) ? c.filter(x => x !== vid) : [...c, vid])
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Caffeine ── */}
          {id === 'caffeine' && (
            <div className="flex flex-col gap-2.5">
              {CAFFEINE_DATA.map(({ id: cid, label, sub }) => (
                <AnswerOption key={`c-${cid}`} label={label} sub={sub} selected={answers.caffeineLevel === cid} onClick={() => handleSingle('caffeineLevel', cid)} />
              ))}
            </div>
          )}

          {/* ── Training time ── */}
          {id === 'trainingTime' && (
            <div className="flex flex-col gap-2.5">
              {TRAINING_TIME_DATA.map(({ id: tid, label, sub }) => (
                <AnswerOption key={`tt-${tid}`} label={label} sub={sub} selected={answers.trainingTime === tid} onClick={() => handleSingle('trainingTime', tid)} />
              ))}
            </div>
          )}

          {/* ── Formats ── */}
          {id === 'formats' && (
            <div className="flex flex-col gap-2.5">
              {FORMAT_DATA.map(({ id: fid, label, sub, icon }) => (
                <AnswerOption key={`fmt-${fid}`} icon={icon} label={label} sub={sub} multi
                  selected={fid === 'any' ? answers.preferredFormats.includes('any') : answers.preferredFormats.includes(fid) && !answers.preferredFormats.includes('any')}
                  onClick={() => {
                    if (fid === 'any') { setAnswer('preferredFormats', answers.preferredFormats.includes('any') ? [] : ['any']); return }
                    const c = answers.preferredFormats.filter(x => x !== 'any')
                    setAnswer('preferredFormats', c.includes(fid) ? c.filter(x => x !== fid) : [...c, fid])
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Budget ── */}
          {id === 'budget' && (
            <div className="flex flex-col gap-4">
              {BUDGET_DATA.map(({ id: bid, name, budget, sub, pref, icon }, i) => {
                const active = answers.budget === bid
                const preview = bundlePreviews[i] ?? { titles: [], freeDelivery: false }
                const contents = preview.titles
                const actualCount = contents.length
                const badge = BUNDLE_BADGE[bid]
                const featured = bid === '50-80' // the hero of the ladder
                return (
                  <button
                    key={`b-${bid}`}
                    onClick={() => { setAnswer('budget', bid); setAnswer('stackPreference', pref) }}
                    className={['relative w-full flex flex-col px-5 pt-4 pb-4 rounded-2xl border text-left transition-all duration-200 active:scale-[0.99]',
                      active
                        ? 'border-[#00D4FF] bg-[#00D4FF]/[0.08] text-white shadow-[0_0_30px_-12px_#00D4FF]'
                        : featured
                          ? 'border-[#00D4FF]/35 bg-white/[0.03] text-white/85'
                          : 'border-white/[0.08] bg-white/[0.015] text-white/75 hover:border-white/25 hover:bg-white/[0.04]'].join(' ')}
                  >
                    {/* Merchandising badge — good / better / best */}
                    {badge && (
                      <span
                        className={['absolute -top-2.5 left-4 px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-[0.14em] uppercase',
                          active || featured ? 'bg-[#00D4FF] text-[#0A0A0A]' : 'bg-white/15 text-white/80'].join(' ')}
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {badge}
                      </span>
                    )}

                    {/* Header: name + price */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <QuizIcon name={icon} size={20} className={`shrink-0 transition-colors duration-200 ${active ? 'text-[#00D4FF]' : 'text-white/45'}`} />
                        <span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-[16px] font-bold leading-none ${active ? 'text-white' : 'text-white/85'}`} style={{ fontFamily: 'var(--font-display)' }}>{budget}</div>
                        <div className={`text-[10px] font-medium mt-1 ${active ? 'text-white/55' : 'text-white/35'}`}>one-off price</div>
                      </div>
                    </div>

                    {/* Punchy one-liner */}
                    <p className={`text-[13px] leading-snug mt-2 ${active ? 'text-white/65' : 'text-white/40'}`}>{sub}</p>

                    {/* What you get — the sales tick-list */}
                    {contents.length > 0 && (
                      <div className="mt-3.5 flex flex-col gap-1.5">
                        {contents.map((title, ci) => (
                          <div key={`${bid}-c-${ci}`} className="flex items-center gap-2">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                              <circle cx="7" cy="7" r="7" fill={active ? '#00D4FF' : 'rgba(0,212,255,0.18)'} />
                              <path d="M4 7.1l1.9 1.9L10 5" stroke={active ? '#0A0A0A' : '#00D4FF'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className={`text-[13px] ${active ? 'text-white/90' : 'text-white/65'}`}>{title}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Free delivery perk (order over the free-delivery threshold) */}
                    {preview.freeDelivery && (
                      <div className="mt-3 flex items-center gap-2">
                        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className="shrink-0">
                          <path d="M1.5 5.5h9v7h-9v-7Z" stroke={active ? '#00D4FF' : '#00D4FF'} strokeWidth="1.3" strokeLinejoin="round" />
                          <path d="M10.5 8h4l3 3v1.5h-7V8Z" stroke="#00D4FF" strokeWidth="1.3" strokeLinejoin="round" />
                          <circle cx="5" cy="14.5" r="1.6" stroke="#00D4FF" strokeWidth="1.3" />
                          <circle cx="14.5" cy="14.5" r="1.6" stroke="#00D4FF" strokeWidth="1.3" />
                        </svg>
                        <span className={`text-[12px] font-semibold ${active ? 'text-[#00D4FF]' : 'text-[#00D4FF]/85'}`}>Free delivery included</span>
                      </div>
                    )}

                    {/* Footer count */}
                    <div className={`mt-3.5 pt-3 border-t flex items-center justify-between ${active ? 'border-[#00D4FF]/20' : 'border-white/[0.06]'}`}>
                      <span className={`text-[11px] font-semibold ${active ? 'text-white/70' : 'text-white/35'}`}>
                        {actualCount > 0 ? `${actualCount} product${actualCount !== 1 ? 's' : ''} in this bundle` : 'Tailored to your goals'}
                      </span>
                      <span className={`text-[11px] font-bold tracking-wide ${active ? 'text-[#00D4FF]' : 'text-white/30'}`} style={{ fontFamily: 'var(--font-display)' }}>
                        {active ? 'Selected ✓' : 'Choose'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Review ── */}
          {id === 'review' && (
            <div className="flex flex-col gap-2">
              {reviewRows().map((r) => (
                <button key={r.label} onClick={() => jumpTo(r.edit)}
                  className="w-full flex items-start justify-between gap-3 px-4 py-3.5 rounded-xl border border-white/[0.08] bg-white/[0.015] text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.04] active:scale-[0.99]">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-white/30" style={{ fontFamily: 'var(--font-display)' }}>{r.label}</p>
                    <p className="text-sm font-medium text-white mt-1 leading-snug">{r.value}</p>
                  </div>
                  <span className="text-[11px] font-semibold text-[#00D4FF] flex-shrink-0 mt-0.5">Edit</span>
                </button>
              ))}
            </div>
          )}

          {/* Sub-question */}
          {subQuestion && (
            <div ref={subRef} className="mt-8 pt-6 border-t border-white/8 scroll-mt-4" style={{ animation: reducedMotion ? undefined : 'slide-up-in 0.3s cubic-bezier(0.22,1,0.36,1) both' }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-px h-4 bg-[#00D4FF]" />
                <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#00D4FF]" style={{ fontFamily: 'var(--font-display)' }}>Follow-up</span>
              </div>
              <p className="text-base font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>{subQuestion.question}</p>
              <p className="text-xs text-white/35 mb-4">{subQuestion.hint}</p>
              <div className="flex flex-col gap-2">
                {subQuestion.options.map((opt) => (
                  <AnswerOption key={`sub-${subQuestion.id}-${opt.id}`} label={opt.label} sub={opt.sub} selected={subAnswerId === opt.id} onClick={() => handleSubAnswer(subQuestion.id, opt.id)} />
                ))}
              </div>
            </div>
          )}

        </div>
       </div>

        {/* "More below" cue — appears whenever the options region has hidden
            content underneath (e.g. a follow-up that needs answering). */}
        {moreBelow && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 pr-[42px]">
            <div className="mx-auto max-w-lg h-14 flex items-end justify-center pb-1.5 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/85 to-transparent">
              <span className="text-[#00D4FF]/85" style={{ animation: reducedMotion ? undefined : 'chevron-bounce 1.4s ease-in-out infinite' }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* CTA footer — an in-flow zone (no page scroll), shown on manual steps */}
      {current.advance === 'manual' && (
        <div className="relative z-20 shrink-0 pl-5 pr-[42px] pt-3 pb-7 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A] to-transparent">
          <div className="max-w-lg mx-auto">
            <button
              onClick={advance}
              disabled={!canContinue}
              className={`w-full py-4 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.99] ${
                canContinue
                  ? (id === 'review' || id === 'budget') ? 'bg-[#00D4FF] text-[#0A0A0A]' : 'bg-white text-[#0A0A0A]'
                  : 'bg-white/[0.06] text-white/25 cursor-not-allowed'
              }`}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {id === 'review' ? 'Build my stack'
                : id === 'budget' ? 'Review my answers'
                : id === 'goals' && answers.goals.length > 0 ? `Continue with ${answers.goals.length} goal${answers.goals.length > 1 ? 's' : ''}`
                : id === 'personal' && localName.trim() ? `Continue, ${localName.trim()}`
                : 'Continue'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
