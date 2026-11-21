'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { track } from '@/lib/analytics/events'
import { Icon } from '@/components/ui/Icon'
import { buttonClasses } from '@/components/storefront'

/**
 * The quiz, at the top of the shop: a compact strip, not a takeover.
 *
 * It says what the quiz is in one line ("Get a stack built around you"), what
 * it costs you in the next ("a few quick questions… about a minute, no
 * sign-up"), and has one button. Beside that, the brand's own bottle stands on
 * a charging pad whose ring is the day, and Amp narrates an example in three
 * beats: what somebody said, Amp thinking (a light runs round the ring), and
 * their stack landing — each product lights a point on the ring at the hour
 * they'd take it. Then the next example.
 *
 * Deliberately not a hero. It is about 290px tall on a phone and 250 on a
 * desktop, so the shop itself is on the first screen: someone who came for a
 * tub of creatine should not have to scroll past a pitch to find it.
 *
 * Motion: plays only while on screen and the tab is open; a pause button
 * (anything that moves for more than five seconds needs one); under reduced
 * motion it holds the finished example, still, with no float and no comet.
 *
 * The examples are about a person's week, never their health, and name
 * products without saying what they do. They are marked as examples.
 */

interface Example {
  who: string
  said: string[]
  /** Hour of the day (0–24) and what lands there. */
  day: Array<[number, string]>
}

const EXAMPLES: Example[] = [
  { who: 'Sam', said: ['Lifts 4× a week', 'Vegan', 'Trains after work'], day: [[7.5, 'Creatine'], [17, 'Electrolytes'], [19, 'Plant protein']] },
  { who: 'Priya', said: ['Runs 3× a week', 'No caffeine', 'Early starts'], day: [[6, 'Stim-free pre'], [7.5, 'Electrolytes'], [13, 'Multivitamin']] },
  { who: 'Jo', said: ['Desk job', 'Wants the basics', 'Capsules, please'], day: [[8, 'Vitamin D3 + K2'], [13, 'Omega-3'], [21.5, 'Magnesium']] },
]

type Phase = 'said' | 'think' | 'stack'

