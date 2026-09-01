'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WeightBand } from '@/lib/types'
import { AnswerOption } from '@/components/quiz/AnswerOption'
import type { BankQuestion, InterviewState } from '@/lib/quiz-v2/types'
import {
  MEALS, PORTION_LABEL, PORTION_SIZES, mealsAnswered, nextMeal, proteinDoor,
  proteinIntakeFrom, proteinProfile, proteinTarget, runningTotal, verdictCopy,
  type Meal, type PortionSize,
} from '@/lib/quiz-v2/protein'
import { MAX_DAY_TEXT, parseProteinDayResult } from '@/lib/quiz-v2/protein-ai'

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
  question, state, picks, onPicks, onWeight, onPortions, onDescribed,
}: {
  question: BankQuestion
  state: InterviewState
  picks: string[]
  onPicks: (ids: string[]) => void
  onWeight: (band: WeightBand) => void
  onPortions: (size: PortionSize) => void
  /** Telemetry: whether the day on screen was typed rather than tapped. */
  onDescribed: (described: boolean) => void
}) {
  const presets = useMemo(() => question.options.filter((o) => !o.meal), [question])
  const mealOptions = useMemo(
    () =>
      question.options
        .filter((o): o is typeof o & { meal: Meal } => !!o.meal)
        .map((o) => ({ id: o.id, meal: o.meal, label: o.label })),
    [question],
  )
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
  /** Door D — the typed day. `read` is what came back, for the line above the summary. */
  const [describing, setDescribing] = useState(false)
  const [read, setRead] = useState<'none' | 'partial' | 'all'>('none')
  useEffect(() => { setChosen(null); setEditing(null); setDescribing(false); setRead('none') }, [question.id])

  /**
   * Take what the reader typed and put it on the meal rows.
   *
   * Whatever comes back lands on the SUMMARY, never on a verdict: every row is
   * the same tappable row it would have been if they had counted, and a meal
   * that could not be read is simply left blank for them to answer. Nothing here
   * commits anything the reader has not been shown and given a way to change.
   */
  const applyDay = useCallback((raw: unknown) => {
    const picksByMeal = parseProteinDayResult(raw, mealOptions)
    if (!picksByMeal) { setRead('none'); return false }
    const ids = MEALS.map((m) => picksByMeal[m]).filter((id): id is string => !!id)
    onPicks(ids)
    onDescribed(true)
    setRead(ids.length === MEALS.length ? 'all' : 'partial')
    setDescribing(false)
    setChosen(true)
    return true
  }, [mealOptions, onPicks, onDescribed])

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

  if (describing) {
    return (
      <DescribeDay
        options={mealOptions}
        onRead={applyDay}
        onCancel={() => setDescribing(false)}
      />
    )
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
        <div className="flex flex-col items-start gap-1.5 mt-1.5">
          <button
            type="button"
            onClick={() => { onPicks([]); setChosen(true); onDescribed(false) }}
            className="text-[13px] text-white/45 hover:text-white/75 transition-colors underline underline-offset-4 decoration-white/20"
          >
            Rather work it out properly?
          </button>
          {/*
            Door D. Also a link, and for the same reason Door C is: it is a
            change of instrument, not an answer. It sits under Door C rather
            than above it because counting is the one that always works — this
            one asks the reader to type, which on a phone is the most expensive
            thing the quiz could ask for, and it should be the second offer.
          */}
          <button
            type="button"
            onClick={() => { onPicks([]); setDescribing(true) }}
            className="text-[13px] text-[#00D4FF]/70 hover:text-[#00D4FF] transition-colors underline underline-offset-4 decoration-[#00D4FF]/25"
          >
            Or just tell us what you eat →
          </button>
        </div>
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
  /*
   * A day that came back from the typed door goes to the SUMMARY even when it
   * is incomplete, rather than stepping into the first gap. The reader has just
   * handed over a sentence and needs to see what was made of it — dropping them
   * straight onto a meal question would hide the three answers we had just
   * decided on their behalf. Blank rows are tappable like any other.
   */
  const active = editing ?? (read !== 'none' ? null : beat)

  if (!active) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[13px] text-white/55" style={{ fontFamily: 'var(--font-display)' }}>
            Your day
          </span>
          <Dots done={answered.length} total={MEALS.length} />
        </div>

        {/*
          What we made of what they typed, said plainly and BEFORE the rows.
          The reader has to know these four answers came from a machine reading
          their sentence, or the first wrong one reads as us telling them what
          they eat. Pre-written, both of them: nothing the model produced ever
          becomes a sentence on this screen.
        */}
        {read !== 'none' && (
          <p className="text-[12px] text-[#00D4FF]/70 leading-snug mb-1">
            {read === 'all'
              ? 'Here is what we made of that — change anything we got wrong.'
              : 'Here is what we could pick out. Fill in the rest and change anything we got wrong.'}
          </p>
        )}

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

        <PortionRow value={state.portions ?? 'average'} onChange={onPortions} />

        <div className="flex flex-col items-start gap-1.5 mt-1.5">
          <button
            type="button"
            onClick={() => { onPicks([]); setEditing(null); setDescribing(true); setRead('none') }}
            className="text-[13px] text-white/45 hover:text-white/75 transition-colors underline underline-offset-4 decoration-white/20"
          >
            Describe it in your own words instead
          </button>
          <button
            type="button"
            onClick={() => { onPicks([]); setEditing(null); setChosen(false); setRead('none'); onDescribed(false) }}
            className="text-[13px] text-white/45 hover:text-white/75 transition-colors underline underline-offset-4 decoration-white/20"
          >
            Back to the quick version
          </button>
        </div>
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

/**
 * Door D — one box, one sentence, and the four rows filled in from it.
 *
 * ── Why a textarea is allowed on a screen that hates typing ────────────────
 * It is not on the path. Nobody reaches this without tapping past five options
 * and two links, so the reader who is here has decided that typing a sentence
 * is easier than four taps — which for somebody whose lunch is genuinely hard
 * to place on a four-rung scale, it is. The presets remain the screen.
 *
 * ── What it says before they type ──────────────────────────────────────────
 * That the sentence is read by a machine, and that nothing else about them goes
 * with it. This is the only place in the quiz that sends a member's own words
 * anywhere, and a person typing about their own eating deserves to be told that
 * plainly, before they type, not in a policy.
 */
function DescribeDay({
  options, onRead, onCancel,
}: {
  options: Array<{ id: string; meal: Meal; label: string }>
  onRead: (raw: unknown) => boolean
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const submit = async () => {
    if (busy || text.trim().length < 3) return
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch('/api/quiz/protein-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, MAX_DAY_TEXT), options }),
      })
      const data = await res.json()
      if (!onRead(data?.picks)) setFailed(true)
    } catch {
      // The reader typed a sentence and pressed a button; "nothing happened" is
      // not an answer. Say so, and leave the counted day one tap away.
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label
        htmlFor="protein-day"
        className="text-[13px] text-white/55"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        What does a normal day look like?
      </label>

      <textarea
        id="protein-day"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_DAY_TEXT))}
        rows={4}
        autoFocus
        placeholder="Eggs on toast, chicken salad at work, curry or something in the evening, protein bar in the afternoon"
        className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white text-[14px] leading-snug placeholder-white/20 focus:outline-none focus:border-[#00D4FF]/50 focus:bg-white/[0.06] transition-colors resize-none"
      />

      <p className="text-[11.5px] text-white/30 leading-snug">
        Roughly is fine. We read it into the four meals below and you can change
        anything we get wrong. The sentence is all that is sent — not your name,
        your weight or anything else you have told us.
      </p>

      {failed && (
        <p className="text-[12px] text-white/55 leading-snug">
          We could not make much of that one. Try naming the meals — or count the
          day instead, which is four taps.
        </p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || text.trim().length < 3}
        className={`w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.99] ${
          busy || text.trim().length < 3
            ? 'bg-white/[0.06] text-white/25 cursor-not-allowed'
            : 'bg-[#00D4FF] text-[#0A0A0A]'
        }`}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {busy ? 'Reading it…' : 'Work it out'}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="self-start mt-0.5 text-[13px] text-white/45 hover:text-white/75 transition-colors underline underline-offset-4 decoration-white/20"
      >
        Back to the options
      </button>
    </div>
  )
}

/**
 * The portion control, on the summary rather than in the flow.
 *
 * Every option in the counted day carries one gram figure, and "a normal
 * portion" is not one quantity — see `PortionSize` for why leaving that alone
 * biased the whole module against larger people, in our own favour. It sits
 * here, after the day is described and defaulted to average, because it is a
 * correction to an answer rather than a question: nobody has to touch it, and
 * the reader who knows their plates are enormous now has somewhere to say so.
 */
function PortionRow({
  value, onChange,
}: {
  value: PortionSize
  onChange: (size: PortionSize) => void
}) {
  return (
    <div className="mt-3">
      <p className="text-[12px] text-white/35 leading-snug mb-2">
        And the size of those portions?
      </p>
      <div className="grid grid-cols-3 gap-2">
        {PORTION_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onChange(size)}
            aria-pressed={value === size}
            className="px-2 py-2.5 rounded-xl text-[11.5px] font-semibold leading-tight transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40"
            style={value === size
              ? { color: '#0A0A0A', background: '#00D4FF' }
              : { color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}
          >
            {PORTION_LABEL[size]}
          </button>
        ))}
      </div>
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
        Roughly what do you weigh? It’s the one thing we need before we can say
        anything useful about the amount. Skip it and we’ll keep it general.
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
  const intake = proteinIntakeFrom(question.options, picks, state.portions)
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
