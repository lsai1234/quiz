'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { ResultsBundle } from '@/lib/consult/results'
import type { FlowState } from '@/lib/consult/flow'
import { STORY_COPY } from '@/lib/consult/story-copy'
import { READ_COPY } from '@/lib/consult/read-copy'
import { approvedHabits, type HabitLine } from '@/lib/consult/habits'
import { isOut, leads } from '@/lib/consult/pinpoint/leads'
import { consultFunnel, type GotYou } from '@/lib/analytics/consult'
import { buildSharePayload } from '@/lib/share-card/payload'
import { haptic, staggerStyle } from '@/lib/consult/motion'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { DayRing } from '../DayRing'
import { Amp } from '../Amp'
import { ChargeProfileChart } from '../ChargeProfileChart'
import { Constellation } from '../pinpoint/Constellation'
import { NextButton, QuietLink, Segmented } from '../controls'
import { StoryStart } from './StoryStart'
import type { OfferSettings } from '@/lib/offer/settings'

const ShareSheet = dynamic(() => import('@/components/share-card/ShareSheet').then((m) => m.ShareSheet), { ssr: false })

/**
 * Your Read, the story (Amp Consult and offer plan, Phase 8): after the
 * charge-up, the read as full-screen cards, built from Phase 5's content.
 *
 *   1  Your day          the day ring assembling, and in words
 *   2  What I spotted    the top pattern, their own words one by one, then
 *                        "Did Amp get you?"
 *   3  Joining the dots  the constellation settled, and what was ruled out
 *   4  Try this week     the approved fixes; tap one and the ring shows it
 *   5  Start here        the hero, the classics into battery cells, the gift
 *   6  Share
 *
 * With nothing pinpointed: their day, their profile in words, the offer.
 *
 * Tap the right of a card or swipe left to go on, the left or swipe right to
 * go back; swipe down (or "Skip to my stack") goes straight to the stack. No
 * timers: nothing moves on by itself. The arrow keys and Escape do the same,
 * and Next and Back are buttons too.
 */

export type StoryCard = 'day' | 'spotted' | 'dots' | 'try' | 'start' | 'share' | 'profile'

export function storyCards(bundle: ResultsBundle): StoryCard[] {
  if (!bundle.read.patterns.length) return ['day', 'profile', 'start']
  return ['day', 'spotted', 'dots', ...(approvedHabits(bundle.read.habits).length ? (['try'] as const) : []), 'start', 'share']
}

const KICKER: Record<StoryCard, string> = {
  day: STORY_COPY.day,
  spotted: STORY_COPY.spotted,
  dots: STORY_COPY.dots,
  try: STORY_COPY.tryThis,
  start: STORY_COPY.startHere,
  share: STORY_COPY.share,
  profile: STORY_COPY.profile,
}

const mono = {
  fontFamily: 'var(--amp-font-label)',
  fontSize: 'var(--amp-text-data)',
  letterSpacing: 'var(--amp-tracking-data)',
} as const

const GOT_YOU: { value: GotYou; label: string }[] = [
  { value: 'spot-on', label: 'Spot on' },
  { value: 'mostly', label: 'Mostly' },
  { value: 'not-really', label: 'Not really' },
]

const THANKS: Record<GotYou, string> = {
  'spot-on': 'Good. That’s what the stack is built on.',
  mostly: 'Thanks. You can change any answer from your results.',
  'not-really': 'Thanks for saying. Change my answers from your results and I’ll look again.',
}

/** How far a finger has to travel to count as a swipe. */
const SWIPE = 48