const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`

/* ── The stage, in one coordinate system ────────────────────────────────────
   Drawn in a 200-unit square and framed by VIEWBOX tightly around what is
   visible, so the bottle is as large as the strip allows. */
const VIEWBOX = '16 40 168 156'
const CX = 100
const CY = 170
const RX = 72
const RY = 15
/** Midnight at the back of the pad, noon at the front, six o'clock on the right. */
const angle = (h: number) => -Math.PI / 2 + (h / 24) * Math.PI * 2
const point = (h: number, k = 1): [number, number] => [CX + RX * k * Math.cos(angle(h)), CY + RY * k * Math.sin(angle(h))]
const inFront = (h: number) => Math.sin(angle(h)) >= 0
const ARC_BACK = `M${CX - RX} ${CY} A${RX} ${RY} 0 0 1 ${CX + RX} ${CY}`
const ARC_FRONT = `M${CX + RX} ${CY} A${RX} ${RY} 0 0 1 ${CX - RX} ${CY}`
/** The bottle render is 2:3, and its base sits 85.9% of the way down the file. */
const BOTTLE_H = 150
const BOTTLE_W = BOTTLE_H * (2 / 3)
const BOTTLE_X = CX - 0.4965 * BOTTLE_W
/** Where the bottle stands: just in front of the pad's centre line. */
const BASE = CY + 3
const BOTTLE_Y = BASE - 0.859 * BOTTLE_H

export function ShopQuizStrip() {
  const reduced = useReducedMotion()
  const ids = useId().replace(/[^a-zA-Z0-9]/g, '')
  const ref = useRef<HTMLElement>(null)
  const cometFront = useRef<SVGGElement>(null)
  const cometBack = useRef<SVGGElement>(null)

  const [who, setWho] = useState(0)
  const [phase, setPhase] = useState<Phase>('stack')
  const [said, setSaid] = useState(3)
  const [landed, setLanded] = useState(3)
  const [paused, setPaused] = useState(false)
  const [onScreen, setOnScreen] = useState(false)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    const onVis = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const playing = onScreen && visible && !paused && !reduced

  useEffect(() => {
    const clearComet = () => {
      if (cometFront.current) cometFront.current.innerHTML = ''
      if (cometBack.current) cometBack.current.innerHTML = ''
    }
    if (!playing) {
      clearComet()
      setPhase('stack')
      setSaid(3)
      setLanded(3)
      return
    }

    const timers: ReturnType<typeof setTimeout>[] = []
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
    let raf = 0
    let person = who

    /** A light running once round the ring, drawn straight into the SVG: no re-render per frame. */
    const comet = (duration: number) => {
      const t0 = performance.now()
      const draw = (t: number) => {
        const k = Math.min(1, (t - t0) / duration)
        const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        const head = -Math.PI / 2 + eased * Math.PI * 2
        let front = ''
        let back = ''
        const N = 20
        for (let i = 0; i < N; i++) {
          const a0 = head - 1.2 * (1 - i / N)
          const a1 = head - 1.2 * (1 - (i + 1) / N)
          const fade = k < 0.94 ? 1 : (1 - k) * 16
          const seg = `<line x1="${CX + RX * Math.cos(a0)}" y1="${CY + RY * Math.sin(a0)}" x2="${CX + RX * Math.cos(a1)}" y2="${CY + RY * Math.sin(a1)}" stroke="#8FEFFF" stroke-width="${0.8 + (2.2 * i) / N}" stroke-linecap="round" opacity="${(i / N) * fade}"/>`
          if (Math.sin((a0 + a1) / 2) >= 0) front += seg
          else back += seg
        }
        if (k < 0.97) {
          const dot = `<circle cx="${CX + RX * Math.cos(head)}" cy="${CY + RY * Math.sin(head)}" r="3" fill="#fff" class="sf-strip-comet"/>`
          if (Math.sin(head) >= 0) front += dot
          else back += dot
        }
        if (cometFront.current) cometFront.current.innerHTML = front
        if (cometBack.current) cometBack.current.innerHTML = back
        if (k < 1) raf = requestAnimationFrame(draw)
        else clearComet()
      }
      raf = requestAnimationFrame(draw)
    }

    const play = (startIn: number) => {
      const ex = EXAMPLES[person]
      later(startIn, () => {
        setWho(person)
        setPhase('said')
        setSaid(0)
        setLanded(0)
      })
      ex.said.forEach((_, k) => later(startIn + 250 + k * 450, () => setSaid(k + 1)))
      later(startIn + 2300, () => {
        setPhase('think')
        comet(1700)
      })
      later(startIn + 4100, () => setPhase('stack'))
      ex.day.forEach((_, k) => later(startIn + 4150 + k * 420, () => setLanded(k + 1)))
      later(startIn + 9200, () => {
        person = (person + 1) % EXAMPLES.length
        play(0)
      })
    }
    // A beat on the finished example first, so the first thing seen is whole.
    play(1400)
    return () => {
      timers.forEach(clearTimeout)
      cancelAnimationFrame(raf)
      clearComet()
    }
    // `who` is read once, to carry on from the example on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  const ex = EXAMPLES[who]
  const step = phase === 'said' ? 0 : phase === 'think' ? 1 : 2
  const nodes = (front: boolean) =>
    ex.day.map(([h], k) => {
      if (inFront(h) !== front) return null
      const [x, y] = point(h)
      return (
        <g key={`${who}-${h}`} className="sf-strip-node" data-on={k < landed}>
          <circle className="sf-strip-node-halo" cx={x} cy={y} r={5} />
          <circle className="sf-strip-node-core" cx={x} cy={y} r={2.4} />
        </g>
      )
    })

  return (
    <section ref={ref} className="sf-strip" data-phase={phase} aria-labelledby="shop-quiz-title" data-shop-quiz-tile>
      <div className="sf-wrap sf-strip-in">
        <svg className="sf-strip-stage" viewBox={VIEWBOX} aria-hidden focusable="false">
          <defs>
            <radialGradient id={`${ids}-glow`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#00D4FF" stopOpacity="0.5" />
              <stop offset="0.55" stopColor="#00D4FF" stopOpacity="0.12" />
              <stop offset="1" stopColor="#00D4FF" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${ids}-pad`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#00D4FF" stopOpacity="0.2" />
              <stop offset="0.6" stopColor="#00D4FF" stopOpacity="0.05" />
              <stop offset="1" stopColor="#00D4FF" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${ids}-ring`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#00D4FF" stopOpacity="0.35" />
              <stop offset="0.5" stopColor="#9BF0FF" />
              <stop offset="1" stopColor="#00D4FF" stopOpacity="0.35" />
            </linearGradient>
            <linearGradient id={`${ids}-fade`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.86" stopColor="#fff" stopOpacity="0.9" />
            </linearGradient>
            <mask id={`${ids}-refl`} maskContentUnits="objectBoundingBox">
              <rect width="1" height="1" fill={`url(#${ids}-fade)`} />
            </mask>
          </defs>

          <ellipse className="sf-strip-glow" cx={CX} cy={118} rx={56} ry={56} fill={`url(#${ids}-glow)`} />
          <ellipse cx={CX} cy={CY} rx={RX * 1.02} ry={RY * 1.02} fill={`url(#${ids}-pad)`} />
          <ellipse cx={CX} cy={CY} rx={RX * 0.72} ry={RY * 0.72} fill="none" stroke="rgba(255,255,255,0.06)" />
          <path className="sf-strip-ring-glow" d={ARC_BACK} />
          <path className="sf-strip-ring" d={ARC_BACK} stroke={`url(#${ids}-ring)`} />
          <g ref={cometBack} />
          <g className="sf-strip-back">{nodes(false)}</g>

          <g className="sf-strip-float sf-strip-float-a">
            <image href="/hero/capsule-1.webp" x={18} y={62} width={52} height={21} transform="rotate(-28 44 72)" opacity={0.85} />
          </g>
          {/* The reflection: the same render mirrored about its own base, fading out. */}
          <image
            href="/hero/bottle.webp"
            x={BOTTLE_X}
            y={BOTTLE_Y}
            width={BOTTLE_W}
            height={BOTTLE_H}
            transform={`translate(0 ${2 * BASE}) scale(1 -1)`}
            opacity={0.16}
            mask={`url(#${ids}-refl)`}
          />
          <image href="/hero/bottle.webp" x={BOTTLE_X} y={BOTTLE_Y} width={BOTTLE_W} height={BOTTLE_H} />

          <path className="sf-strip-ring-glow" d={ARC_FRONT} />
          <path className="sf-strip-ring" d={ARC_FRONT} stroke={`url(#${ids}-ring)`} />
          <g ref={cometFront} />
          <g>{nodes(true)}</g>
          <g className="sf-strip-float sf-strip-float-b">
            <image href="/hero/capsule-2.webp" x={128} y={112} width={48} height={19} transform="rotate(24 152 121)" />
          </g>
        </svg>

        <div className="sf-strip-copy">
          <h2 id="shop-quiz-title" className="sf-strip-title">
            Get a stack <span>built around you</span>
          </h2>
          <p className="sf-strip-lede">
            Answer a few quick questions about your training, diet and day. About a minute, no sign-up.
          </p>
          <Link href="/quiz" className={buttonClasses('primary', 'sm')} onClick={() => track('shop_quiz_tile_open')}>
            Take the quiz
            <Icon name="bolt" size={15} />
          </Link>
        </div>

        <div className="sf-strip-ro">
          <div className="sf-strip-amp" aria-hidden>
            <svg viewBox="-2 -2 52 52" width="36" height="36">
              <defs>
                <radialGradient id={`${ids}-ab`} cx="50%" cy="42%" r="62%"><stop offset="0" stopColor="#12424d" /><stop offset="1" stopColor="#071619" /></radialGradient>
                <radialGradient id={`${ids}-al`} cx="50%" cy="42%" r="62%"><stop offset="0" stopColor="#8bebff" /><stop offset="0.62" stopColor="#00D4FF" /><stop offset="1" stopColor="#12424d" /></radialGradient>
                <radialGradient id={`${ids}-ae`} cx="50%" cy="50%" r="50%"><stop offset="0.78" stopColor="#00D4FF" stopOpacity="0" /><stop offset="1" stopColor="#00D4FF" stopOpacity="0.45" /></radialGradient>
                <radialGradient id={`${ids}-as`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#e7f3f6" stopOpacity="0.2" /><stop offset="1" stopColor="#e7f3f6" stopOpacity="0" /></radialGradient>
                <radialGradient id={`${ids}-au`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#00D4FF" stopOpacity="0.5" /><stop offset="1" stopColor="#00D4FF" stopOpacity="0" /></radialGradient>
                <linearGradient id={`${ids}-ey`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e7f3f6" /><stop offset="1" stopColor="#a6f0ff" /></linearGradient>
              </defs>
              <circle cx="24" cy="24" r="24" fill={`url(#${ids}-ab)`} />
              <circle className="sf-amp-lit" cx="24" cy="24" r="24" fill={`url(#${ids}-al)`} />
              <ellipse cx="24" cy="36" rx="16" ry="9" fill={`url(#${ids}-au)`} />
              <circle cx="24" cy="24" r="24" fill={`url(#${ids}-ae)`} />
              <ellipse cx="24" cy="11.5" rx="14" ry="7" fill={`url(#${ids}-as)`} />
              <g className="sf-amp-eyes">
                <rect x="15.1" y="18.2" width="5.4" height="8.8" rx="2.7" fill={`url(#${ids}-ey)`} />
                <rect x="27.5" y="18.2" width="5.4" height="8.8" rx="2.7" fill={`url(#${ids}-ey)`} />
                <path d="M20.6 31.6q3.4 2.5 6.8 0" fill="none" stroke="#a6f0ff" strokeWidth="1.8" strokeLinecap="round" />
              </g>
              <g className="sf-amp-happy" fill="none" stroke="#031419" strokeWidth="2.4" strokeLinecap="round">
                <path d="M14.6 24q3.2-4.2 6.4 0" />
                <path d="M27 24q3.2-4.2 6.4 0" />
                <path d="M19 30.4q5 5.4 10 0" />
              </g>
            </svg>
          </div>

          <div className="sf-strip-ro-body" aria-hidden>
            <p className="sf-strip-ro-k">
              {phase === 'said' ? `Example: ${ex.who} answered` : phase === 'think' ? `Example: Amp is building ${ex.who}’s stack` : `Example: ${ex.who}’s stack`}
            </p>
            <div className="sf-strip-ro-v" key={`${who}-${phase}`}>
              {phase === 'said' &&
                ex.said.map((s, k) => (
                  <span key={s} className="sf-strip-said" data-on={k < said}>{s}</span>
                ))}
              {phase === 'think' && <span className="sf-strip-shimmer">Matching products to {ex.who}’s week and timing them to the day</span>}
              {phase === 'stack' &&
                ex.day.map(([h, name], k) => (
                  <span key={name} className="sf-strip-item" data-on={k < landed}>
                    <b className="sf-num">{hhmm(h)}</b>
                    {name}
                  </span>
                ))}
            </div>
          </div>

          <span className="sf-strip-steps" aria-hidden>
            {[0, 1, 2].map((i) => <i key={i} data-on={i <= step} />)}
          </span>

          {!reduced && (
            <button
              type="button"
              className="sf-icon-button sf-strip-pause"
              aria-pressed={paused}
              aria-label={paused ? 'Play the example' : 'Pause the example'}
              onClick={() => setPaused((p) => !p)}
            >
              <Icon name={paused ? 'play' : 'pause'} size={12} />
            </button>
          )}

          <p className="sr-only">
            Examples of what the quiz builds:{' '}
            {EXAMPLES.map((e) => `${e.who} said ${e.said.join(', ')} and got ${e.day.map(([h, n]) => `${n} at ${hhmm(h)}`).join(', ')}`).join('. ')}.
          </p>
        </div>
      </div>
    </section>
  )
}
