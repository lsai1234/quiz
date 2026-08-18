'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import { useQuizStore } from '@/lib/store'
import { levelForStackPreference } from '@/lib/stack-blueprint/pricing'
import { activeSteps, stepCopy, selectHint, type StepId } from '@/lib/quiz-flow'
import { withDeepDiveSignals } from '@/lib/ai-questions'
import { maybePrefetchDeepDive, applyDeepDiveFallback, DEEP_DIVE_WAIT_MS } from '@/lib/deep-dive'
import { ChargeRail } from '@/components/quiz/ChargeRail'
import { LiquidRail } from '@/components/quiz/LiquidRail'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import { quizFactFor, type QuizFact } from '@/lib/quiz-sell'
import { funnel } from '@/lib/analytics/quiz'
import type {
  Goal, TrainingFrequency, TrainingType, DietLevel,
  CaffeineLevel,
  TrainingExperience, StimPreference, AgeBracket, Gender, StackIdentity,
  DailyDrinks, WorkoutAddOn, SafetyFlag, WeightBand,
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

// Safety screen — a private, remove-only filter. Ticking a flag drops
// contraindicated products from the recommendation (never adds anything).
const SAFETY_DATA: Array<{ id: SafetyFlag; label: string }> = [
  { id: 'pregnancy',  label: 'Pregnant or breastfeeding' },
  { id: 'medication', label: 'On prescription medication' },
]

// Age brackets. The id is a range and the label is prose ("Under 25"), so this
// has to be looked up like any other answer rather than printed raw — see the
// "You" row in `reviewRows`.
const AGE_DATA: Array<{ id: AgeBracket; label: string }> = [
  { id: '16-24', label: 'Under 25' },
  { id: '25-34', label: '25–34' },
  { id: '35-44', label: '35–44' },
  { id: '45+',   label: '45+' },
]

// Bodyweight bands (optional) — scale weight-sensitive dosing (protein). Bands,
// never an exact figure.
const WEIGHT_DATA: Array<{ id: WeightBand; label: string }> = [
  { id: 'under-60', label: 'Under 60kg' },
  { id: '60-75',    label: '60–75kg' },
  { id: '75-90',    label: '75–90kg' },
  { id: '90-105',   label: '90–105kg' },
  { id: '105-plus', label: '105kg+' },
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
  { id: 'joint-issues', label: 'Joint or old injuries',      icon: 'bone' },
]
const DIET_DATA: Array<{ id: DietLevel; label: string; sub: string }> = [
  { id: 'clean',        label: 'Cooked from scratch',   sub: 'Mostly home-cooked and planned' },
  { id: 'mostly-good',  label: 'Decent but rushed',     sub: 'Healthy-ish, not much time' },
  { id: 'inconsistent', label: "Grab whatever's easy",  sub: 'Convenience-led — good and bad days' },
  { id: 'poor',         label: 'All over the place',    sub: 'No real routine right now' },
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

// "Already taking" items that actually drive a recommendation exclusion in
// scoreProduct — the candidates for the keep-yours-or-try-ours follow-up.
// (Ids like 'b-complex'/'zinc'/'other' don't exclude anything, so no follow-up.)
const EXCLUDABLE_SUPPS = new Set([
  'protein', 'creatine', 'pre-workout',
  'multivitamin', 'vitamin-d', 'omega-3', 'magnesium', 'vitamin-c', 'collagen',
])
const SUPP_LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  [...SUPPS_DATA, ...VITAMIN_OPTIONS, ...WELLBEING_SUPPS_DATA].map(({ id, label }) => [id, label]),
)
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
  { id: 'high',   label: 'I run on it',     sub: '3+ coffees, used to pre-workout' },
]
// Budget is no longer asked in the quiz — the full stack is built and the
// customer chooses a depth (Essentials / Balanced / Complete) on the results
// screen, value before price (see StackReviewPage tiers).

// LQD FOUNDATION — how many drinks on a normal day. Not a dose: it tunes the
// "your box lasts ~X days" story, never the amounts. `fills` drives the little
// liquid-level graphic on each option.
const DAILY_DRINKS_DATA: Array<{ id: DailyDrinks; label: string; sub: string; fills: number }> = [
  { id: 1, label: 'One a day',  sub: 'A single go-to drink — easy does it',      fills: 1 },
  { id: 2, label: 'A couple',   sub: 'Morning and later — the sweet spot',       fills: 2 },
  { id: 3, label: 'Three+',     sub: 'A drink with most meals',                  fills: 3 },
]

