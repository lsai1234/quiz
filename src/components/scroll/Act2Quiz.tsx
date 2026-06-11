'use client'

import { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react'
import gsap from 'gsap'
import { useQuizStore } from '@/lib/store'
import type {
  Goal, TrainingFrequency, TrainingType, DietLevel,
  CaffeineLevel, Budget, StackPreference,
  TrainingExperience, StimPreference,
} from '@/lib/types'

// ─── Capsule flight ───────────────────────────────────────────────────────────
// getBoundingClientRect called once in pointer event handler, never in scroll

const STEP_CAPSULE_COLORS = [
  '#00D4FF', '#80E8FF', '#00AACC',
  '#00D4FF', '#80E8FF', '#00AACC',
  '#00D4FF', '#80E8FF', '#00AACC',
]

function fireCapsule(fromEl: HTMLElement, color: string, onLand?: () => void) {
  const fromRect = fromEl.getBoundingClientRect()
  const collectorEl = document.querySelector('[data-collector-bottle]') as HTMLElement | null
  const toRect = collectorEl?.getBoundingClientRect() ?? {
    left: window.innerWidth - 56, top: window.innerHeight - 90, width: 48, height: 96,
  }

  const startX = fromRect.left + fromRect.width / 2 - 5
  const startY = fromRect.top + fromRect.height / 2 - 11

  const clone = document.createElement('div')
  Object.assign(clone.style, {
    position: 'fixed',
    width: '10px',
    height: '22px',
    borderRadius: '5px',
    background: color,
    boxShadow: `0 0 10px ${color}99`,
    left: `${startX}px`,
    top: `${startY}px`,
    pointerEvents: 'none',
    zIndex: '9999',
  })
  document.body.appendChild(clone)

  const endX = toRect.left + toRect.width / 2 - 5 - startX
  const endY = toRect.top + toRect.height / 2 - 11 - startY

  // Asymmetric eases create a natural arc
  gsap.to(clone, { x: endX, duration: 0.7, ease: 'power1.inOut' })
  gsap.to(clone, {
    y: endY,
    duration: 0.7,
    ease: 'power3.in',
    onComplete: () => {
      clone.remove()
      // Squash/stretch the collector bottle
      const bottle = document.querySelector('[data-collector-bottle]') as HTMLElement | null
      if (bottle) {
        gsap.fromTo(bottle,
          { scaleX: 1, scaleY: 1 },
          {
            keyframes: [
              { scaleX: 1.15, scaleY: 0.85, duration: 0.09, ease: 'power2.in' },
              { scaleX: 0.94, scaleY: 1.06, duration: 0.1, ease: 'power2.out' },
              { scaleX: 1, scaleY: 1, duration: 0.12, ease: 'power2.inOut' },
            ],
            overwrite: true,
          },
        )
      }
      onLand?.()
    },
  })
}

// ─── getCHRGD icon ────────────────────────────────────────────────────────────

function CHRGDIcon({ size = 20 }: { size?: number }) {
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

// ─── Ambient floating particles ───────────────────────────────────────────────

const PARTICLE_CFG = [
  { x: 8,  y: 15, s: 1.5, d: 14, t: 0    },
  { x: 22, y: 72, s: 1,   d: 18, t: -3.5 },
  { x: 38, y: 45, s: 2,   d: 12, t: -6   },
  { x: 55, y: 28, s: 1.5, d: 16, t: -2   },
  { x: 72, y: 82, s: 1,   d: 20, t: -8.5 },
  { x: 88, y: 18, s: 2,   d: 15, t: -4   },
  { x: 15, y: 88, s: 1,   d: 22, t: -11  },
  { x: 65, y: 92, s: 1.5, d: 13, t: -1.5 },
  { x: 45, y: 10, s: 1,   d: 17, t: -5   },
  { x: 92, y: 62, s: 2,   d: 19, t: -7   },
  { x: 30, y: 52, s: 1,   d: 11, t: -9.5 },
  { x: 78, y: 38, s: 1.5, d: 16, t: -3   },
]

function AmbientParticles() {
  const [show, setShow] = useState(false)
  const [count, setCount] = useState(12)
  useEffect(() => {
    setCount(window.innerWidth < 768 ? 5 : 12)
    setShow(true)
  }, [])
  if (!show) return null
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {PARTICLE_CFG.slice(0, count).map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-[#00D4FF]"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.s}px`,
            height: `${p.s}px`,
            animation: `float-particle ${p.d}s ease-in-out ${p.t}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

// ─── Scramble label ───────────────────────────────────────────────────────────

function ScrambleLabel({ text, stepKey }: { text: string; stepKey: number }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ·'
    let frame = 0
    const totalFrames = 20
    let raf: number
    const run = () => {
      el.textContent = text
        .split('')
        .map((char, idx) => {
          if (char === ' ') return ' '
          if (idx < (frame / totalFrames) * text.length) return char
          return chars[Math.floor(Math.random() * chars.length)]
        })
        .join('')
      frame++
      if (frame <= totalFrames) raf = requestAnimationFrame(run)
      else el.textContent = text
    }
    const timeout = setTimeout(() => { raf = requestAnimationFrame(run) }, 60)
    return () => { clearTimeout(timeout); cancelAnimationFrame(raf) }
  }, [stepKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span
      ref={ref}
      className="text-[10px] font-bold tracking-[0.28em] uppercase text-[#00D4FF] mb-4 block"
      style={{ fontFamily: 'var(--font-display)', textShadow: '0 0 14px rgba(0,212,255,0.55)' }}
    >
      {text}
    </span>
  )
}

// ─── Tap ripple ───────────────────────────────────────────────────────────────

function createRipple(e: React.PointerEvent<HTMLButtonElement>) {
  const btn = e.currentTarget
  const rect = btn.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  const x = e.clientX - rect.left - size / 2
  const y = e.clientY - rect.top - size / 2
  const el = document.createElement('span')
  Object.assign(el.style, {
    position: 'absolute',
    width: `${size}px`,
    height: `${size}px`,
    left: `${x}px`,
    top: `${y}px`,
    borderRadius: '50%',
    background: 'rgba(0, 212, 255, 0.18)',
    pointerEvents: 'none',
    animation: 'ripple-out 0.5s ease-out both',
  })
  btn.appendChild(el)
  el.addEventListener('animationend', () => el.remove())
}

// ─── Sub-question helpers ─────────────────────────────────────────────────────

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
      { id: 'hypertrophy', label: 'Build size',       sub: 'Hypertrophy / bodybuilding' },
      { id: 'powerlifting', label: 'Raw strength',    sub: 'Powerlifting / compound focus' },
      { id: 'general',      label: 'General fitness', sub: 'Well-rounded strength' },
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

// ─── Step data ─────────────────────────────────────────────────────────────────

const STEP_META = [
  { section: 'YOUR GOALS',   q: 'What are you training for?',         hint: 'Select all that apply.' },
  { section: 'TRAINING',     q: 'How often do you train?',            hint: 'Pick your typical week.' },
  { section: 'TRAINING',     q: 'What type of training?',             hint: 'Choose what fits best.' },
  { section: 'LIFESTYLE',    q: 'Any lifestyle factors?',             hint: 'Fine-tunes the selections.' },
  { section: 'NUTRITION',    q: 'How clean is your diet?',            hint: 'Honest = better results.' },
  { section: 'SUPPLEMENTS',  q: "What are you already taking?",       hint: "We won't double up." },
  { section: 'CAFFEINE',     q: "What's your caffeine tolerance?",    hint: 'Affects pre-workout choice.' },
  { section: 'BUDGET',       q: "Monthly budget?",                    hint: "We'll build within it." },
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
const FREQ_DATA = [
  { id: '1-2x' as TrainingFrequency,  label: '1–2× per week', sub: 'Occasional' },
  { id: '3-4x' as TrainingFrequency,  label: '3–4× per week', sub: 'Regular training' },
  { id: '5-6x' as TrainingFrequency,  label: '5–6× per week', sub: 'Serious athlete' },
  { id: 'daily' as TrainingFrequency, label: 'Every day',     sub: 'Elite / professional' },
]
const TYPE_DATA = [
  { id: 'strength' as TrainingType, label: 'Strength / Weights', sub: 'Lifting, powerlifting' },
  { id: 'cardio'   as TrainingType, label: 'Cardio / Endurance', sub: 'Running, cycling' },
  { id: 'hiit'     as TrainingType, label: 'HIIT / CrossFit',    sub: 'High-intensity intervals' },
  { id: 'sport'    as TrainingType, label: 'Team / Field Sport', sub: 'Football, rugby, basketball' },
  { id: 'mixed'    as TrainingType, label: 'Mixed / General',    sub: 'Combination of styles' },
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
  { id: 'complete', label: 'All-in',               sub: '6+ products — every angle covered, nothing missing' },
]

// ─── Option button ────────────────────────────────────────────────────────────
// GSAP handles ALL motion: press bounce (handleClick) + shimmer sweep (on selection).
// No active:scale CSS — that fights GSAP transform. No CSS animation on shimmer span.

function OptionBtn({
  label, sub, icon, selected, multi, capsuleColor, onClick,
}: {
  label: string; sub?: string; icon?: string; selected: boolean; multi?: boolean
  capsuleColor?: string; onClick: () => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)

  function handleClick() {
    const justSelected = !selected
    onClick()

    const btn = btnRef.current
    if (!btn) return

    gsap.killTweensOf(btn, 'scale')
    gsap.fromTo(btn, { scale: 0.96 }, { scale: 1, duration: 0.32, ease: 'back.out(2.2)', overwrite: 'auto' })

    if (justSelected) {
      const shimmer = btn.querySelector('[data-shimmer]') as HTMLElement | null
      if (shimmer) {
        gsap.killTweensOf(shimmer, 'x')
        gsap.fromTo(shimmer, { x: '-115%' }, { x: '230%', duration: 0.48, ease: 'power2.out', overwrite: true })
      }
      // Fire capsule for single-select only (multi-select fires on Continue)
      if (capsuleColor) {
        fireCapsule(btn, capsuleColor)
      }
    }
  }

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      onPointerDown={createRipple}
      data-option
      data-selected={selected ? 'true' : 'false'}
      className={`
        relative flex items-center gap-4 w-full px-5 py-4 rounded-2xl border
        overflow-hidden text-left
        focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 focus-visible:ring-offset-0
        ${selected
          ? multi
            ? 'bg-[#00D4FF] border-[#00D4FF] text-[#0A0A0A]'
            : 'bg-[#00D4FF]/10 border-[#00D4FF] text-white'
          : 'bg-white/[0.04] border-white/[0.08] text-white/70 hover:bg-white/[0.07]'}
      `}
      style={selected && !multi ? { boxShadow: '0 0 0 1px rgba(0,212,255,0.3), 0 0 24px rgba(0,212,255,0.15)' } : undefined}
    >
      {icon && <span className="text-xl flex-shrink-0">{icon}</span>}
      {!multi && (
        <div
          className={`flex-shrink-0 w-1 h-7 rounded-full ${selected ? 'bg-[#00D4FF]' : 'bg-transparent'}`}
        />
      )}
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-semibold ${selected && multi ? 'text-[#0A0A0A]' : ''}`}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {label}
        </div>
        {sub && (
          <div className={`text-xs mt-0.5 ${selected && multi ? 'text-[#0A0A0A]/60' : 'text-white/35'}`}>
            {sub}
          </div>
        )}
      </div>

      {/* Single-select check — mounts only when selected so pop fires once */}
      {selected && !multi && (
        <div
          className="w-5 h-5 rounded-full bg-[#00D4FF] flex-shrink-0 flex items-center justify-center"
          style={{ animation: 'check-pop 0.22s cubic-bezier(0.34,1.56,0.64,1) both' }}
        >
          <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="#0A0A0A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      {/* Multi-select check badge — corner indicator */}
      {selected && multi && (
        <div
          className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#0A0A0A]/20 flex items-center justify-center"
          style={{ animation: 'check-pop 0.2s cubic-bezier(0.34,1.56,0.64,1) both' }}
        >
          <svg width="7" height="6" viewBox="0 0 8 7" fill="none">
            <path d="M1 3.5L3 5.5L7 1" stroke="#0A0A0A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {/* Shimmer — always present, GSAP sweeps it on selection click */}
      <span
        data-shimmer
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, transparent 32%, rgba(255,255,255,0.14) 50%, transparent 68%)',
          transform: 'translateX(-115%)',
        }}
      />
    </button>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void
  reducedMotion: boolean
}

export function Act2Quiz({ onComplete, reducedMotion }: Props) {
  const {
    step, answers, nextStep, prevStep, setGoals, setAnswer, setIdentity, setSelectedProducts, setStackLevel,
    addCollectorCapsules, removeCollectorCapsulesForStep,
  } = useQuizStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])
  const prevStepRef = useRef(step)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [subQuestion, setSubQuestion] = useState<SubQuestion | null>(null)
  const [subAnswerId, setSubAnswerId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const TOTAL = 9

  // ─── Step entrance: pre-set invisible BEFORE paint to eliminate flash ─────
  useLayoutEffect(() => {
    const el = sectionRefs.current[step]
    if (!el || reducedMotion) return
    const dir = step > prevStepRef.current ? 1 : -1
    gsap.set(el.querySelectorAll('[data-word]'), { x: dir * 26, opacity: 0, scale: 0.96 })
    gsap.set(el.querySelectorAll('[data-anim]'), { y: 24, opacity: 0 })
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Animate in after paint ───────────────────────────────────────────────
  useEffect(() => {
    const el = sectionRefs.current[step]
    if (!el) return

    sectionRefs.current[step]?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
    prevStepRef.current = step

    if (reducedMotion) {
      gsap.set(el.querySelectorAll('[data-word], [data-anim]'), { clearProps: 'x,y,opacity,scale' })
      return
    }

    const ctx = gsap.context(() => {
      const words = el.querySelectorAll('[data-word]')
      const items = el.querySelectorAll('[data-anim]')

      if (words.length > 0) {
        gsap.to(words, { x: 0, opacity: 1, scale: 1, stagger: 0.03, duration: 0.4, ease: 'power2.out', overwrite: true })
      }
      if (items.length > 0) {
        gsap.to(items, { y: 0, opacity: 1, stagger: 0.05, duration: 0.42, ease: 'power2.out', delay: 0.07, overwrite: true })
      }
    }, el)

    return () => ctx.revert()
  }, [step, reducedMotion])

  // ─── Step transitions ─────────────────────────────────────────────────────

  function animateOut(dir: 1 | -1, onDone: () => void) {
    const el = sectionRefs.current[step]
    if (!el || reducedMotion) { onDone(); return }
    const items = [...el.querySelectorAll('[data-anim]'), ...el.querySelectorAll('[data-word]')]
    gsap.to(items, {
      x: dir * -24, opacity: 0, scale: 0.97,
      stagger: -0.012, duration: 0.18, ease: 'power2.in',
      overwrite: true,
      onComplete: onDone,
    })
  }

  function advance() {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    setSubQuestion(null)
    setSubAnswerId(null)

    // Multi-select steps: fire one capsule per selected option, staggered 80ms
    const MULTI_STEPS = [0, 3, 5]
    if (MULTI_STEPS.includes(step)) {
      const el = sectionRefs.current[step]
      const selectedBtns = el?.querySelectorAll('[data-option][data-selected="true"]')
      const count = selectedBtns?.length ?? 0
      if (count > 0) {
        selectedBtns!.forEach((btn, i) => {
          setTimeout(() => {
            fireCapsule(btn as HTMLElement, STEP_CAPSULE_COLORS[step])
          }, i * 80)
        })
        addCollectorCapsules(step, count)
      }
    }

    if (step >= TOTAL - 1) { handleFinish(); return }
    animateOut(1, () => nextStep())
  }

  function goBack() {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    setSubQuestion(null)
    setSubAnswerId(null)
    // Remove capsules for the step we're going back to (user will re-answer)
    removeCollectorCapsulesForStep(step - 1)
    animateOut(-1, () => prevStep())
  }

  // ─── Single-select with auto-advance ─────────────────────────────────────

  const handleSingle = useCallback(
    (key: string, value: string) => {
      setAnswer(key as keyof typeof answers, value as never)
      // Record capsule for single-select step (capsule visual fires from OptionBtn via capsuleColor prop)
      addCollectorCapsules(step, 1)
      const sub = getSubQuestion(step, value)
      if (sub) {
        if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
        pendingTimerRef.current = setTimeout(() => { setSubAnswerId(null); setSubQuestion(sub) }, 180)
        return
      }
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
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
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
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

  const canContinue = (() => {
    switch (step) {
      case 0: return answers.goals.length > 0
      case 3: return true
      case 5: return true
      default: return false
    }
  })()

  return (
    <div className="relative w-full min-h-screen bg-[#0A0A0A]">
      <AmbientParticles />

      {/* Background glow — shifts cyan as you progress */}
      <div
        className="fixed inset-0 pointer-events-none transition-all duration-1000"
        style={{
          background: `radial-gradient(ellipse 70% 50% at 50% ${20 + (step / (TOTAL - 1)) * 60}%, rgba(0,212,255,0.045), transparent)`,
        }}
      />

      {/* Generating overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#00D4FF] animate-spin mb-5" />
          <p className="text-sm text-white/50" style={{ fontFamily: 'var(--font-display)' }}>
            Analysing your profile…
          </p>
        </div>
      )}

      {/* Progress bar with glowing leading dot */}
      <div className="fixed top-0 left-0 right-0 z-40" style={{ height: '2px', overflow: 'visible' }}>
        <div className="absolute inset-0 bg-white/8" />
        <div
          className="absolute inset-y-0 left-0 bg-[#00D4FF] transition-all duration-500 ease-out"
          style={{ width: `${((step + 1) / TOTAL) * 100}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white transition-all duration-500 ease-out"
          style={{
            left: `${((step + 1) / TOTAL) * 100}%`,
            boxShadow: '0 0 8px 3px rgba(0,212,255,0.9), 0 0 20px 6px rgba(0,212,255,0.4)',
          }}
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
          className="fixed top-[52px] left-4 z-40 w-8 h-8 flex items-center justify-center rounded-full bg-white/6 text-white/40 active:opacity-50 overflow-hidden"
          onPointerDown={createRipple}
          aria-label="Back"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Steps */}
      <div ref={containerRef} className="w-full overflow-hidden">
        {STEP_META.map((meta, i) => (
          <div
            key={i}
            ref={(el) => { sectionRefs.current[i] = el }}
            className="min-h-screen flex flex-col justify-center px-5 py-20 max-w-lg mx-auto"
            style={{ display: step === i ? 'flex' : 'none' }}
          >
            {/* Section label with scramble */}
            <ScrambleLabel text={meta.section} stepKey={step} />

            {/* Question — split into words for stagger animation */}
            <h2
              className="text-[2.1rem] font-black leading-tight tracking-tight text-white mb-2"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {meta.q.split(' ').map((word, wi) => (
                <span key={wi} data-word className="inline-block mr-[0.25em]">{word}</span>
              ))}
            </h2>

            <p data-anim className="text-sm text-white/35 mb-8">{meta.hint}</p>

            {/* Options */}
            <div data-anim>

              {/* Step 0: Goals grid */}
              {i === 0 && (
                <div className="grid grid-cols-2 gap-2.5 quiz-options">
                  {GOALS_DATA.map(({ id, label, icon }) => (
                    <OptionBtn key={id} icon={icon} label={label} multi
                      selected={answers.goals.includes(id)}
                      onClick={() => {
                        const c = answers.goals
                        setGoals(c.includes(id) ? c.filter(g => g !== id) : [...c, id])
                      }} />
                  ))}
                </div>
              )}

              {/* Step 1: Frequency */}
              {i === 1 && (
                <div className="flex flex-col gap-2.5 quiz-options">
                  {FREQ_DATA.map(({ id, label, sub }) => (
                    <OptionBtn key={id} label={label} sub={sub}
                      selected={answers.trainingFrequency === id}
                      capsuleColor={STEP_CAPSULE_COLORS[1]}
                      onClick={() => handleSingle('trainingFrequency', id)} />
                  ))}
                </div>
              )}

              {/* Step 2: Type */}
              {i === 2 && (
                <div className="flex flex-col gap-2.5 quiz-options">
                  {TYPE_DATA.map(({ id, label, sub }) => (
                    <OptionBtn key={id} label={label} sub={sub}
                      selected={answers.trainingType === id}
                      capsuleColor={STEP_CAPSULE_COLORS[2]}
                      onClick={() => handleSingle('trainingType', id)} />
                  ))}
                </div>
              )}

              {/* Step 3: Lifestyle */}
              {i === 3 && (
                <div className="grid grid-cols-2 gap-2.5 quiz-options">
                  {LIFESTYLE_DATA.map(({ id, label, icon }) => (
                    <OptionBtn key={id} icon={icon} label={label} multi
                      selected={answers.lifestyle.includes(id)}
                      onClick={() => {
                        const c = answers.lifestyle
                        setAnswer('lifestyle', c.includes(id) ? c.filter(x => x !== id) : [...c, id])
                      }} />
                  ))}
                  <OptionBtn icon="✓" label="None" multi selected={answers.lifestyle.length === 0}
                    onClick={() => setAnswer('lifestyle', [])} />
                </div>
              )}

              {/* Step 4: Diet */}
              {i === 4 && (
                <div className="flex flex-col gap-2.5 quiz-options">
                  {DIET_DATA.map(({ id, label, sub }) => (
                    <OptionBtn key={id} label={label} sub={sub}
                      selected={answers.diet === id}
                      capsuleColor={STEP_CAPSULE_COLORS[4]}
                      onClick={() => handleSingle('diet', id)} />
                  ))}
                </div>
              )}

              {/* Step 5: Current supps */}
              {i === 5 && (
                <div className="grid grid-cols-2 gap-2.5 quiz-options">
                  {SUPPS_DATA.map(({ id, label, icon }) => (
                    <OptionBtn key={id} icon={icon} label={label} multi
                      selected={id === 'none' ? answers.currentSupplements.length === 0 : answers.currentSupplements.includes(id)}
                      onClick={() => {
                        if (id === 'none') { setAnswer('currentSupplements', []); return }
                        const c = answers.currentSupplements.filter(x => x !== 'none')
                        setAnswer('currentSupplements', c.includes(id) ? c.filter(x => x !== id) : [...c, id])
                      }} />
                  ))}
                </div>
              )}

              {/* Step 6: Caffeine */}
              {i === 6 && (
                <div className="flex flex-col gap-2.5 quiz-options">
                  {CAFFEINE_DATA.map(({ id, label, sub }) => (
                    <OptionBtn key={id} label={label} sub={sub}
                      selected={answers.caffeineLevel === id}
                      capsuleColor={STEP_CAPSULE_COLORS[6]}
                      onClick={() => handleSingle('caffeineLevel', id)} />
                  ))}
                </div>
              )}

              {/* Step 7: Budget */}
              {i === 7 && (
                <div className="flex flex-col gap-2.5 quiz-options">
                  {BUDGET_DATA.map(({ id, label, sub }) => (
                    <OptionBtn key={id} label={label} sub={sub}
                      selected={answers.budget === id}
                      capsuleColor={STEP_CAPSULE_COLORS[7]}
                      onClick={() => handleSingle('budget', id)} />
                  ))}
                </div>
              )}

              {/* Step 8: Stack pref */}
              {i === 8 && (
                <div className="flex flex-col gap-2.5 quiz-options">
                  {PREF_DATA.map(({ id, label, sub }) => (
                    <OptionBtn key={id} label={label} sub={sub}
                      selected={answers.stackPreference === id}
                      capsuleColor={STEP_CAPSULE_COLORS[8]}
                      onClick={() => {
                        setAnswer('stackPreference', id)
                        addCollectorCapsules(8, 1)
                      }} />
                  ))}
                </div>
              )}
            </div>

            {/* Inline sub-question */}
            {subQuestion && step === i && (
              <div
                className="mt-8 pt-6 border-t border-white/8"
                style={{ animation: 'slide-up-in 0.3s cubic-bezier(0.22,1,0.36,1) both' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-px h-4 bg-[#00D4FF]" style={{ boxShadow: '0 0 6px rgba(0,212,255,0.7)' }} />
                  <span
                    className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#00D4FF]"
                    style={{ fontFamily: 'var(--font-display)', textShadow: '0 0 10px rgba(0,212,255,0.5)' }}
                  >
                    Follow-up
                  </span>
                </div>
                <p className="text-base font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                  {subQuestion.question}
                </p>
                <p className="text-xs text-white/35 mb-4">{subQuestion.hint}</p>
                <div className="flex flex-col gap-2 quiz-options">
                  {subQuestion.options.map((opt) => (
                    <OptionBtn key={opt.id} label={opt.label} sub={opt.sub}
                      selected={subAnswerId === opt.id}
                      onClick={() => handleSubAnswer(subQuestion.id, opt.id)} />
                  ))}
                </div>
              </div>
            )}

            {/* CTA for multi-select steps */}
            {[0, 3, 5].includes(i) && step === i && (
              <button
                onClick={advance}
                onPointerDown={createRipple}
                disabled={!canContinue}
                className={`mt-8 w-full py-4 rounded-2xl text-sm font-bold tracking-wide relative overflow-hidden active:scale-95 transition-transform ${
                  canContinue
                    ? 'bg-white text-[#0A0A0A]'
                    : 'bg-white/8 text-white/20 cursor-not-allowed'
                }`}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {i === 0 && answers.goals.length > 0
                  ? `Continue with ${answers.goals.length} goal${answers.goals.length > 1 ? 's' : ''} →`
                  : 'Continue →'}
              </button>
            )}

            {/* Final step reveal CTA */}
            {i === 8 && step === 8 && (
              <button
                onClick={advance}
                onPointerDown={createRipple}
                disabled={!answers.stackPreference}
                className={`mt-8 w-full py-4 rounded-2xl text-sm font-bold tracking-wide relative overflow-hidden active:scale-95 transition-transform ${
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
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