export function ReadStory({ bundle, state, onDone, start = 0, offer }: { bundle: ResultsBundle; state: FlowState; onDone: () => void; /** The card to open on (the workshop). */ start?: number; /** The workshop's own offer settings, in place of the shop's. */ offer?: OfferSettings }) {
  const reduced = useReducedMotion()
  const cards = storyCards(bundle)
  const [at, setAt] = useState(Math.min(start, cards.length - 1))
  const card = cards[at]
  const heading = useRef<HTMLHeadingElement>(null)
  const down = useRef<{ x: number; y: number } | null>(null)
  /** A swipe just ended: its own click doesn't count as a tap too. */
  const swiped = useRef(false)
  const first = useRef(true)

  const go = useCallback((to: number) => setAt(Math.max(0, Math.min(cards.length - 1, to))), [cards.length])
  const skip = useCallback(() => {
    consultFunnel.storySkip({ card, index: at })
    onDone()
  }, [card, at, onDone])

  useEffect(() => {
    consultFunnel.storyCard({ card, index: at, of: cards.length })
    if (first.current) {
      first.current = false
    } else {
      haptic('tick')
      heading.current?.focus({ preventScroll: true })
    }
  }, [card, at, cards.length])

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, [role="radiogroup"]')) return
    if (e.key === 'ArrowRight') go(at + 1)
    else if (e.key === 'ArrowLeft') go(at - 1)
    else if (e.key === 'Escape') skip()
    else return
    e.preventDefault()
  }

  /** A tap on the card itself, not on something in it. */
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (swiped.current) {
      swiped.current = false
      return
    }
    if ((e.target as HTMLElement).closest('button, a, [role="radio"], [role="switch"], input, label')) return
    const box = e.currentTarget.getBoundingClientRect()
    go(e.clientX - box.left < box.width / 3 ? at - 1 : at + 1)
  }

  return (
    <section
      aria-roledescription="story"
      aria-label={STORY_COPY.label}
      data-story={card}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY }
        swiped.current = false
      }}
      onPointerUp={(e) => {
        const from = down.current
        down.current = null
        if (!from) return
        const dx = e.clientX - from.x
        const dy = e.clientY - from.y
        if (dy > SWIPE * 1.5 && Math.abs(dy) > Math.abs(dx) * 1.5) {
          swiped.current = true
          skip()
        } else if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) {
          swiped.current = true
          go(dx < 0 ? at + 1 : at - 1)
        }
      }}
      className="mx-auto flex w-full flex-col"
      style={{
        maxWidth: 'var(--amp-column)',
        minHeight: 'calc(var(--app-height, 100dvh) - var(--amp-chrome-top, 0px))',
        padding: 'max(var(--amp-space-3), env(safe-area-inset-top)) var(--amp-gutter) max(var(--amp-space-4), env(safe-area-inset-bottom))',
        gap: 'var(--amp-space-3)',
        touchAction: 'pan-y',
      }}
    >
      {/* Progress: a segment per card, lit up to this one. */}
      <div className="flex items-center" style={{ gap: 'var(--amp-space-3)' }}>
        <ol className="flex flex-1" style={{ gap: 'var(--amp-space-1)' }} aria-label={`Card ${at + 1} of ${cards.length}`}>
          {cards.map((c, i) => (
            <li key={c} aria-current={i === at ? 'step' : undefined} data-segment={i <= at ? 'lit' : 'dim'} className="flex-1" style={{ height: 'var(--amp-space-1)', borderRadius: 'var(--amp-radius-pill)', background: i <= at ? 'var(--amp-accent)' : 'var(--amp-edge-strong)' }}>
              <span className="sr-only">{KICKER[c]}</span>
            </li>
          ))}
        </ol>
        <QuietLink onClick={skip}>{STORY_COPY.skip}</QuietLink>
      </div>

      <div key={card} className="amp-anim-rise flex flex-1 flex-col" style={{ gap: 'var(--amp-space-4)', cursor: 'pointer' }} onClick={onTap}>
        <p className="uppercase" style={{ ...mono, color: 'var(--amp-accent)' }}>
          {KICKER[card]}
        </p>
        <Card card={card} bundle={bundle} state={state} reduced={reduced} heading={heading} onDone={onDone} offer={offer} />
      </div>

      <div className="flex items-center justify-between" style={{ gap: 'var(--amp-space-3)' }}>
        <QuietLink icon="back" onClick={() => go(at - 1)} aria-label={STORY_COPY.back} disabled={at === 0}>
          {STORY_COPY.back}
        </QuietLink>
        {at < cards.length - 1 ? (
          <div className="flex-1">
            <NextButton onClick={() => go(at + 1)}>{STORY_COPY.next}</NextButton>
          </div>
        ) : (
          <div className="flex-1">
            <NextButton onClick={onDone}>{STORY_COPY.seeMyStack}</NextButton>
          </div>
        )}
      </div>
      <p aria-hidden className="text-center" style={{ fontSize: 'var(--amp-text-data)', color: 'var(--amp-ink-3)' }}>
        {STORY_COPY.skipHint}
      </p>
    </section>
  )
}