// LQD WORKOUT ADD-ONS — a single opt-in pre-workout drink (performance route
// only). The protein/recovery options were inert (the daily base already covers
// those slots), so it's now one toggle that adds/keeps the pre-workout line.
const WORKOUT_ADDON_DATA: Array<{ id: WorkoutAddOn; label: string; sub: string }> = [
  { id: 'pre-workout', label: 'Yes — add a pre-workout drink', sub: 'A hit of energy & focus before you train' },
]

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
function CheckMark({ selected, reduced, multi }: { selected: boolean; reduced?: boolean; multi?: boolean }) {
  return (
    <div
      className={[
        // Square (checkbox) for multi-select, circle (radio) for single — a
        // second, at-a-glance cue for "add more" vs "pick one".
        'shrink-0 w-[18px] h-[18px] flex items-center justify-center border transition-all duration-200',
        multi ? 'rounded-[6px]' : 'rounded-full',
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
          <CheckMark selected={selected} multi />
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

// A little liquid glass for the LQD pace step: fills to `level` (0–1) with a
// drifting meniscus wave. Selected → accent fill; otherwise a calm ghost.
function PaceGlass({ level, selected, reduced }: { level: number; selected: boolean; reduced?: boolean }) {
  const fillPct = Math.max(10, Math.min(100, Math.round(level * 100)))
  const liquid = selected ? '#00D4FF' : 'rgba(255,255,255,0.22)'
  return (
    <div
      className="relative w-9 h-11 rounded-b-[10px] rounded-t-[4px] overflow-hidden shrink-0 border transition-colors duration-200"
      style={{ borderColor: selected ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.02)' }}
      aria-hidden="true"
    >
      <div className="absolute inset-x-0 bottom-0 transition-[height] duration-500" style={{ height: `${fillPct}%`, background: liquid, opacity: selected ? 0.9 : 0.55 }}>
        {/* meniscus wave riding the surface */}
        <div
          className="absolute -top-1 left-0 h-2 w-[200%] rounded-[50%]"
          style={{
            background: liquid,
            animation: reduced ? undefined : 'lqd-wave-x 2.6s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  )
}

// The odd "did you know?" — a calm, non-blocking aside that fades in on a few
// steps and drifts away on its own. Tappable to dismiss early.
function DidYouKnowChip({ cue, reduced, onDismiss }: { cue: QuizFact; reduced: boolean; onDismiss: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-5" style={{ bottom: 104 }}>
      <button
        key={cue.id}
        onClick={onDismiss}
        aria-label="Dismiss"
        className="pointer-events-auto flex items-start gap-2.5 max-w-md text-left rounded-2xl pl-3 pr-4 py-2.5 border backdrop-blur-md"
        style={{
          background: 'linear-gradient(100deg, rgba(0,212,255,0.14), rgba(0,212,255,0.05))',
          borderColor: 'rgba(0,212,255,0.3)',
          boxShadow: '0 8px 30px -12px rgba(0,212,255,0.45)',
          animation: reduced ? undefined : 'cue-pop 0.45s cubic-bezier(0.22,1,0.36,1) both',
        }}
      >
        <span
          className="mt-0.5 shrink-0 flex items-center justify-center w-6 h-6 rounded-full"
          style={{ background: 'rgba(0,212,255,0.16)' }}
        >
          <QuizIcon name={cue.icon} size={14} className="text-[#00D4FF]" />
        </span>
        <span className="min-w-0">
          <span className="block text-[9px] font-bold tracking-[0.2em] uppercase text-[#00D4FF]/80 mb-0.5" style={{ fontFamily: 'var(--font-display)' }}>
            Did you know?
          </span>
          <span className="block text-[12.5px] leading-snug text-white/85">{cue.text}</span>
        </span>
      </button>
    </div>
  )
}

// ─── Deep-dive loading — the AI writing your questions ───────────────────────
// A charged "thinking" moment in the house language: the bolt breathes inside
// a glass orb with an orbiting spark, status copy cycles, and two ghost
// question cards shimmer where the real ones will land.

const DD_MESSAGES = ['Reading your answers…', 'Spotting the patterns…', 'Writing your questions…']

function DeepDiveLoading({ reducedMotion }: { reducedMotion: boolean }) {
  const [msg, setMsg] = useState(0)

  useEffect(() => {
    if (reducedMotion) return
    const t = setInterval(() => setMsg((m) => Math.min(m + 1, DD_MESSAGES.length - 1)), 1500)
    return () => clearInterval(t)
  }, [reducedMotion])

  return (
    <div aria-live="polite" aria-busy="true" className="flex flex-col items-center pt-2">
      {/* Bolt orb */}
      <div className="relative mb-5" style={{ width: 64, height: 64 }}>
        <div
          className="absolute inset-0 rounded-full flex items-center justify-center"
          style={{
            background: 'radial-gradient(circle at 38% 30%, rgba(0,212,255,0.16), rgba(0,212,255,0.04) 60%)',
            boxShadow: 'inset 0 0 0 1px rgba(0,212,255,0.25), 0 0 18px -4px rgba(0,212,255,0.55)',
            animation: reducedMotion ? undefined : 'dd-orb 2s ease-in-out infinite',
          }}
        >
          <svg width="20" height="26" viewBox="0 0 100 115" fill="none">
            <path d="M58 22L32 62H51L40 97L76 52H57L58 22Z" fill="#00D4FF" style={{ filter: 'drop-shadow(0 0 6px rgba(0,212,255,0.8))' }} />
          </svg>
        </div>
        {!reducedMotion && (
          <div className="absolute top-1/2 left-1/2" style={{ animation: 'dd-orbit 2.6s linear infinite' }}>
            <div className="rounded-full" style={{ width: 4, height: 4, marginLeft: -2, marginTop: -2, background: '#fff', boxShadow: '0 0 8px 2px rgba(0,212,255,0.9)' }} />
          </div>
        )}
      </div>

      {/* Cycling status */}
      <p
        key={`ddmsg-${msg}`}
        className="text-[13px] font-medium text-white/60 mb-7"
        style={{ fontFamily: 'var(--font-display)', animation: reducedMotion ? undefined : 'fade-up 0.4s ease-out both' }}
      >
        {reducedMotion ? 'Writing your questions…' : DD_MESSAGES[msg]}
      </p>

      {/* Ghost question cards — the shape of what's coming */}
      <div className="w-full flex flex-col gap-6">
        {[0, 1].map((card) => (
          <div
            key={`dd-ghost-${card}`}
            className="relative w-full overflow-hidden"
            style={{ animation: reducedMotion ? undefined : `slide-up-in 0.4s cubic-bezier(0.22,1,0.36,1) ${card * 0.12}s both` }}
          >
            <div className="h-3.5 rounded-full mb-2" style={{ width: card === 0 ? '72%' : '58%', background: 'rgba(255,255,255,0.08)' }} />
            <div className="h-2.5 rounded-full mb-3.5" style={{ width: '42%', background: 'rgba(255,255,255,0.045)' }} />
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((row) => (
                <div key={`dd-ghost-${card}-${row}`} className="h-[46px] rounded-xl border border-white/[0.06] bg-white/[0.02]" />
              ))}
            </div>
            {/* light sweep across the whole card */}
            {!reducedMotion && (
              <div
                className="absolute inset-y-0 pointer-events-none"
                style={{
                  width: '32%',
                  background: 'linear-gradient(100deg, transparent, rgba(0,212,255,0.05) 40%, rgba(255,255,255,0.08) 50%, rgba(0,212,255,0.05) 60%, transparent)',
                  animation: `charge-shimmer 2s ease-in-out ${card * 0.4}s infinite`,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
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
    deepDiveQuestions, deepDiveStatus,
  } = useQuizStore()

  // Active step sequence for the chosen track (single source of truth).
  const seq = useMemo(() => activeSteps(answers.track, answers.drinksMode, { track: answers.track }), [answers.track, answers.drinksMode])
  const index = Math.min(step, seq.length - 1)
  const current = seq[index]
  const id = current.id
  const { section, q, hint } = stepCopy(current, answers.track, answers.drinksMode)
  const isFirst = index === 0

  // Selected already-taking items eligible for the keep-yours-or-try-ours
  // follow-up on the supps step (only ids that drive a factory exclusion).
  const tryOursItems = useMemo(() => {
    const ids = [...answers.currentSupplements, ...answers.currentVitamins].filter((x) =>
      EXCLUDABLE_SUPPS.has(x),
    )
    return [...new Set(ids)].map((tid) => ({ id: tid, label: SUPP_LABEL_BY_ID[tid] ?? tid }))
  }, [answers.currentSupplements, answers.currentVitamins])

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

  // ── Funnel instrumentation (Phase 0) ──────────────────────────────────────
  // Timing + guards for the analytics events. `stepEnterRef` clocks time-on-step,
  // `startTsRef` the whole run; `currentStepRef` lets the unload handler report the
  // step the user abandoned on. `completedRef` suppresses an abandon after a build.
  const startTsRef = useRef(0)
  const stepEnterRef = useRef(0)
  const currentStepRef = useRef<{ id: StepId; index: number }>({ id, index })
  const startedRef = useRef(false)
  const completedRef = useRef(false)

  // ── Charge rail (the getCHRGD signature) — climbs as you answer ──
  // Tops out at ~92% in the quiz; Act 3 finishes the charge and "powers on".
  // The optional deepDive step sits after review, so review is full charge
  // and deepDive just holds it there.
  const charge = Math.min(92, Math.round(8 + (index / Math.max(1, seq.length - 2)) * 84))
  const [surgeKey, setSurgeKey] = useState(0)
  const prevChargeRef = useRef(charge)
  useEffect(() => {
    if (charge > prevChargeRef.current) setSurgeKey((k) => k + 1)
    prevChargeRef.current = charge
  }, [charge])

  // CHRGD LQD — the whole run is drinks & convenience: the rail becomes a
  // filling liquid tube and the floor a rising pool.
  const drinksMode = !!answers.drinksMode

  // ── The odd "did you know?" ── a light brand tidbit on a few steps only,
  // each shown at most once, so it's an occasional aside — never per-tap.
  const [cue, setCue] = useState<QuizFact | null>(null)
  const shownFactsRef = useRef<Set<string>>(new Set())
  const cueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cueDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const fact = quizFactFor(id, drinksMode)
    // Clear anything showing when we land on a new step.
    setCue(null)
    if (cueTimerRef.current) clearTimeout(cueTimerRef.current)
    if (cueDelayRef.current) clearTimeout(cueDelayRef.current)
    if (!fact || shownFactsRef.current.has(fact.id)) return
    // Surface it a beat after the step settles (so it doesn't fight the
    // question), then let it drift away on its own.
    cueDelayRef.current = setTimeout(() => {
      shownFactsRef.current.add(fact.id)
      setCue(fact)
      cueTimerRef.current = setTimeout(() => setCue(null), 5200)
    }, 1100)
  }, [id, drinksMode])
  useEffect(() => () => {
    if (cueTimerRef.current) clearTimeout(cueTimerRef.current)
    if (cueDelayRef.current) clearTimeout(cueDelayRef.current)
  }, [])

  // Personal-info local state (written to the store on advance).
  const [localName, setLocalName] = useState(answers.name || '')
  const [localAge, setLocalAge] = useState<AgeBracket | ''>(answers.ageBracket || '')
  const [localGender, setLocalGender] = useState<Gender | ''>(answers.gender || '')
  const [localWeight, setLocalWeight] = useState<WeightBand | ''>(answers.weightBand ?? '')

  // Move focus to the question on every step change (orientation + a11y).
  useEffect(() => {
    if (reducedMotion) return
    const t = setTimeout(() => headingRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [index, reducedMotion])

  // Funnel: quiz_start (once) + an abandon beacon on tab-close/navigation, fired
  // only if the run wasn't completed. `pagehide` is the reliable mobile signal.
  useEffect(() => {
    startTsRef.current = performance.now()
    if (!startedRef.current) {
      startedRef.current = true
      funnel.start({ track: answers.track, drinksMode: !!answers.drinksMode })
    }
    const onLeave = () => {
      if (completedRef.current) return
      funnel.abandon({
        lastStepId: currentStepRef.current.id,
        index: currentStepRef.current.index,
        msTotal: Math.round(performance.now() - startTsRef.current),
      })
    }
    window.addEventListener('pagehide', onLeave)
    return () => window.removeEventListener('pagehide', onLeave)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Funnel: a step became active — quiz_step_view (+ the deep-dive offer when the
  // review screen first shows it). Also clocks time-on-step for quiz_step_complete.
  useEffect(() => {
    currentStepRef.current = { id, index }
    stepEnterRef.current = performance.now()
    funnel.stepView({
      stepId: id, index, total: Math.max(1, seq.length - 2),
      track: answers.track, drinksMode: !!answers.drinksMode,
    })
    if (id === 'review' && Object.keys(answers.dynamicAnswers ?? {}).length === 0) {
      funnel.deepDiveOffer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, index])

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
  // Every step starts at the top of its options — without this, the scroll
  // offset left by a long previous step (e.g. a scrolled review list) carries
  // over and the next step opens mid-content.
  useEffect(() => {
    optionsRef.current?.scrollTo({ top: 0 })
  }, [index])

  // Recompute after content swaps (step change, sub-question, answer toggles).
  useEffect(() => {
    const t = setTimeout(recomputeMoreBelow, 80)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, animKey, subQuestion, index, answers])

  // Prefetch the AI deep-dive questions on arrival at review, so if the user
  // takes the "go deeper" offer the questions are already waiting. On the
  // deep-dive step itself: make sure generation is running (covers back-edits
  // that changed the answers), and if it still isn't ready after the wait
  // budget, fall back to the static question bank rather than blocking.
  useEffect(() => {
    if (id === 'review') { maybePrefetchDeepDive(); return }
    if (id !== 'deepDive') return
    maybePrefetchDeepDive()
    if (useQuizStore.getState().deepDiveStatus === 'ready') return
    const t = setTimeout(applyDeepDiveFallback, DEEP_DIVE_WAIT_MS)
    return () => clearTimeout(t)
  }, [id])

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
    setAnswer('weightBand', (localWeight || null) as WeightBand | null)
  }

  function advance() {
    clearPending()
    funnel.stepComplete({ stepId: id, index, msOnStep: Math.round(performance.now() - stepEnterRef.current) })
    setSubQuestion(null)
    setSubAnswerId(null)
    if (id === 'personal') commitPersonal()
    // Both closing steps build the stack: review directly ("straight to
    // results"), deepDive after the optional extra questions.
    if (id === 'review' || id === 'deepDive') { handleFinish(); return }
    setDirection('forward')
    setAnimKey((k) => k + 1)
    setStep(Math.min(index + 1, seq.length - 1))
  }

  // Opt in to the optional AI deep-dive from the review screen.
  function goDeeper() {
    clearPending()
    const i = seq.findIndex((s) => s.id === 'deepDive')
    if (i < 0) return
    funnel.deepDiveAccept()
    setDirection('forward')
    setAnimKey((k) => k + 1)
    setStep(i)
  }

  function goBack() {
    clearPending()
    funnel.stepBack({ from: id, to: seq[Math.max(index - 1, 0)]?.id, via: 'back' })
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
    funnel.stepBack({ from: id, to: target, via: 'edit' })
    setSubQuestion(null)
    setSubAnswerId(null)
    setDirection('back')
    setAnimKey((k) => k + 1)
    setStep(i)
  }

  // Main training style — single-select (the old multi-select never reached the
  // engine unless exactly one was chosen; picking one always drives the focus
  // follow-up that actually shapes the stack).
  function handleSelectType(tid: TrainingType) {
    setAnswer('trainingType', [tid])
    // Clear any focus carried over from a previously-chosen style that no longer
    // applies (only strength/sport reveal a focus follow-up).
    const followUp = getSubQuestion('type', tid)
    if (!followUp) setAnswer('trainingFocus', null)
  }

  // Single-select: auto-advance after a brief beat so the choice registers.
  function handleSingle(key: string, value: string) {
    setAnswer(key as keyof typeof answers, value as never)
    clearPending()
    const sub = getSubQuestion(id, value)
    if (sub) {
      pendingTimerRef.current = setTimeout(() => { setSubAnswerId(null); setSubQuestion(sub); funnel.subView({ subId: sub.id, parentStepId: id }) }, 200)
      return
    }
    pendingTimerRef.current = setTimeout(() => advance(), 340)
  }

  function handleSubAnswer(subId: string, optId: string) {
    setSubAnswerId(optId)
    funnel.subAnswer({ subId, parentStepId: id, optionId: optId })
    if (subId === 'experience') setAnswer('trainingExperience', optId as TrainingExperience)
    else if (subId === 'strengthFocus' || subId === 'sportType') setAnswer('trainingFocus', optId)
    else if (subId === 'stim') setAnswer('stimPreference', optId as StimPreference)
    clearPending()
    pendingTimerRef.current = setTimeout(() => advance(), 340)
  }

  function handleFinish() {
    completedRef.current = true
    funnel.complete({
      track: answers.track,
      drinksMode: !!answers.drinksMode,
      goalCount: answers.goals.length,
      primaryGoal: answers.primaryGoal ?? answers.goals[0],
      budget: answers.budget,
      msTotal: Math.round(performance.now() - startTsRef.current),
    })
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
      // Deep-dive signal tags folded into lifestyle sharpen the deterministic
      // ranking; the raw Q&A transcript rides along in dynamicAnswers for the
      // AI prompts.
      const engineAnswers = withDeepDiveSignals(answers)
      const baseBlueprint = buildStackBlueprint(engineAnswers, catalogueProducts)
      const [identity, blueprint] = await Promise.all([
        fetch('/api/generate-identity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(engineAnswers),
        }).then(r => r.json()).catch(() => FALLBACK_IDENTITY),
        personaliseBlueprint(engineAnswers, baseBlueprint, catalogueProducts),
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
      case 'safety': case 'lifestyle': case 'deepDive': case 'supps': case 'formats': case 'review': return true
      // Workout add-ons are optional — always allowed to continue (with or without picks).
      case 'workoutAddOns': return true
      case 'type': return answers.trainingType.length > 0
      default: return false
    }
  })()

  // The "how to answer" pill (single source: the step's select mode).
  const selectPill = selectHint(current.select)

  // When Continue is disabled, say exactly what's missing rather than leaving a
  // dead grey button the user has to puzzle over.
  const continueNeeds = (() => {
    if (canContinue) return null
    switch (id) {
      case 'goals': return 'Pick at least one goal'
      case 'personal': return 'Add your age to continue'
      case 'type': return 'Pick your main style'
      default: return null
    }
  })()

  // Style follow-up shown only when exactly one training style is chosen.
  const typeFollowUp = answers.trainingType.length === 1
    ? getSubQuestion('type', answers.trainingType[0])
    : null

  const slideClass = reducedMotion
    ? ''
    : direction === 'forward'
      ? 'animate-[slide-from-right_0.32s_cubic-bezier(0.22,1,0.36,1)_both]'
      : 'animate-[slide-from-left_0.32s_cubic-bezier(0.22,1,0.36,1)_both]'

  // ─── Review summary rows ─────────────────────────────────────────────────────

  function reviewRows(): Array<{ label: string; value: string; edit: StepId }> {
    const rows: Array<{ label: string; value: string; edit: StepId }> = []
    rows.push({ label: 'Goals', value: answers.goals.map(g => GOAL_LABELS[g] ?? g).join(', ') || '—', edit: 'goals' })
    if ((answers.safetyFlags ?? []).length) {
      rows.push({ label: 'To factor in', value: labelsOf(SAFETY_DATA, answers.safetyFlags ?? []).join(', '), edit: 'safety' })
    }
    if (answers.drinksMode && answers.dailyDrinks) {
      const pace = DAILY_DRINKS_DATA.find((d) => d.id === answers.dailyDrinks)
      if (pace) rows.push({ label: 'Daily drinks', value: `${pace.label} · ${pace.id === 3 ? '3+' : pace.id}/day`, edit: 'dailyDrinks' })
    }
    if (answers.drinksMode && answers.track === 'performance' && (answers.workoutAddOns ?? []).length > 0) {
      const labels = WORKOUT_ADDON_DATA.filter((w) => (answers.workoutAddOns ?? []).includes(w.id)).map((w) => w.label)
      rows.push({ label: 'Workout drinks', value: labels.join(', '), edit: 'workoutAddOns' })
    }
    if (localAge) rows.push({ label: 'You', value: [localName.trim(), labelOf(AGE_DATA, localAge), labelOf(WEIGHT_DATA, localWeight || null)].filter(Boolean).join(' · '), edit: 'personal' })
    if (answers.track === 'performance') {
      const t = [labelOf(FREQ_DATA, answers.trainingFrequency), labelsOf(TYPE_DATA, answers.trainingType).join(', ')].filter(Boolean).join(' · ')
      if (t) rows.push({ label: 'Training', value: t, edit: 'frequency' })
    }
    const lifestyleData = answers.track === 'wellbeing' ? WELLBEING_LIFESTYLE_DATA : LIFESTYLE_DATA
    if (answers.lifestyle.length) rows.push({ label: 'Lifestyle', value: labelsOf(lifestyleData, answers.lifestyle).join(', '), edit: 'lifestyle' })
    if (answers.diet) rows.push({ label: 'Diet', value: labelOf(DIET_DATA, answers.diet), edit: 'diet' })
    const dyn = Object.values(answers.dynamicAnswers ?? {})
    if (dyn.length) rows.push({ label: 'Your follow-ups', value: dyn.map(d => d.answer).join(', '), edit: 'deepDive' })
    const have = answers.track === 'wellbeing'
      ? labelsOf(WELLBEING_SUPPS_DATA, answers.currentVitamins)
      : [...labelsOf(SUPPS_DATA, answers.currentSupplements), ...labelsOf(VITAMIN_OPTIONS, answers.currentVitamins)]
    rows.push({ label: 'Already taking', value: have.length ? have.join(', ') : 'Starting fresh', edit: 'supps' })
    // Items they already take but asked us to include anyway (still selected).
    const trying = (answers.tryOurs ?? [])
      .filter((x) => answers.currentSupplements.includes(x) || answers.currentVitamins.includes(x))
      .map((x) => SUPP_LABEL_BY_ID[x] ?? x)
    if (trying.length) rows.push({ label: 'Trying ours', value: trying.join(', '), edit: 'supps' })
    if (answers.caffeineLevel) rows.push({ label: 'Caffeine', value: labelOf(CAFFEINE_DATA, answers.caffeineLevel), edit: 'caffeine' })
    if (answers.preferredFormats.length) rows.push({ label: 'Formats', value: answers.preferredFormats.includes('any') ? 'No preference' : labelsOf(FORMAT_DATA, answers.preferredFormats).join(', '), edit: 'formats' })
    return rows
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed top-0 left-0 right-0 h-[100dvh] bg-[#0A0A0A] text-white flex flex-col overflow-hidden">

      {/* The signature rail — a filling liquid tube in LQD, the charge rail
          otherwise. Always in frame, climbing as you answer. */}
      {drinksMode
        ? <LiquidRail level={charge} surgeKey={surgeKey} reducedMotion={reducedMotion} />
        : <ChargeRail charge={charge} surgeKey={surgeKey} reducedMotion={reducedMotion} />}

      {/* Floor. LQD: a real liquid pool that RISES with progress, with a wavy
          surface — the screen visibly fills with drink. Otherwise: a calm
          charge whisper. Never competes with the question. */}
      {drinksMode ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 bottom-0 z-0 overflow-hidden"
          style={{ height: `${Math.round(70 + charge * 1.1)}px` }}
        >
          {/* wavy meniscus at the pool surface */}
          <div
            className="absolute inset-x-0 top-0 h-4"
            style={{
              marginLeft: '-50%', width: '200%',
              background: 'radial-gradient(60% 130% at 20% 0%, rgba(0,212,255,0.28), transparent 60%), radial-gradient(60% 130% at 70% 0%, rgba(0,212,255,0.22), transparent 60%)',
              animation: reducedMotion ? undefined : 'wave-drift 7s linear infinite',
            }}
          />
          <div className="absolute inset-0 top-2" style={{ background: 'linear-gradient(to top, rgba(0,212,255,0.16), rgba(0,212,255,0.05) 55%, transparent)' }} />
          {/* a few bubbles drifting up through the pool */}
          {!reducedMotion && charge > 20 && [0, 1, 2, 3].map((i) => (
            <span
              key={`floor-bub-${i}`}
              className="absolute rounded-full"
              style={{
                left: `${12 + i * 24}%`, bottom: 4, width: 4, height: 4,
                background: 'rgba(0,212,255,0.5)',
                ['--sway' as string]: `${i % 2 ? 5 : -5}px`,
                animation: `bubble-rise ${4 + i}s ease-in ${i * 1.1}s infinite`,
              }}
            />
          ))}
        </div>
      ) : (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 bottom-0 z-0"
          style={{ height: 180, background: 'radial-gradient(120% 100% at 50% 135%, rgba(0,212,255,0.06), transparent 70%)' }}
        />
      )}

      {/* The odd "did you know?" aside */}
      {cue && !isGenerating && <DidYouKnowChip cue={cue} reduced={reducedMotion} onDismiss={() => setCue(null)} />}

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
              {drinksMode ? 'Topped up' : 'Fully charged'}
            </p>
            <p className="text-sm text-white/35">{drinksMode ? 'Pouring your month of drinks…' : 'Powering on your personalised stack…'}</p>
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
          {id === 'review' ? 'FINAL STEP' : id === 'deepDive' ? 'OPTIONAL' : `${index + 1} / ${seq.length - 2}`}
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
          {/* How-to-answer pill — removes the guesswork of one-tap vs pick-many */}
          {selectPill && (
            <span
              className="inline-flex items-center gap-1.5 mt-3 pl-2 pr-2.5 py-1 rounded-full text-[11px] font-semibold text-[#00D4FF]/90"
              style={{ background: 'rgba(0,212,255,0.09)', border: '1px solid rgba(0,212,255,0.2)', fontFamily: 'var(--font-display)' }}
            >
              <span aria-hidden="true">
                {current.select === 'one' ? (
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" /><circle cx="10" cy="10" r="3" fill="currentColor" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M6.5 10L9 12.5L13.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                )}
              </span>
              {selectPill}
            </span>
          )}
          {isFirst && (
            <p className="text-[11px] text-white/25 mt-2">
              {seq.length - 2} quick questions · about a minute
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
                { id: 'wellbeing' as const, icon: 'leaf', label: 'Everyday wellness', sub: 'Sleep, stress, focus, immunity — how you feel day to day' },
                { id: 'performance' as const, icon: 'dumbbell', label: 'Performance + wellness', sub: 'Training goals plus the everyday stuff — the full picture' },
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

          {/* Combined track: performance goals AND the wellness goals — the
              second card is performance + wellness, not performance instead. */}
          {id === 'goals' && answers.track === 'performance' && (
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/35 mb-2.5" style={{ fontFamily: 'var(--font-display)' }}>
                Performance
              </p>
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
              <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/35 mt-6 mb-2.5" style={{ fontFamily: 'var(--font-display)' }}>
                Everyday wellness
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {WELLBEING_DATA.map(({ id: gid, label, icon }) => (
                  <AnswerOption
                    key={`gpw-${gid}`}
                    icon={icon} label={label} multi
                    selected={answers.goals.includes(gid)}
                    onClick={() => {
                      const c = answers.goals
                      setGoals(c.includes(gid) ? c.filter(g => g !== gid) : [...c, gid])
                    }}
                  />
                ))}
              </div>
              <button onClick={() => { setAnswer('track', null); setGoals([]); setAnswer('wellbeingAnswers', {}) }} className="mt-5 text-xs text-white/30 underline underline-offset-2">
                ← Switch to everyday wellness only
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
                ← Switch to performance + wellness
              </button>
            </div>
          )}

          {/* Wellness follow-ups — a pure function of the wellness goals picked,
              so they appear on BOTH tracks (the combined track includes wellness). */}
          {id === 'goals' && answers.track && pickWellbeingQuestions(answers.goals).map((wq) => (
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
                    onClick={() => { funnel.subAnswer({ subId: wq.id, parentStepId: 'goals', optionId: oid }); setAnswer('wellbeingAnswers', { ...answers.wellbeingAnswers, [wq.id]: oid }) }}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* ── Safety screen — private, remove-only filter ── */}
          {id === 'safety' && (
            <div>
              <div className="grid grid-cols-2 gap-2.5">
                {SAFETY_DATA.map(({ id: sid, label }) => (
                  <AnswerOption
                    key={`safety-${sid}`} label={label} multi
                    selected={(answers.safetyFlags ?? []).includes(sid)}
                    onClick={() => {
                      const c = answers.safetyFlags ?? []
                      setAnswer('safetyFlags', c.includes(sid) ? c.filter((x) => x !== sid) : [...c, sid])
                    }}
                  />
                ))}
                <AnswerOption
                  key="safety-none" label="None of these" multi
                  selected={(answers.safetyFlags ?? []).length === 0}
                  onClick={() => setAnswer('safetyFlags', [])}
                />
              </div>
              <p className="text-[12px] text-white/30 leading-snug mt-3 px-1">
                Private, and optional — this only ever removes products, never adds. It isn’t medical advice; check with your GP or midwife if you’re unsure.
              </p>
            </div>
          )}

          {/* ── LQD pace — how many drinks a day (drinks mode only) ── */}
          {/* ── LQD foundation — how many drinks a day (mirrors into drinksPerDay
                so the box-sizing engine is unchanged) ── */}
          {id === 'dailyDrinks' && (
            <div className="flex flex-col gap-2.5">
              {DAILY_DRINKS_DATA.map(({ id: did, label, sub, fills }) => {
                const active = answers.dailyDrinks === did
                return (
                  <button
                    key={`daily-${did}`}
                    onClick={() => {
                      setAnswer('dailyDrinks', did)
                      setAnswer('drinksPerDay', did) // keep the engine's pace signal in sync
                      clearPending()
                      pendingTimerRef.current = setTimeout(() => advance(), 340)
                    }}
                    aria-pressed={active}
                    className={[
                      'w-full flex items-center gap-4 px-5 py-4 rounded-xl border text-left',
                      'transition-all duration-200 active:scale-[0.99]',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40',
                      active ? 'border-[#00D4FF]/55 bg-[#00D4FF]/[0.07]' : 'border-white/[0.08] bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.04]',
                    ].join(' ')}
                  >
                    <PaceGlass level={fills / 4} selected={active} reduced={reducedMotion} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-[15px] font-medium leading-snug ${active ? 'text-white' : 'text-white/80'}`} style={{ fontFamily: 'var(--font-display)' }}>{label}</div>
                      <div className="text-[13px] mt-1 text-white/35 leading-snug">{sub}</div>
                    </div>
                    <CheckMark selected={active} />
                  </button>
                )
              })}
              <p className="text-[12px] text-white/30 leading-snug mt-1 px-1">
                Your everyday base. No pressure to hit a number — it just helps us size and show how your box will flow.
              </p>
            </div>
          )}

          {/* ── LQD workout add-ons — opt-in, training route only ── */}
          {id === 'workoutAddOns' && (
            <div className="flex flex-col gap-2.5">
              {WORKOUT_ADDON_DATA.map(({ id: wid, label, sub }) => {
                const selected = (answers.workoutAddOns ?? []).includes(wid)
                return (
                  <button
                    key={`wa-${wid}`}
                    onClick={() => {
                      const cur = answers.workoutAddOns ?? []
                      setAnswer('workoutAddOns', cur.includes(wid) ? cur.filter((x) => x !== wid) : [...cur, wid])
                    }}
                    aria-pressed={selected}
                    className={[
                      'w-full flex items-center gap-4 px-5 py-4 rounded-xl border text-left',
                      'transition-all duration-200 active:scale-[0.99]',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40',
                      selected ? 'border-[#00D4FF]/55 bg-[#00D4FF]/[0.07]' : 'border-white/[0.08] bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.04]',
                    ].join(' ')}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`text-[15px] font-medium leading-snug ${selected ? 'text-white' : 'text-white/80'}`} style={{ fontFamily: 'var(--font-display)' }}>{label}</div>
                      <div className="text-[13px] mt-1 text-white/35 leading-snug">{sub}</div>
                    </div>
                    <CheckMark selected={selected} />
                  </button>
                )
              })}
              <p className="text-[12px] text-white/30 leading-snug mt-1 px-1">
                Optional — these ride on top of your everyday drinks and are sized to how often you train. Skip if you just want the daily base.
              </p>
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
                  {AGE_DATA.map(({ id: aid, label }) => (
                    <AnswerOption key={`age-${aid}`} label={label} multi selected={localAge === aid} onClick={() => setLocalAge(aid)} />
                  ))}
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

              <div>
                <label className="text-xs font-bold tracking-widest uppercase text-white/30 mb-2 block" style={{ fontFamily: 'var(--font-display)' }}>
                  Weight <span className="normal-case font-normal tracking-normal text-white/15">· optional</span>
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {WEIGHT_DATA.map(({ id: wid, label }) => (
                    <AnswerOption key={`weight-${wid}`} label={label} multi selected={localWeight === wid} onClick={() => setLocalWeight(prev => prev === wid ? '' : wid)} />
                  ))}
                </div>
                <p className="text-[11px] text-white/20 mt-2">Makes your protein &amp; creatine doses accurate</p>
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

          {/* ── Type (multi-select) ── */}
          {id === 'type' && (
            <div className="flex flex-col gap-2.5">
              {TYPE_DATA.map(({ id: tid, label, sub }) => (
                <AnswerOption key={`t-${tid}`} label={label} sub={sub}
                  selected={answers.trainingType[0] === tid}
                  onClick={() => handleSelectType(tid)} />
              ))}

              {/* Inline refinement when a single style is chosen */}
              {typeFollowUp && (
                <div className="mt-6 pt-6 border-t border-white/8">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-px h-4 bg-[#00D4FF]" />
                    <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#00D4FF]" style={{ fontFamily: 'var(--font-display)' }}>Follow-up</span>
                  </div>
                  <p className="text-base font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>{typeFollowUp.question}</p>
                  <p className="text-xs text-white/35 mb-4">{typeFollowUp.hint}</p>
                  <div className="flex flex-col gap-2">
                    {typeFollowUp.options.map((opt) => (
                      <AnswerOption key={`tf-${opt.id}`} label={opt.label} sub={opt.sub}
                        selected={answers.trainingFocus === opt.id}
                        onClick={() => setAnswer('trainingFocus', opt.id)} />
                    ))}
                  </div>
                </div>
              )}
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

          {/* Keep-or-try follow-up: for anything the user already takes we skip
              it by default — this lets them flip any item to "include CHRGD's
              to try" (answers.tryOurs bypasses the factory's exclusion). */}
          {id === 'supps' && tryOursItems.length > 0 && (
            <div className="mt-6 pt-5 border-t border-white/8"
              style={{ animation: reducedMotion ? undefined : 'slide-up-in 0.3s cubic-bezier(0.22,1,0.36,1) both' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-px h-4 bg-[#00D4FF]" />
                <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#00D4FF]" style={{ fontFamily: 'var(--font-display)' }}>Quick follow-up</span>
              </div>
              <p className="text-sm font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>Keep yours, or try ours?</p>
              <p className="text-xs text-white/35 mb-3">
                We&apos;ll leave these out so you don&apos;t double up — unless you&apos;d rather have the CHRGD version in your stack when yours runs out.
              </p>
              <div className="flex flex-col gap-2">
                {tryOursItems.map(({ id: tid, label }) => {
                  const trying = (answers.tryOurs ?? []).includes(tid)
                  return (
                    <div key={`try-${tid}`} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.015]">
                      <span className="flex-1 text-[13px] font-medium text-white truncate" style={{ fontFamily: 'var(--font-display)' }}>{label}</span>
                      {([
                        { v: false, chip: 'Keep my own' },
                        { v: true, chip: 'Include CHRGD’s' },
                      ]).map(({ v, chip }) => (
                        <button
                          key={`try-${tid}-${v}`}
                          onClick={() => {
                            const c = (answers.tryOurs ?? []).filter(x => x !== tid)
                            setAnswer('tryOurs', v ? [...c, tid] : c)
                          }}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40"
                          style={trying === v
                            ? { color: '#0A0A0A', background: '#00D4FF' }
                            : { color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Deep dive (AI-tailored follow-ups) ── */}
          {id === 'deepDive' && (deepDiveStatus !== 'ready' || !deepDiveQuestions ? (
            <DeepDiveLoading reducedMotion={reducedMotion} />
          ) : (
            <div className="flex flex-col gap-7">
              {deepDiveQuestions.map((dq, qi) => (
                <div
                  key={`dd-${dq.id}`}
                  className={qi > 0 ? 'pt-6 border-t border-white/8' : ''}
                  style={{ animation: reducedMotion ? undefined : 'slide-up-in 0.3s cubic-bezier(0.22,1,0.36,1) both' }}
                >
                  <p className="text-base font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>{dq.question}</p>
                  <p className="text-xs text-white/35 mb-3">{dq.hint}</p>
                  <div className="flex flex-col gap-2">
                    {dq.options.map((opt) => (
                      <AnswerOption
                        key={`dd-${dq.id}-${opt.id}`}
                        label={opt.label} sub={opt.sub}
                        selected={answers.dynamicAnswers?.[dq.id]?.optionId === opt.id}
                        onClick={() => setAnswer('dynamicAnswers', {
                          ...(answers.dynamicAnswers ?? {}),
                          [dq.id]: { optionId: opt.id, question: dq.question, answer: opt.label, signals: opt.signals },
                        })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}

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

          {/* ── Review ── */}
          {id === 'review' && (
            <div className="flex flex-col gap-2">
              {/* The optional AI deep-dive offer — go deeper, or the CTA below
                  goes straight to results. First thing on the screen so the
                  choice is never missed; hidden once the follow-ups are
                  answered (their row appears in the list instead). */}
              {Object.keys(answers.dynamicAnswers ?? {}).length === 0 && (
                <button
                  onClick={goDeeper}
                  className="group w-full flex items-center gap-4 px-4 py-4 mb-2 rounded-xl border border-[#00D4FF]/30 bg-[#00D4FF]/[0.04] text-left transition-all duration-200 hover:border-[#00D4FF]/60 hover:bg-[#00D4FF]/[0.08] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40"
                >
                  <QuizIcon name="sparkle" size={20} className="shrink-0 text-[#00D4FF]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#00D4FF]/80" style={{ fontFamily: 'var(--font-display)' }}>Optional · 30 seconds</p>
                    <p className="text-sm font-semibold text-white mt-1" style={{ fontFamily: 'var(--font-display)' }}>Go deeper for sharper picks</p>
                    <p className="text-[12px] text-white/40 mt-0.5 leading-snug">A couple of extra questions, written for you — we&apos;ll fine-tune every choice in your stack.</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0 text-[#00D4FF]/70 transition-transform duration-200 group-hover:translate-x-0.5">
                    <path d="M8 4L14 10L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}

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
                  ? (id === 'review' || id === 'deepDive') ? 'bg-[#00D4FF] text-[#0A0A0A]' : 'bg-white text-[#0A0A0A]'
                  : 'bg-white/[0.06] text-white/25 cursor-not-allowed'
              }`}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {continueNeeds ? continueNeeds
                : id === 'review' ? (drinksMode ? 'Build my drinks box' : 'Build my stack')
                : id === 'deepDive' ? (drinksMode ? 'Build my drinks box' : 'Build my stack')
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
