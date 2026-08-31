'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { WeightBand } from '@/lib/types'
import { AnswerOption } from '@/components/quiz/AnswerOption'
import type { BankQuestion, InterviewState } from '@/lib/quiz-v2/types'
import {
  MEALS, mealsAnswered, nextMeal, proteinDoor, proteinIntakeFrom, proteinProfile,
  proteinTarget, runningTotal, verdictCopy, type Meal,
} from '@/lib/quiz-v2/protein'

/**
 * The protein check.
 *
 * `docs/QUIZ_V2_PROTEIN.md` Part 2 is the design and the arguments behind it.
 * The three things it is worth knowing here:
 *
 * ── The three doors are not a menu ──────────────────────────────────────────
 * A screen that first asks *how* you would like to answer is a settings panel,
 * and it costs the rhythm for everybody — including the majority who were
 * always going to tap the first plausible option. So the presets simply ARE the
 * screen: five ordinary options in the ordinary control. "I honestly have no
 * idea" is one of them rather than an escape hatch, because it is the
 * most-picked answer to the question this replaces and hiding it punishes
 * honesty. Counting is a quiet link that changes the screen in place.
 *
 * ── The target is never shown before the estimate ───────────────────────────
 * Showing it first would anchor the self-report it is about to be compared
 * against, and we would then be selling a gap computed from an answer we
 * biased. The hint states the *basis* — what we already know about their week —
 * and the number arrives with the comparison.
 *
 * ── The counted day steps ───────────────────────────────────────────────────
 * Four meal rows on one screen is ~440px of chips in a ~250px scroll area. One
 * meal at a time is four full-size taps, and the quiz's own progress counter
 * visibly not moving is what tells the reader they have not been sent down a
 * side quest.
 */

const WEIGHT_CHOICES: Array<[WeightBand, string]> = [
  ['under-60', 'Under 60kg'],
  ['60-75', '60–75kg'],
  ['75-90', '75–90kg'],
  ['90-105', '90–105kg'],
  ['105-plus', '105kg+'],
]

/**
 * One question per beat, written to read as a conversation rather than four
 * fills of the same template — "What does snacking and drinks usually look
 * like?" is what the template produced, and it is not a sentence anybody says.
 */
/** The short form, for the summary rows. */
const MEAL_NAME: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'In between',
}

const MEAL_PROMPT: Record<Meal, string> = {
  breakfast: 'What does breakfast usually look like?',
  lunch: 'And lunch?',
  dinner: 'Dinner?',
  snacks: 'Anything in between — snacks or drinks?',
}

