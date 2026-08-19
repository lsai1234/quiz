'use client'

import { useEffect, useState } from 'react'

/**
 * What the preview shows while the server draws the card.
 *
 * ── What it is standing in for ──────────────────────────────────────────────
 * The wait is a real render — Satori laying out a 1080×1920 poster, loading
 * three faces and PNG-encoding the result — and it is long enough that a line of
 * static text reads as a stall. So this is a skeleton of the card's own layout:
 * the header rail, the score, the headline, five product rows. It says a poster
 * is being made, and because it is drawn in percentages inside a box that
 * already carries the format's aspect ratio, the preview does not jump when the
 * image lands.
 *
 * ── Why it also counts ──────────────────────────────────────────────────────
 * A sheen sweeping over a skeleton says "still alive". It does not say "nearly
 * there", and on the one screen where somebody is deciding whether this is worth
 * waiting for, that difference is the whole thing. So the wait now has a shape:
 * a meter that fills, and a line that changes as the render moves through what
 * it is actually doing — layout, then type, then the picture.
 *
 * The meter is an *activity* indicator, paced from measured render times, not a
 * report from the server: there is no progress to report, because the image
 * route is one request that either has a PNG or does not. It is therefore
 * asymptotic — it eases toward 92% and stays there for as long as the render
 * takes — and it only ever reaches 100% when the image has actually landed. It
 * cannot claim a card is ready before there is one, which is the only promise a
 * bar like this has to keep.
 *
 * `aria-hidden` over the bars with a live region beside them: a screen reader
 * wants "Building your card", not a description of eleven grey rectangles. The
 * stage line is that live region, so a wait long enough to change it is a wait
 * that says so out loud, and a fast one announces once and stops.
 */

/**
 * The stage line, and when each one arrives.
 *
 * Named after what the renderer is doing rather than invented for the sake of
 * movement — layout, then the faces, then the art and the encode, in that order.
 * The last one is terminal: past six seconds something is slow, and a line that
 * keeps promising stages that have already happened is a line nobody believes
 * the next time.
 */
const STAGES: Array<{ at: number; text: string }> = [
  { at: 0, text: 'Building your card…' },
  { at: 900, text: 'Setting the type…' },
  { at: 2100, text: 'Developing the picture…' },
  { at: 6000, text: 'Still going — hang on…' },
]

/** How fast the meter eases toward its ceiling, in seconds. */
const PACE = 1.6
/** Where it starts, so the meter is a meter rather than an empty line. */
const FLOOR = 6
/** Where it stops without the image. Never 100 — see above. */
const CEILING = 92

export function CardBuilding({ complete = false }: {
  /** The image has landed. Finishes the meter while the skeleton fades out. */
  complete?: boolean
}) {
  const [pct, setPct] = useState(FLOOR)
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (complete) {
      setPct(100)
      return
    }
    const started = Date.now()
    const id = setInterval(() => {
      const t = (Date.now() - started) / 1000
      setPct(FLOOR + (CEILING - FLOOR) * (1 - Math.exp(-t / PACE)))
    }, 110)
    return () => clearInterval(id)
  }, [complete])

  useEffect(() => {
    const timers = STAGES.slice(1).map((s, i) => setTimeout(() => setStage(i + 1), s.at))
    return () => timers.forEach(clearTimeout)
  }, [])

  const bar = (top: string, left: string, width: string, height: string, bright = false) => (
    <div
      className="card-build-bar absolute rounded-[2px]"
      style={{
        top, left, width, height,
        background: bright ? 'rgba(0,212,255,0.45)' : 'rgba(255,255,255,0.4)',
      }}
    />
  )

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Header rail */}
        {bar('13%', '8%', '26%', '1.1%', true)}
        {bar('13%', '58%', '34%', '1.1%')}
        {/* The score, bleeding off the left edge the way the card's does */}
        <div
          className="card-build-bar absolute rounded-[3px]"
          style={{ top: '15%', left: '-3%', width: '30%', height: '17%', background: 'rgba(255,255,255,0.16)' }}
        />
        {/* Kicker, headline, standfirst */}
        {bar('35.5%', '8%', '30%', '1%', true)}
        {bar('38.5%', '8%', '46%', '5.5%')}
        {bar('45%', '8%', '62%', '5.5%')}
        {bar('52%', '8%', '52%', '1%')}
        {/* The spec table */}
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i}>
            {bar(`${57 + i * 5.4}%`, '8%', `${44 - i * 4}%`, '2.4%')}
            {bar(`${57.6 + i * 5.4}%`, '80%', '12%', '1.1%')}
          </div>
        ))}

        {/* The sheen. One pass across the whole card rather than per element:
            a poster coming off a press, not eleven things loading. */}
        <div
          className="card-build-sheen absolute inset-y-0"
          style={{
            width: '55%',
            backgroundImage:
              'linear-gradient(100deg, transparent 0%, rgba(0,212,255,0.10) 40%, rgba(255,255,255,0.14) 50%, rgba(0,212,255,0.10) 60%, transparent 100%)',
          }}
        />
      </div>

      {/* The meter. A hairline rather than a track with a lip on it — this is a
          poster being printed, and the card's own rules are hairlines rather
          than containers. */}
      <div
        aria-hidden="true"
        className="absolute rounded-full overflow-hidden"
        style={{ left: '28%', right: '28%', bottom: 34, height: 2, background: 'rgba(255,255,255,0.12)' }}
      >
        <div
          className="card-build-meter h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, rgba(0,212,255,0.55), #00D4FF)',
            transition: 'width 180ms linear',
          }}
        />
      </div>

      <div
        role="status"
        aria-live="polite"
        className="absolute inset-x-0 bottom-4 text-center text-[11px]"
        style={{ color: 'var(--color-muted)' }}
      >
        {complete ? 'Ready' : STAGES[stage].text}
      </div>
    </div>
  )
}
