'use client'

/**
 * Act 1 — the hero. The first question is the front page.
 *
 * The page exists to get one tap, so it asks the quiz's real first question —
 * what do you want to work on — as eight answers a visitor recognises
 * themselves in, rather than a choice between two categories they have to
 * translate first. One tap starts the quiz with that goal already picked: the
 * goals screen opens on it, lit, with the rest of the grid beside it to add to.
 *
 * Everything the visitor needs to decide fits above the toolbar of a phone:
 * what this is (the headline and the bottle), what they get (the lede), what
 * it costs them (the trust row), and the first answer. `docs/HERO.md` has the
 * reasoning; `hero.css` has the look.
 */

import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useQuizStore } from '@/lib/store'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import { CHRGDMark } from '@/components/brand/CHRGDLogo'
import { GOALS_DATA, WELLBEING_DATA } from '@/lib/quiz-goals'
import type { Goal, QuizTrack } from '@/lib/types'
import type { HeroOffer } from '@/lib/experiments/consult'

interface Props {
  onEnterQuiz: () => void
  /** The Amp Consult — the third way in. Omitted, the option isn't shown. */
  onEnterConsult?: () => void
  /**
   * Which front door(s) this visitor gets (H11): the quiz, the consult, or
   * both. Set from the hub without a deploy; quiz only by default.
   */
  offer?: HeroOffer
  reducedMotion: boolean
}

/**
 * The eight goals on the front page, and the track each one opens.
 *
 * Training on the left, how-you-feel on the right — four from each grid, so
 * neither half of the audience scans a column that isn't for them. Labels and
 * icons are looked up from the quiz's own grids rather than restated, because
 * the next screen shows the same answer lit and it has to be the same words.
 *
 * A training goal opens the combined track (performance + wellness), which is
 * what the quiz's own second card does; a wellness goal opens wellness. The
 * goals screen keeps its switch for anybody who wants the other.
 */
export const HERO_GOALS: ReadonlyArray<{ id: Goal; track: QuizTrack }> = [
  { id: 'energy', track: 'performance' },
  { id: 'sleep-better', track: 'wellbeing' },
  { id: 'muscle', track: 'performance' },
  { id: 'less-stress', track: 'wellbeing' },
  { id: 'cutting', track: 'performance' },
  { id: 'focus', track: 'wellbeing' },
  { id: 'recovery', track: 'performance' },
  { id: 'immune', track: 'wellbeing' },
]

const GOAL_META = new Map([...GOALS_DATA, ...WELLBEING_DATA].map((g) => [g.id, g]))

/** How long the charge takes to pour across a picked answer before the quiz
 *  takes over. Long enough to see it land; short enough not to be waited on. */
export const PICK_BEAT_MS = 420