export function ProteinCheck({
  question, state, picks, onPicks, onWeight,
}: {
  question: BankQuestion
  state: InterviewState
  picks: string[]
  onPicks: (ids: string[]) => void
  onWeight: (band: WeightBand) => void
}) {
  const presets = useMemo(() => question.options.filter((o) => !o.meal), [question])
  const door = proteinDoor(question.options, picks)

  /*
   * Counting is a view mode, derived from the answer until the reader says
   * otherwise — an answer that already contains meals is a counted answer, and
   * that is what makes an edit from the review screen reopen the door they
   * used rather than dropping them back at the presets.
   *
   * Derived every render rather than seeded once, because the picks arrive a
   * render LATE on an edit: `multiPicks` is filled by an effect keyed on the
   * question, so the first render of this component still holds the review
   * screen's empty array. Seeding state from that showed the presets for a
   * counted answer — invisible in a fresh run and wrong every time somebody
   * edited one.
   */
  const [chosen, setChosen] = useState<boolean | null>(null)
  const counting = chosen ?? (door === 'counted')
  /** A single beat reopened from the summary, rather than the next unanswered. */
  const [editing, setEditing] = useState<Meal | null>(null)
  useEffect(() => { setChosen(null); setEditing(null) }, [question.id])

  const answered = mealsAnswered(question.options, picks)
  const beat = nextMeal(question.options, picks)
  const askWeight = !state.form.weightBand

  const pickPreset = (id: string) => onPicks([id])

  const pickMeal = (meal: Meal, id: string) => {
    // One answer per beat. Re-answering replaces rather than adds, so changing
    // dinner cannot leave two dinners in the total.
    const others = picks.filter((p) => question.options.find((o) => o.id === p)?.meal !== meal)
    onPicks([...others, id])
    setEditing(null)
  }

  const stepBack = () => {
    const last = answered[answered.length - 1]
    if (!last) { setChosen(false); return }
    onPicks(picks.filter((p) => question.options.find((o) => o.id === p)?.meal !== last))
  }

  if (!counting) {
    return (
      <div className="flex flex-col gap-2.5">
        {presets.map((o) => (
          <AnswerOption
            key={o.id}
            label={o.label} sub={o.sub}
            selected={picks.includes(o.id)}
            onClick={() => pickPreset(o.id)}
          />
        ))}

        {askWeight && <WeightRow onWeight={onWeight} />}

        {/*
          Door C. A link, not a sixth option — it is not an answer to the
          question, it is a change of instrument, and putting "count it
          properly" in the same visual grammar as "I eat eggs" is a category
          error the eye notices before the brain does.
        */}
        <button
          type="button"
          onClick={() => { onPicks([]); setChosen(true) }}
          className="self-start mt-1.5 text-[13px] text-white/45 hover:text-white/75 transition-colors underline underline-offset-4 decoration-white/20"
        >
          Rather work it out properly?
        </button>
      </div>
    )
  }

  /*
   * Which beat is on screen: the next unanswered one while stepping forward,
   * or whichever the reader tapped in the summary.
   *
   * The summary is the end state on purpose. Without it, changing lunch after
   * finishing the day means pressing "back a meal" three times — which is
   * exactly what an edit from the review screen asks somebody to do, and it is
   * the difference between a flow that steps and one that traps.
   */
  const active = editing ?? beat

  if (!active) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[13px] text-white/55" style={{ fontFamily: 'var(--font-display)' }}>
            Your day
          </span>
          <Dots done={MEALS.length} total={MEALS.length} />
        </div>

        {MEALS.map((m) => {
          const chosenHere = question.options.find(
            (o) => o.meal === m && picks.includes(o.id),
          )
          return (
            <button
              key={m}
              type="button"
              onClick={() => setEditing(m)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.015] text-left transition-colors hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40"
            >
              <span className="w-[74px] shrink-0 text-[11px] font-semibold tracking-[0.12em] uppercase text-white/30" style={{ fontFamily: 'var(--font-display)' }}>
                {MEAL_NAME[m]}
              </span>
              <span className="flex-1 min-w-0 text-[13.5px] text-white/75 leading-snug">
                {chosenHere?.label ?? '—'}
              </span>
              <span className="shrink-0 text-[11px] text-[#00D4FF]/70">Change</span>
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => { onPicks([]); setEditing(null); setChosen(false) }}
          className="self-start mt-1.5 text-[13px] text-white/45 hover:text-white/75 transition-colors underline underline-offset-4 decoration-white/20"
        >
          Back to the quick version
        </button>
      </div>
    )
  }

  const options = question.options.filter((o) => o.meal === active)
  const pickedHere = picks.find((p) => question.options.find((o) => o.id === p)?.meal === active)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between mb-1">
        <span
          className="text-[13px] text-white/55"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {MEAL_PROMPT[active]}
        </span>
        <Dots done={answered.length} total={MEALS.length} />
      </div>

      {options.map((o) => (
        <AnswerOption
          key={o.id}
          label={o.label}
          selected={pickedHere === o.id}
          onClick={() => pickMeal(active, o.id)}
        />
      ))}

      <button
        type="button"
        onClick={editing ? () => setEditing(null) : stepBack}
        className="self-start mt-1.5 text-[13px] text-white/45 hover:text-white/75 transition-colors underline underline-offset-4 decoration-white/20"
      >
        {editing ? 'Leave it as it was'
          : answered.length === 0 ? 'Back to the quick version'
          : 'Back a meal'}
      </button>
    </div>
  )
}

