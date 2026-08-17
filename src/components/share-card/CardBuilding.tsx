'use client'

/**
 * What the preview shows while the server draws the card.
 *
 * The wait is a real render — Satori laying out a 1080×1920 poster and encoding
 * a PNG — and it is long enough that a line of static text reads as a stall. So
 * this is a skeleton of the card's own layout: the header rail, the score, the
 * headline, five product rows. It says a poster is being made, and because it is
 * drawn in percentages inside a box that already carries the format's aspect
 * ratio, the preview does not jump when the image lands.
 *
 * `aria-hidden` over the bars with a live region beside them: a screen reader
 * wants "Building your card", not a description of eleven grey rectangles.
 */
export function CardBuilding() {
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

      <div
        role="status"
        aria-live="polite"
        className="absolute inset-x-0 bottom-4 text-center text-[11px]"
        style={{ color: 'var(--color-muted)' }}
      >
        Building your card…
      </div>
    </div>
  )
}
