'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { track } from '@/lib/analytics/events'
import { Icon } from '@/components/ui/Icon'

/**
 * "Build it for me": the quiz, shown working.
 *
 * A still banner can only say what the quiz does. This shows it: an example
 * person's answers appear on the left, Amp thinks in the middle while the day
 * ring sweeps round, and their stack fills in on the right, each product at the
 * time they'd take it. Say a few things, get a plan, read in one glance.
 *
 * Drawn in SVG and CSS, like the quiz's own Amp and day ring: no video and no
 * animation library. It plays only while it is on screen and the tab is open,
 * has a pause button (anything that moves for more than five seconds needs
 * one), and holds still on a finished example under reduced motion.
 *
 * The examples are about the person's week, never their health, and name
 * products without saying what they do. Every one is marked as an example.
 */

interface Example {
  said: string[]
  /** Hour of the day (0–24) and what lands there. */
  day: Array<[number, string]>
}

const EXAMPLES: Example[] = [
  { said: ['Lifts 4× a week', 'Vegan', 'Trains after work'], day: [[7.5, 'Creatine'], [17, 'Electrolytes'], [19, 'Plant protein']] },
  { said: ['Runs 3× a week', 'No caffeine', 'Early starts'], day: [[6, 'Stim-free pre'], [7.5, 'Electrolytes'], [13, 'Multivitamin']] },
  { said: ['Desk job', 'Wants the basics', 'Capsules, please'], day: [[8, 'Vitamin D3 + K2'], [13, 'Omega-3'], [21.5, 'Magnesium']] },
]

const R = 66
const C = 2 * Math.PI * R
const at = (h: number, r = R): [number, number] => {
  const a = (h / 24) * 2 * Math.PI - Math.PI / 2
  return [80 + r * Math.cos(a), 80 + r * Math.sin(a)]
}
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`

type AmpState = 'idle' | 'thinking' | 'charged'

interface Frame {
  said: number
  dots: number
  got: number
  sweeping: boolean
  amp: AmpState
}

const FINISHED: Frame = { said: 3, dots: 3, got: 3, sweeping: true, amp: 'charged' }
const BLANK: Frame = { said: 0, dots: 0, got: 0, sweeping: false, amp: 'idle' }

export function ShopQuizTile() {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [who, setWho] = useState(0)
  const [frame, setFrame] = useState<Frame>(FINISHED)
  /** False until the sweep has been reset without a transition, so it can sweep again. */
  const [instant, setInstant] = useState(true)
  const [paused, setPaused] = useState(false)
  const [onScreen, setOnScreen] = useState(false)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.2 })
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
    if (!playing) {
      setInstant(true)
      setFrame(FINISHED)
      return
    }
    const timers: ReturnType<typeof setTimeout>[] = []
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
    let person = who

    const play = (startIn: number) => {
      const ex = EXAMPLES[person]
      later(startIn, () => {
        setWho(person)
        setInstant(true)
        setFrame(BLANK)
      })
      const t0 = startIn + 60
      ex.said.forEach((_, k) => later(t0 + 300 + k * 600, () => setFrame((f) => ({ ...f, said: k + 1 }))))
      later(t0 + 2000, () => setFrame((f) => ({ ...f, amp: 'thinking' })))
      later(t0 + 2700, () => {
        setInstant(false)
        setFrame((f) => ({ ...f, sweeping: true }))
      })
      let last = 0
      ex.day.forEach(([h], k) => {
        const land = t0 + 2700 + 1800 * (h / 24)
        later(land, () => setFrame((f) => ({ ...f, dots: k + 1 })))
        last = Math.max(land, last + 420)
        later(last, () => setFrame((f) => ({ ...f, got: k + 1 })))
      })
      later(last + 300, () => setFrame((f) => ({ ...f, amp: 'charged' })))
      later(last + 3200, () => {
        person = (person + 1) % EXAMPLES.length
        play(0)
      })
    }
    // A beat on the finished example first, so the first thing seen is whole.
    play(1500)
    return () => timers.forEach(clearTimeout)
    // `who` is read once, to carry on from the example on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  const ex = EXAMPLES[who]

  return (
    <div ref={ref} className="sf-way sf-way-quiz" data-shop-quiz-tile>
      <div className="sf-way-head">
        <div className="sf-way-words">
          <span className="sf-label sf-way-eyebrow">
            Build it for me
            <button
              type="button"
              className="sf-way-pause"
              aria-pressed={paused}
              aria-label={paused ? 'Play the example' : 'Pause the example'}
              onClick={() => setPaused((p) => !p)}
            >
              <Icon name={paused ? 'play' : 'pause'} size={10} />
            </button>
          </span>
          <h3 className="sf-way-title">A stack made for you</h3>
        </div>
        <Link
          href="/quiz"
          className="sf-way-go"
          aria-label="Take the quiz: tell us about your week and get a stack planned around your day"
          onClick={() => track('shop_quiz_tile_open')}
        >
          Take the quiz <Icon name="arrow-right" size={12} />
        </Link>
      </div>

      <div className="sf-demo" aria-hidden data-flow={frame.amp === 'thinking'}>
        <div className="sf-demo-col sf-demo-said">
          <span className="sf-demo-k">Example answers</span>
          <ul>
            {ex.said.map((s, k) => (
              <li key={`${who}-${s}`} data-on={k < frame.said}>{s}</li>
            ))}
          </ul>
        </div>

        <div className="sf-demo-mid">
          <svg className="sf-demo-ring" viewBox="0 0 160 160" data-amp={frame.amp}>
            {[0, 6, 12, 18].map((h) => {
              const [x1, y1] = at(h, R + 7)
              const [x2, y2] = at(h, R + 13)
              return <line key={h} className="sf-ring-tick" x1={x1} y1={y1} x2={x2} y2={y2} />
            })}
            <circle className="sf-ring-track" cx="80" cy="80" r={R} />
            <circle
              className="sf-ring-sweep"
              cx="80"
              cy="80"
              r={R}
              transform="rotate(-90 80 80)"
              style={{
                strokeDasharray: C,
                strokeDashoffset: frame.sweeping ? 0 : C,
                transition: instant ? 'none' : 'stroke-dashoffset 1.8s cubic-bezier(0.45, 0, 0.2, 1)',
              }}
            />
            <g transform="translate(80 80)">
              <circle className="sf-amp-halo" r="52" />
              <circle className="sf-amp-body" r="45" />
              <ellipse className="sf-amp-sheen" cx="-9" cy="-25" rx="20" ry="8" />
              <g className="sf-amp-eyes">
                <rect className="sf-amp-eye" x="-18" y="-15" width="11" height="20" rx="5.5" />
                <rect className="sf-amp-eye" x="7" y="-15" width="11" height="20" rx="5.5" />
              </g>
              <path className="sf-amp-mouth" d="M-8 14 Q0 20 8 14" />
            </g>
            {ex.day.map(([h], k) => {
              const [x, y] = at(h)
              return <circle key={`${who}-${h}`} className="sf-ring-dot" cx={x} cy={y} r="10" data-on={k < frame.dots} />
            })}
          </svg>
        </div>

        <div className="sf-demo-col sf-demo-got">
          <span className="sf-demo-k">Their stack</span>
          <ul>
            {ex.day.map(([h, name], k) => (
              <li key={`${who}-${name}`} data-on={k < frame.got}>
                <time className="sf-num">{hhmm(h)}</time>
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