function Heading({ heading, children }: { heading: React.Ref<HTMLHeadingElement>; children: React.ReactNode }) {
  return (
    <h1 ref={heading} tabIndex={-1} className="uppercase" style={{ fontFamily: 'var(--amp-font-display)', fontWeight: 'var(--amp-weight-heavy)', fontSize: 'var(--amp-text-question)', lineHeight: 'var(--amp-leading-question)', outline: 'none' }}>
      {children}
    </h1>
  )
}

function Card({ card, bundle, state, reduced, heading, onDone, offer }: { card: StoryCard; bundle: ResultsBundle; state: FlowState; reduced: boolean; heading: React.Ref<HTMLHeadingElement>; onDone: () => void; offer?: OfferSettings }) {
  const read = bundle.read
  switch (card) {
    case 'day':
      return (
        <>
          <Heading heading={heading}>{STORY_COPY.dayHeading}</Heading>
          <div className="flex justify-center" data-story-ring>
            <DayRing answers={state.answers} size="lg">
              <Amp state="charged" size="lg" />
            </DayRing>
          </div>
        </>
      )
    case 'profile':
      return (
        <>
          <Heading heading={heading}>{READ_COPY.heading}</Heading>
          {read.profile && <ChargeProfileChart profile={read.profile} />}
          {read.words && <p style={{ color: 'var(--amp-ink-2)', fontSize: 'var(--amp-text-lead)' }}>{read.words}</p>}
        </>
      )
    case 'spotted':
      return <Spotted bundle={bundle} reduced={reduced} heading={heading} />
    case 'dots': {
      const out = leads(state.answers).filter((l) => isOut(l) && l.tested > 0)
      return (
        <>
          <Heading heading={heading}>{STORY_COPY.dotsHeading}</Heading>
          <Constellation size="lg" answers={state.answers} label={`Pinpointed: ${read.patterns.map((p) => p.name).join(', ')}`} />
          {out.length > 0 && (
            <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
              {STORY_COPY.ruledOut}: {out.map((l) => l.pattern.name.charAt(0).toLowerCase() + l.pattern.name.slice(1)).join(', ')}.
            </p>
          )}
        </>
      )
    }
    case 'try':
      return <TryThis habits={approvedHabits(read.habits)} state={state} heading={heading} reduced={reduced} />
    case 'start': {
      const safety = bundle.payload.notes.filter((n) => !/^(Kept out|Skipped):/.test(n))
      return (
        <>
          <Heading heading={heading}>{STORY_COPY.startHeading}</Heading>
          <StoryStart bundle={bundle} reduced={reduced} offer={offer} />
          {safety.length > 0 && (
            <ul className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }} aria-label={STORY_COPY.beforeYouStart}>
              {safety.map((n) => (
                <li key={n} style={{ padding: 'var(--amp-space-3) var(--amp-space-4)', borderRadius: 'var(--amp-radius-tile)', background: 'var(--amp-caution-fill)', color: 'var(--amp-caution)', fontSize: 'var(--amp-text-meta)', lineHeight: 'var(--amp-leading-body)' }}>
                  {n}
                </li>
              ))}
            </ul>
          )}
        </>
      )
    }
    case 'share':
      return <Share bundle={bundle} heading={heading} />
  }
}