/** Four discrete dots. Not a bar — a bar implies a duration. */
function Dots({ done, total }: { done: number; total: number }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={`${done} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="w-[6px] h-[6px] rounded-full transition-colors duration-200"
          style={{ background: i < done ? '#00D4FF' : 'rgba(255,255,255,0.18)' }}
        />
      ))}
    </span>
  )
}

/**
 * Weight is optional on the personal screen, and stays optional.
 *
 * Without it there is no target, so the module asks here rather than inventing
 * an average person to compare someone against. Declining is free: the presets
 * still give a coarse answer and the reader is never blocked.
 */
function WeightRow({ onWeight }: { onWeight: (band: WeightBand) => void }) {
  return (
    <div className="mt-3">
      <p className="text-[12px] text-white/35 leading-snug mb-2">
        Roughly what do you weigh? It is the one thing we need to say anything
        useful about the amount — skip it and we will keep it general.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {WEIGHT_CHOICES.map(([id, label]) => (
          <AnswerOption key={id} label={label} multi selected={false} onClick={() => onWeight(id)} />
        ))}
      </div>
    </div>
  )
}

/**
 * The strip above the CTA.
 *
 * ── Why this reserves space where `Reflection` refuses to ───────────────────
 * Not a contradiction — the same principle on different facts. The reflection
 * MAY NEVER ARRIVE (with no API key it never does), so reserving for it trades
 * a jump for a permanent empty gap most readers only ever see empty. This
 * arrives the instant the reader taps, always, and then stays. Reserved space
 * for a thing that always fills; no space at all for a thing that usually does
 * not.
 *
 * Getting it wrong here would be worse than it was there: this line appears
 * while the thumb is already travelling toward Continue, and a footer that
 * moves under a moving thumb is a mis-tap, not a cosmetic bug.
 */
export function ProteinVerdict({
  question, state, picks, reducedMotion,
}: {
  question: BankQuestion
  state: InterviewState
  picks: string[]
  reducedMotion: boolean
}) {
  const intake = proteinIntakeFrom(question.options, picks)
  const target = proteinTarget(proteinProfile(state))
  const complete = proteinDoor(question.options, picks) === 'preset'
    || mealsAnswered(question.options, picks).length === MEALS.length

  const shown = useCountUp(intake, reducedMotion)

  // The target only appears once the day is answered. Comparing a part-built
  // total against a full day reads as catastrophe to someone who has not got to
  // lunch yet — and errs in our own favour, which is the worst direction.
  const copy = complete && target && intake !== null ? verdictCopy(target, intake) : null

  return (
    <div
      className="relative z-20 shrink-0 pl-5 pr-[42px]"
      style={{ minHeight: 58 }}
      aria-live="polite"
    >
      <div className="max-w-lg mx-auto">
        {intake === null ? null : copy ? (
          <>
            <p
              className="text-[13px] font-semibold tabular-nums leading-tight"
              style={{
                fontFamily: 'var(--font-display)',
                color: copy.tone === 'opportunity' ? '#00D4FF' : 'rgba(255,255,255,0.8)',
              }}
            >
              {`≈${shown}g a day · target ${copy.targetLabel}`}
            </p>
            <p className="text-[12px] text-white/45 leading-snug mt-1">{copy.detail}</p>
          </>
        ) : (
          <p
            className="text-[13px] font-semibold tabular-nums leading-tight text-white/55"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {runningTotal(shown)}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * A number that ticks reads as measured; a number that appears reads as looked
 * up. Cheap, and it is most of what makes the counted path feel worth taking.
 */
function useCountUp(value: number | null, reducedMotion: boolean): number {
  const [shown, setShown] = useState(value ?? 0)
  const fromRef = useRef(value ?? 0)

  useEffect(() => {
    if (value === null) return
    if (reducedMotion) { fromRef.current = value; setShown(value); return }

    const from = fromRef.current
    if (from === value) return
    fromRef.current = value

    const start = performance.now()
    const DURATION = 260
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      // Ease out — fast off the mark, settles on the figure.
      setShown(Math.round(from + (value - from) * (1 - (1 - t) ** 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, reducedMotion])

  return value === null ? 0 : shown
}