const TRUST = ['About 90 seconds', 'No sign-up', 'Skips what you already take']

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M8 4L14 10L8 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Tick({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4.5 10.5L8.5 14.5L15.5 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Stagger index for the entrance, as the custom property `hero.css` reads. */
const rise = (i: number) => ({ '--i': i }) as CSSProperties

export function Act1Hero({ onEnterQuiz, onEnterConsult, offer = 'quiz-only', reducedMotion }: Props) {
  const showQuiz = offer !== 'consult-only' || !onEnterConsult
  const showConsult = offer !== 'quiz-only' && Boolean(onEnterConsult)

  /** The answer being poured, while it pours. Further taps are ignored. */
  const [picked, setPicked] = useState<Goal | null>(null)
  const beat = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (beat.current) clearTimeout(beat.current) }, [])

  /**
   * Start the quiz from the top with this goal chosen — or with nothing chosen,
   * which opens on the quiz's own track chooser.
   *
   * From the top means the goals screen: the step counter goes back to the
   * start and a saved v2 interview is dropped, so a returning visitor who taps
   * an answer here rather than "Resume" gets the quiz they just asked for, not
   * the middle of the last one. Their other answers stay, ready to confirm.
   */
  function begin(goal: { id: Goal; track: QuizTrack } | null) {
    if (picked) return
    const s = useQuizStore.getState()
    s.setStep(0)
    s.setInterview(null)
    s.setAnswer('track', goal?.track ?? null)
    s.setGoals(goal ? [goal.id] : [])
    s.setAnswer('wellbeingAnswers', {})

    if (!goal || reducedMotion) {
      onEnterQuiz()
      return
    }
    setPicked(goal.id)
    beat.current = setTimeout(onEnterQuiz, PICK_BEAT_MS)
  }

  let i = 0

  return (
    <section className="hero" data-reduced-motion={reducedMotion ? 'true' : undefined}>
      <div className="hero-ground" aria-hidden>
        <div className="system-bloom system-bloom-1" />
        <div className="system-bloom system-bloom-2" />
        <div className="system-bloom system-bloom-3" />
        <div className="hero-spotlight" />
        <div className="system-vignette" />
      </div>

      <header className="hero-bar">
        <span className="hero-brand">
          <CHRGDMark size={22} tone="var(--ink-1)" accent="var(--accent)" keyline="var(--ground-base)" />
          getCHRGD
        </span>
        {/*
          The way past the quiz, for somebody who already knows what they want.
          Where people look for a shop, and quiet: a page whose only door is a
          questionnaire loses everybody who came for one tub of creatine.
        */}
        <Link href="/shop" className="hero-shop" aria-label="Browse the whole shop" data-interactive>
          Shop
          <Chevron />
        </Link>
      </header>

      <div className="hero-main">
        <div className="hero-stage" aria-hidden>
          <div className="hero-pad" />
          <div className="hero-pulse" />
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className={`hero-capsule hero-capsule-${n}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/hero/capsule-${n}.webp`} alt="" width={200} height={80} decoding="async" />
            </div>
          ))}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="hero-bottle"
            src="/hero/bottle.webp"
            alt=""
            width={480}
            height={720}
            decoding="async"
            fetchPriority="high"
          />
        </div>

        <div className="hero-copy">
          <h1 className="hero-title hero-rise" style={rise(i++)}>
            Know exactly
            <span className="hero-title-accent">what to take.</span>
          </h1>
          <p className="hero-lede hero-rise" style={rise(i++)}>
            A few quick questions, then a supplement stack built around your goals, training and diet.
          </p>
        </div>

        <div className="hero-ask">
          <p id="hero-question" className="hero-question hero-rise" style={rise(i++)}>
            {showQuiz ? 'What do you want to work on?' : 'Start with Amp'}
          </p>

          {showQuiz && (
            <>
              <div className="hero-goals" role="group" aria-labelledby="hero-question">
                {HERO_GOALS.map((g) => {
                  const meta = GOAL_META.get(g.id)!
                  const state = picked === null ? undefined : picked === g.id ? 'picked' : 'other'
                  return (
                    <button
                      key={g.id}
                      type="button"
                      className="hero-goal hero-rise"
                      style={rise(i++)}
                      data-state={state}
                      data-goal={g.id}
                      onClick={() => begin(g)}
                    >
                      <span className="hero-goal-icon" aria-hidden>
                        <QuizIcon name={meta.icon} size={18} />
                      </span>
                      <span className="hero-goal-label">{meta.label}</span>
                      <span className="hero-goal-tick" aria-hidden><Tick /></span>
                    </button>
                  )
                })}
              </div>
              <p className="hero-hint hero-rise" style={rise(i++)}>
                Tap one to start. You can add more on the next screen.
              </p>
              <button type="button" className="hero-more hero-rise" style={rise(i++)} onClick={() => begin(null)}>
                Something else? See every goal
                <Chevron />
              </button>
            </>
          )}

          {showConsult && (
            <button
              type="button"
              onClick={onEnterConsult}
              data-testid="enter-consult"
              className="hero-consult hero-rise"
              style={rise(i++)}
            >
              <span className="hero-goal-icon" aria-hidden>
                <QuizIcon name="bolt" size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="hero-consult-title">
                  The Amp Consult
                  <span className="hero-badge">New</span>
                </span>
                <span className="hero-consult-sub block">Tap, drag and spin through a charge-up with Amp</span>
              </span>
              <span className="text-[var(--ink-3)]"><Chevron /></span>
            </button>
          )}

          {/* Honest cues only: each of these is something the quiz actually
              does. Real social proof slots in here once there is some. */}
          <ul className="hero-trust hero-rise" style={rise(i++)}>
            {TRUST.map((t) => (
              <li key={t}><Tick size={13} />{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