function Spotted({ bundle, reduced, heading }: { bundle: ResultsBundle; reduced: boolean; heading: React.Ref<HTMLHeadingElement> }) {
  const top = bundle.read.patterns[0]
  const [gotYou, setGotYou] = useState<GotYou | null>(null)
  return (
    <>
      <Heading heading={heading}>{top.name}</Heading>
      <p style={{ color: 'var(--amp-ink-2)' }}>{top.line}</p>
      {bundle.read.found && <p>{bundle.read.found}</p>}
      {top.evidence.length > 0 && (
        <div>
          <p className="uppercase" style={{ ...mono, color: 'var(--amp-ink-2)' }}>
            {READ_COPY.youSaid}
          </p>
          <ul className="flex flex-col" style={{ gap: 'var(--amp-space-2)', marginTop: 'var(--amp-space-2)' }}>
            {top.evidence.map((e, i) => (
              // Their own words, one by one.
              <li key={e} className="amp-anim-rise" style={{ ...staggerStyle(i * 3 + 2, reduced), fontSize: 'var(--amp-text-lead)' }}>
                “{e}”
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="amp-anim-rise flex flex-col" style={{ ...staggerStyle(top.evidence.length * 3 + 3, reduced), gap: 'var(--amp-space-2)' }}>
        <p style={{ fontWeight: 'var(--amp-weight-bold)' }}>Did Amp get you?</p>
        <Segmented
          label="Did Amp get you?"
          options={GOT_YOU}
          value={gotYou}
          onChange={(v) => {
            if (!gotYou) consultFunnel.gotYou({ answer: v, found: bundle.read.patterns.length })
            setGotYou(v)
          }}
        />
        {gotYou && (
          <p aria-live="polite" style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
            {THANKS[gotYou]}
          </p>
        )}
      </div>
    </>
  )
}

function TryThis({ habits, state, heading, reduced }: { habits: HabitLine[]; state: FlowState; heading: React.Ref<HTMLHeadingElement>; reduced: boolean }) {
  const [picked, setPicked] = useState<string | null>(null)
  const change = habits.find((h) => h.id === picked)?.ring ?? null
  return (
    <>
      <Heading heading={heading}>{STORY_COPY.tryHeading}</Heading>
      <div className="flex justify-center" data-story-ring>
        <DayRing answers={state.answers} size="lg" change={change} />
      </div>
      <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>{STORY_COPY.tryHint}</p>
      <ul className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
        {habits.map((h, i) => (
          <li key={h.id} className="amp-anim-rise" style={staggerStyle(i + 1, reduced)}>
            <button
              type="button"
              aria-pressed={picked === h.id}
              data-habit={h.id}
              onClick={() => setPicked(picked === h.id ? null : h.id)}
              className="amp-press w-full text-left"
              style={{
                padding: 'var(--amp-space-3) var(--amp-space-4)',
                borderRadius: 'var(--amp-radius-tile)',
                border: `var(--amp-hairline) solid ${picked === h.id ? 'var(--amp-accent)' : 'var(--amp-edge-strong)'}`,
                background: picked === h.id ? 'var(--amp-accent-fill)' : 'var(--amp-glass-solid)',
              }}
            >
              {h.text}
            </button>
            <a href={h.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ display: 'inline-block', marginTop: 'var(--amp-space-1)', fontSize: 'var(--amp-text-data)', color: 'var(--amp-ink-2)' }}>
              {h.source.label}
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}

function Share({ bundle, heading }: { bundle: ResultsBundle; heading: React.Ref<HTMLHeadingElement> }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Heading heading={heading}>{bundle.read.identity ?? STORY_COPY.shareHeading}</Heading>
      <p style={{ color: 'var(--amp-ink-2)' }}>{STORY_COPY.shareLine}</p>
      <NextButton onClick={() => setOpen(true)}>{STORY_COPY.shareButton}</NextButton>
      {open && <ShareSheet payload={buildSharePayload(bundle.blueprint, bundle.catalogue)} onClose={() => setOpen(false)} />}
    </>
  )
}
