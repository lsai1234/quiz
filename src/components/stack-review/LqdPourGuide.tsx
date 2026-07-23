'use client'

/**
 * CHRGD LQD — "Your month, poured." Shown on the stack review only in drinks
 * mode. It tells the LQD story: your whole month lands as one box of ready-made
 * drinks and you sip them at your own pace — the monthly total keeps you
 * covered, not a rigid daily schedule. Only the pre-workout is tied to a moment;
 * everything else is a pool you dip into whenever.
 *
 * The whole thing is built to feel liquid — a filling month gauge with a
 * drifting meniscus, drinks shown as little liquid levels. Animations are
 * disabled under prefers-reduced-motion (see globals.css).
 */
import { useState } from 'react'
import type { SubscriptionLine } from '@/lib/stack-blueprint/pricing'
import type { QuizAnswers } from '@/lib/types'
import { buildLqdPlan, type LqdDrinkLine } from '@/lib/lqd'

const ACCENT = '#00D4FF'

const CONVENIENCE = [
  { title: 'Arrives ready', note: 'Every drink is pre-made. Nothing to mix, measure or remember.' },
  { title: 'No daily quota', note: "Sip at your pace — it's the month's total that keeps you covered." },
  { title: 'You’re covered', note: 'Everything you need for the month is already in the box.' },
]

/** A drink shown as a little liquid level — fills toward a full month. */
function DrinkRow({ line }: { line: LqdDrinkLine }) {
  const isTimed = line.pacing === 'timed'
  // Anytime drinks show the monthly-cover line; timed drinks show the moment.
  const detail = isTimed ? `${line.moment.moment.toLowerCase()} — ${line.moment.note}` : line.coverageNote
  const level = Math.max(12, Math.min(100, Math.round((line.monthlyCount / 30) * 100)))
  return (
    <div className="flex items-start gap-3">
      {/* liquid vial */}
      <div
        className="relative w-6 h-9 rounded-b-[7px] rounded-t-[3px] overflow-hidden shrink-0 mt-0.5 border"
        style={{ borderColor: 'color-mix(in srgb, var(--color-text) 14%, transparent)', background: 'color-mix(in srgb, var(--color-text) 3%, transparent)' }}
        aria-hidden="true"
      >
        <div className="lqd-fill absolute inset-x-0 bottom-0" style={{ height: `${level}%`, background: ACCENT, opacity: 0.85 }}>
          <div className="lqd-meniscus absolute -top-[3px] left-0 h-1.5 w-[200%] rounded-[50%]" style={{ background: ACCENT }} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug">
          <span className="font-bold" style={{ color: 'var(--color-text)' }}>{line.product.title}</span>
          <span className="text-[var(--color-muted)]"> · {line.monthlyCount} for the month</span>
        </p>
        <p className="text-[11px] text-[var(--color-muted)] leading-snug mt-0.5">{detail}</p>
      </div>
    </div>
  )
}

export function LqdPourGuide({ plan, answers }: { plan: SubscriptionLine[]; answers: QuizAnswers }) {
  const [open, setOpen] = useState(false)
  if (plan.length === 0) return null
  const lqd = buildLqdPlan(plan, answers)
  const anytime = lqd.lines.filter((l) => l.pacing === 'anytime')
  const timed = lqd.lines.filter((l) => l.pacing === 'timed')
  // The month gauge fills toward "a full month"; capped so a big box still reads.
  const gaugePct = Math.max(8, Math.min(100, Math.round((lqd.daysOfCover / 30) * 100)))

  return (
    <div
      className="relative rounded-2xl p-5 mb-4 overflow-hidden"
      style={{
        border: `1px solid color-mix(in srgb, ${ACCENT} 22%, transparent)`,
        background: `linear-gradient(135deg, color-mix(in srgb, ${ACCENT} 8%, transparent), transparent 62%)`,
      }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
          CHRGD LQD · Your month, poured
        </p>
        <p className="text-sm font-black whitespace-nowrap" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          ~{lqd.totalDrinks} <span className="font-semibold text-[var(--color-muted)] text-xs">drinks</span>
        </p>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed mb-4">
        You don’t need a drink of everything, every day. Your whole month turns
        up as one box of ready-made drinks — sip them at your pace and the
        monthly total keeps you covered.
      </p>

      {/* Liquid month gauge — how the box flows at your chosen pace */}
      <div className="rounded-xl p-3.5 mb-4" style={{ background: 'color-mix(in srgb, var(--color-text) 4%, transparent)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {lqd.drinksPerDay}{lqd.drinksPerDay >= 4 ? '+' : ''}/day · ~{lqd.daysOfCover} days of drinks
          </span>
          <span className="text-[10px] font-semibold" style={{ color: ACCENT }}>
            {lqd.fit === 'stretches' ? 'Stretches past a month' : lqd.fit === 'brisk' ? 'A brisk month' : 'A month, sorted'}
          </span>
        </div>
        <div className="relative h-6 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--color-text) 6%, transparent)' }} aria-hidden="true">
          <div className="lqd-fill absolute inset-y-0 left-0 rounded-full" style={{ width: `${gaugePct}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${ACCENT} 65%, transparent), ${ACCENT})` }}>
            <div className="lqd-meniscus-v absolute inset-y-0 -right-1 w-2 rounded-full" style={{ background: ACCENT }} />
          </div>
          {/* the 30-day mark */}
          <div className="absolute inset-y-0" style={{ left: '100%', transform: 'translateX(-1px)' }} />
        </div>
        <p className="text-[11px] text-[var(--color-muted)] leading-snug mt-2">{lqd.fitNote}</p>
      </div>

      {/* Why one box beats a shelf of tubs and pill bottles */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {CONVENIENCE.map(({ title, note }) => (
          <div
            key={title}
            className="rounded-xl px-2.5 py-3 text-center"
            style={{ background: 'color-mix(in srgb, var(--color-text) 4%, transparent)', border: '1px solid var(--color-border)' }}
          >
            <p className="text-[11px] font-black leading-tight mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              {title}
            </p>
            <p className="text-[10px] text-[var(--color-muted)] leading-snug">{note}</p>
          </div>
        ))}
      </div>

      {/* Drink-by-drink detail — collapsed by default so the block leads with
          the gauge and the payoff, not a full list. */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 py-2 text-left active:opacity-70 transition-opacity"
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--color-text-2)' }}>
          {open ? 'Hide the drinks' : `See every drink · ~${lqd.totalDrinks}`}
        </span>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{
            color: 'var(--color-muted)',
            border: '1px solid var(--color-border)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease',
          }}
        >
          ▾
        </span>
      </button>

      {open && (
      <div className="mt-3">
      {/* Foundation — the everyday base you sip at your own pace */}
      {anytime.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-2.5" style={{ fontFamily: 'var(--font-display)' }}>
            Foundation · every day · {lqd.anytimeDrinks} drinks{lqd.variety === 'variety' ? ' · a monthly mix' : ' · your staples'}
          </p>
          <div className="space-y-3">
            {anytime.map((line) => <DrinkRow key={line.product.id} line={line} />)}
          </div>
        </div>
      )}

      {/* Workout add-ons — timed, one per session */}
      {timed.length > 0 && (
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-2.5" style={{ fontFamily: 'var(--font-display)' }}>
            Workout add-ons · training days · {lqd.timedDrinks} drinks
          </p>
          <div className="space-y-3">
            {timed.map((line) => <DrinkRow key={line.product.id} line={line} />)}
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  )
}
