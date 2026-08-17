import type { ShareCardView } from '@/lib/share-card/format'
import { SHARE_PALETTE as P } from '@/lib/share-card/palette'
import { GRAIN_DATA_URI, GRAIN_TILE_PX } from '@/lib/share-card/grain'
import { FONT_DISPLAY, FONT_MONO } from '@/lib/share-card/fonts'
import { cardArt } from '@/lib/share-card/art-file'
import { artField } from '@/lib/share-card/art'
import { numeralPath, DIGIT_UPEM } from '@/lib/share-card/digits'

/**
 * The share card.
 *
 * ── What it is ─────────────────────────────────────────────────────────────
 * A poster, not a UI component. The previous version was a rounded card with
 * glass panels and a filled accent pill — it read as an app screen photographed,
 * which is exactly what it was. This is built to `docs/SHARE_CARD_BRIEF`: full
 * bleed photography, a hard type hierarchy, hairlines rather than containers,
 * and the score bleeding off the left edge as the signature.
 *
 * ── Instagram's chrome is a hard constraint ────────────────────────────────
 * Text lives strictly between y=250 and y=1620. Above that is the profile
 * header, below it the reply bar and the link sticker. The previous card put its
 * masthead at y≈72 and its footer at y≈1800 — both were being covered on the
 * version that shipped, and nothing about the render revealed it. Imagery may
 * bleed under both bands; type may not.
 *
 * ── Satori ──────────────────────────────────────────────────────────────────
 * Rasterised by `next/og`, so: flexbox and absolute positioning only, no CSS
 * variables, no grid, no class names, every value a fixed pixel literal. Four
 * behaviours learned by rendering rather than reading:
 *
 *   • Any element with more than one child needs an explicit `display: 'flex'`.
 *   • A numeric JSX child makes it miscount that parent's children — every text
 *     child here is a string.
 *   • Fragments are laid out as a row container rather than flattened.
 *   • `border-style: dotted` is rejected outright, so the spec leaders are a
 *     repeating gradient. Same line, and it renders.
 */

/**
 * ── One poster, four canvases ───────────────────────────────────────────────
 * The brief specifies the story frame down to the pixel, and the first build
 * took it literally: every value a constant, `W = 1080`, `H = 1920`. The square
 * and the link preview then rendered as the top-left corner of a story card,
 * with the headline below the bottom edge — a real regression, and one only a
 * render of all four formats showed.
 *
 * So the numbers are a table rather than constants. The story figures are the
 * brief's, unchanged; the others are the same composition re-proportioned. What
 * moves between them is only geometry — the type scale, the hierarchy and the
 * order are one design.
 */
interface Geometry {
  w: number
  h: number
  margin: number
  /** Where type may start. Instagram's profile chrome on the story frames. */
  safeTop: number
  /** Where type must end. The reply bar and the link sticker. */
  safeBottom: number
  /** How far the picture bleeds down the card. */
  artH: number
  headlineMax: number
  headlineMin: number
  /** The outlined numeral. Absent where the card is too small to carry it. */
  score: { size: number; left: number; top: number } | null
  cropMarks: boolean
  specName: number
  rowPad: number
  /** Room the headline has, before the optical hang buys eight pixels back. */
  headlineRoom: number
}

function geometry(format: string): Geometry {
  switch (format) {
    /** The feed post. No platform chrome, so the margins are the safe zone. */
    case 'square':
      return {
        w: 1080, h: 1080, margin: 76, safeTop: 76, safeBottom: 1004, artH: 640,
        headlineMax: 124, headlineMin: 68,
        score: { size: 268, left: -24, top: 176 },
        cropMarks: true, specName: 40, rowPad: 13, headlineRoom: 1080 - 76 * 2,
      }

    /**
     * The link unfurl. Usually painted under 400px wide in a chat client, so
     * the score comes off — at that size an outlined numeral is grey noise —
     * and the picture becomes a ground rather than a band.
     */
    case 'og':
      return {
        w: 1200, h: 630, margin: 56, safeTop: 56, safeBottom: 574, artH: 630,
        headlineMax: 86, headlineMin: 48,
        score: null,
        cropMarks: false, specName: 30, rowPad: 8, headlineRoom: 760,
      }

    /** The story frame, and the competition card on it. The brief's numbers. */
    default:
      return {
        w: 1080, h: 1920, margin: 84, safeTop: 250, safeBottom: 1620, artH: 1210,
        headlineMax: 172, headlineMin: 92,
        score: { size: 430, left: -38, top: 352 },
        cropMarks: true, specName: 52, rowPad: 19, headlineRoom: 1080 - 84 * 2,
      }
  }
}

const display = (size: number, weight: 400 | 600 | 800, color: string, tracking = -0.022) => ({
  fontFamily: FONT_DISPLAY,
  fontSize: size,
  fontWeight: weight,
  letterSpacing: `${tracking}em`,
  color,
})

const mono = (size: number, weight: 400 | 500 | 600, color: string, tracking: number) => ({
  fontFamily: FONT_MONO,
  fontSize: size,
  fontWeight: weight,
  letterSpacing: `${tracking}em`,
  color,
})

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const RULE = withAlpha(P.ink1, 0.2)
const MUTED = withAlpha(P.ink1, 0.44)

/**
 * The headline, broken and sized to fit.
 *
 * Two problems, one function. Splitting on the first space put "UNCOMPROMISING
 * FOUNDATIONS" on a 14-character first line, and 172px of Big Shoulders 800 ran
 * a clean 160px off the right edge — silently, because Satori does not wrap a
 * `nowrap` line and does not complain about one it has overflowed.
 *
 * So the break is chosen to balance the two lines rather than to fall after the
 * first word, and the size is then computed from the wider of them. Widths come
 * from a per-character estimate rather than real metrics: Satori has no measuring
 * pass to borrow, and a table accurate to a few percent is enough when the result
 * is clamped anyway. `I`, `1` and the like are half the width of everything else
 * in a condensed face, which is most of the error a flat average would make.
 */
const NARROW = new Set(['I', 'J', 'L', '1', 'İ', '.', ',', ':', ';', "'", '!', '|', ' ', '-'])
const WIDE = new Set(['M', 'W', 'Q', '@', '&'])

function widthEm(text: string): number {
  let em = 0
  for (const ch of text.toUpperCase()) {
    em += NARROW.has(ch) ? 0.24 : WIDE.has(ch) ? 0.58 : 0.46
  }
  return em
}

function fitHeadline(name: string, g: Geometry): { line1: string; line2: string; size: number } {
  const words = name.trim().split(/\s+/).filter(Boolean)
  let best = { line1: name.trim(), line2: '', widest: widthEm(name) }

  for (let cut = 1; cut < words.length; cut += 1) {
    const line1 = words.slice(0, cut).join(' ')
    const line2 = words.slice(cut).join(' ')
    const widest = Math.max(widthEm(line1), widthEm(line2))
    // Strictly better only: ties keep the earlier break, which puts the short
    // punchy line on top — "IRON" over "FOUNDATIONS", not the other way round.
    if (widest < best.widest) best = { line1, line2, widest }
  }

  const room = g.headlineRoom + 8 // the -8 optical hang buys eight pixels back
  const size = Math.max(g.headlineMin, Math.min(g.headlineMax, Math.floor(room / best.widest)))
  return { line1: best.line1, line2: best.line2, size }
}

/** The bolt, at rail size. */
function Bolt({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M14 2 L6.5 13.4 H11 L9.5 22 L17.5 10.6 H13 Z" fill={color} />
    </svg>
  )
}

const SPINE = 'CHARGE INDEX'

/** The hairline box holding the handle and the route back. */
const HANDLE_BOX_W = 232

/**
 * The prize line, split so the money can be cyan.
 *
 * "Win £200 of supplements" is typed by the founder in Founders Hub, so the
 * amount is not a field the renderer can colour on its own — it has to be found
 * in the sentence. Anything currency-shaped counts: £200, $50, £1,000, 200 free
 * products would not.
 */
function moneySplit(text: string): Array<{ text: string; money: boolean }> {
  const parts: Array<{ text: string; money: boolean }> = []
  const pattern = /[£$€]\s?[\d][\d,.]*[kK]?/g
  let at = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > at) parts.push({ text: text.slice(at, start), money: false })
    parts.push({ text: match[0], money: true })
    at = start + match[0].length
  }
  if (at < text.length) parts.push({ text: text.slice(at), money: false })
  if (parts.length === 0) return [{ text, money: false }]
  // Each part is its own flex child, and flex trims the whitespace at a child's
  // edges — which closed the sentence up to "WIN£200OF SUPPLEMENTS". The spaces
  // either side of the amount are load-bearing, so they are made non-breaking.
  return parts.map((part) => ({ ...part, text: part.text.replace(/^ | $/g, ' ') }))
}

/** The prize headline, sized to the room the handle box leaves it. */
const PRIZE_MAX = 88
const PRIZE_MIN = 44

function fitPrize(text: string, g: Geometry): number {
  const room = g.w - g.margin * 2 - HANDLE_BOX_W - 26 + 5
  return Math.max(PRIZE_MIN, Math.min(PRIZE_MAX, Math.floor(room / widthEm(text))))
}

/**
 * The score, outlined, bleeding off the left edge.
 *
 * Drawn from glyph outlines rather than set as type: Satori renders
 * `-webkit-text-stroke` as a fill with no stroke, and rejects SVG `<text>`
 * outright. Both were tested. Paths were the alternative to putting a headless
 * browser in the render path for one piece of type — see `digits.ts`.
 */
function ScoreMark({ score, at }: { score: number; at: NonNullable<Geometry['score']> }) {
  const { glyphs, width } = numeralPath(String(score))
  const scale = at.size / DIGIT_UPEM
  // Big Shoulders' cap height sits around 0.72em; the glyphs are y-up in font
  // units, so they are flipped and dropped onto a baseline here.
  const boxW = Math.round(width * scale)
  const boxH = Math.round(at.size * 1.02)
  const spineSize = Math.max(13, Math.round(at.size * 0.044))
  const spineStep = Math.round(spineSize * 1.05)

  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        left: at.left,
        top: at.top,
        alignItems: 'flex-start',
      }}
    >
      <svg width={boxW} height={boxH} viewBox={`0 0 ${width} ${DIGIT_UPEM * 1.02}`}>
        <g transform={`translate(0, ${DIGIT_UPEM * 0.98}) scale(1, -1)`}>
          {glyphs.map((g, i) => (
            <g key={i} transform={`translate(${g.x}, 0)`}>
              <path
                d={g.d}
                fill="none"
                stroke={withAlpha(P.ink1, 0.34)}
                strokeWidth={2 / scale}
              />
            </g>
          ))}
        </g>
      </svg>
      <div
        style={{
          display: 'flex',
          ...mono(spineSize, 600, P.accent, 0.34),
          // Set upright and read top-to-bottom, the way a spine label is.
          // Satori has no `writing-mode`, so the characters are stacked instead —
          // which reads the same at this size and needs no transform.
          flexDirection: 'column',
          marginTop: 22,
          marginLeft: 18,
          // Both the column and each cell carry an explicit height: left to
          // compute its own, Satori sized the column to about half the string
          // and cut "CHARGE INDEX" off after the E.
          height: SPINE.length * spineStep,
        }}
      >
        {SPINE.split('').map((c, i) => (
          <div
            key={i}
            style={{ display: 'flex', height: spineStep, lineHeight: `${spineStep}px` }}
          >
            {c === ' ' ? ' ' : c}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * One row of the spec table: index, name, leader, quantity.
 *
 * Aligned on centres, not baselines. `align-items: baseline` is the right answer
 * typographically and the wrong one here — Satori resolved it against the
 * display face's full line box, which dropped the mono quantity most of a line
 * below the product name it belongs to. Explicit line heights on both sides make
 * centring land on the same optical line that baseline alignment was meant to.
 */
function SpecRow({ index, name, qty, last, pad, size }: {
  index: string; name: string; qty: string; last: boolean; pad: number; size: number
}) {
  const NAME_SIZE = size
  const monoSize = Math.max(12, Math.round(size * 0.36))
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        paddingTop: pad,
        paddingBottom: pad,
        borderBottom: `${last ? 1.5 : 1}px solid ${last ? RULE : withAlpha(P.ink1, 0.1)}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          width: Math.round(size * 0.73),
          flexShrink: 0,
          ...mono(monoSize - 1, 600, P.accent, 0.12),
          lineHeight: `${NAME_SIZE}px`,
        }}
      >
        {index}
      </div>
      <div
        style={{
          display: 'flex',
          ...display(NAME_SIZE, 600, P.ink1, -0.01),
          lineHeight: `${NAME_SIZE}px`,
          textTransform: 'uppercase',
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </div>
      {/* A dotted leader. `border-style: dotted` is rejected by Satori, so this
          is a repeating gradient — same line, and it renders. */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          height: 1,
          minWidth: 24,
          marginLeft: 20,
          marginRight: 20,
          backgroundImage: `repeating-linear-gradient(90deg, ${withAlpha(P.ink1, 0.22)} 0 2px, transparent 2px 7px)`,
        }}
      />
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          ...mono(monoSize, 500, MUTED, 0.1),
          lineHeight: `${NAME_SIZE}px`,
        }}
      >
        {qty}
      </div>
    </div>
  )
}

/**
 * The picture, when there is no picture.
 *
 * Layered gradients standing in for the photography that has not been shot. Each
 * layer is its own div because Satori takes one `background-image` per element
 * reliably and a comma-separated list less so. See `art.ts` for why this beats a
 * product render.
 */
function ArtField({ artKey, g }: { artKey: string | undefined; g: Geometry }) {
  const field = artField(artKey as never)
  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        top: 0,
        left: 0,
        width: g.w,
        height: g.artH,
        backgroundImage: field.base,
      }}
    >
      {field.layers.map((layer, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            width: g.w,
            height: g.artH,
            backgroundImage: layer.image,
            opacity: layer.opacity ?? 1,
          }}
        />
      ))}
    </div>
  )
}

export function ShareCard({ view }: { view: ShareCardView }) {
  const g = geometry(view.format)
  const art = cardArt(view.artKey, view.heroImage)
  const entry = view.entry
  const { line1, line2, size: headline } = fitHeadline(view.stackName, g)
  // Six rows and a prize block will not both fit above the safe line at full
  // row padding, so the table tightens rather than the body growing under the
  // profile header. The designed rhythm is the geometry's; two thirds is the
  // floor.
  const crowded = view.specRows.length + (entry ? 1 : 0) >= 6
  const rowPad = crowded ? Math.round(g.rowPad * 0.63) : g.rowPad
  const prizeSize = entry ? fitPrize(entry.prize, g) : PRIZE_MAX
  const railSize = Math.max(13, Math.round(g.w * 0.0176))

  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: g.w,
        height: g.h,
        background: P.groundBase,
        overflow: 'hidden',
        fontFamily: FONT_DISPLAY,
      }}
    >
      {/* ── Art: full bleed, hard crop, no radius ─────────────────────────── */}
      {art ? (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            width: g.w,
            height: g.artH,
            overflow: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art}
            alt=""
            width={g.w}
            height={g.artH}
            style={{ objectFit: 'cover', objectPosition: 'center top' }}
          />
        </div>
      ) : (
        <ArtField artKey={view.artKey} g={g} />
      )}
      {/* The scrim. Holds the header rail at the top and hands the photo to the
          ink at the bottom, so the body block can break the seam. */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0, left: 0, width: g.w, height: g.artH,
          backgroundImage: `linear-gradient(to bottom, ${withAlpha(P.groundBase, 0.55)} 0%, transparent 22%, transparent 62%, ${withAlpha(P.groundBase, 0.88)} 100%)`,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: g.artH - 2, left: 0, width: g.w, height: g.h - g.artH + 2,
          background: P.groundBase,
        }}
      />

      {/* ── Crop marks: honest to the report conceit ──────────────────────── */}
      {(g.cropMarks ? [
        { top: 44, left: 44, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
        { top: 44, right: 44, borderTopWidth: 1.5, borderRightWidth: 1.5 },
        { bottom: 44, left: 44, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
        { bottom: 44, right: 44, borderBottomWidth: 1.5, borderRightWidth: 1.5 },
      ] : []).map((pos, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            width: 34,
            height: 34,
            borderStyle: 'solid',
            borderColor: withAlpha(P.ink1, 0.34),
            borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
            ...pos,
          }}
        />
      ))}

      {/* ── Header rail ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: g.safeTop + 2,
          left: g.margin,
          width: g.w - g.margin * 2,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <Bolt size={railSize + 2} color={P.accent} />
          <div style={mono(railSize, 600, P.ink1, 0.3)}>GETCHRGD</div>
        </div>
        <div style={mono(railSize, 600, MUTED, 0.3)}>{view.stamp}</div>
      </div>

      {view.fit && g.score ? <ScoreMark score={view.fit.score} at={g.score} /> : null}

      {/* ── Body: anchored to the bottom so the headline breaks the seam ──── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: g.margin,
          width: g.headlineRoom,
          bottom: g.h - g.safeBottom,
        }}
      >
        <div style={{ display: 'flex', ...mono(railSize + 1, 600, P.accent, 0.3), marginBottom: 14 }}>
          {view.kicker}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: -8 }}>
          <div
            style={{
              display: 'flex',
              ...display(headline, 800, P.ink1),
              lineHeight: 0.79,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {line1}
          </div>
          {line2 ? (
            <div
              style={{
                display: 'flex',
                ...display(headline, 400, withAlpha(P.ink1, 0.62)),
                lineHeight: 0.79,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              {line2}
            </div>
          ) : null}
        </div>

        {/* ── Spec table, not cards ───────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: Math.round(g.specName * 0.85),
            borderTop: `1.5px solid ${RULE}`,
          }}
        >
          {view.specRows.map((row, i) => (
            <SpecRow
              key={`${i}-${row.name}`}
              index={String(i + 1).padStart(2, '0')}
              name={row.name}
              qty={row.qty}
              last={i === view.specRows.length - 1}
              pad={rowPad}
              size={g.specName}
            />
          ))}
        </div>

        {/* ── Prize: a rule and a line of type. No pill, no fill. ─────────── */}
        {entry ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 46 }}>
            <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', ...mono(railSize, 600, P.accent, 0.28), marginBottom: 9 }}>
                {entry.test ? 'TEST — NOT A LIVE PROMOTION' : 'SHARE THIS + FOLLOW TO ENTER'}
              </div>
              <div
                style={{
                  display: 'flex',
                  ...display(prizeSize, 800, P.ink1),
                  lineHeight: 0.83,
                  textTransform: 'uppercase',
                  marginLeft: -5,
                  whiteSpace: 'nowrap',
                }}
              >
                {/* The money in cyan, per the brief. Split rather than
                    interpolated: Satori miscounts a parent's children when one of
                    them is a number, and "£200" arrives from campaign config as
                    part of a sentence the founder types. */}
                {moneySplit(entry.prize).map((part, i) => (
                  <div key={i} style={{ display: 'flex', color: part.money ? P.accent : P.ink1 }}>
                    {part.text}
                  </div>
                ))}
              </div>
            </div>
            {/* The route back, in the hairline box. Not a QR: on a story the
                viewer is holding the phone the code is displayed on, so a handle
                they can remember for two seconds beats a code they cannot scan. */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                flexShrink: 0,
                width: HANDLE_BOX_W,
                marginLeft: 26,
                padding: '13px 18px',
                border: `1.5px solid ${RULE}`,
              }}
            >
              <div style={{ ...mono(20, 600, P.ink1, 0.04), lineHeight: '26px' }}>{entry.handle}</div>
              <div style={{ ...mono(13, 400, MUTED, 0.06), lineHeight: '20px' }}>{entry.route}</div>
            </div>
          </div>
        ) : null}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 26,
            paddingTop: 17,
            borderTop: `1px solid ${withAlpha(P.ink1, 0.13)}`,
          }}
        >
          <div style={mono(railSize - 2, 400, withAlpha(P.ink1, 0.34), 0.16)}>{view.footer}</div>
          <div style={mono(railSize - 2, 400, withAlpha(P.ink1, 0.34), 0.16)}>{view.footNote}</div>
        </div>
      </div>

      {/* ── Grain, over everything ────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0, left: 0, width: g.w, height: g.h,
          backgroundImage: `url(${GRAIN_DATA_URI})`,
          backgroundRepeat: 'repeat',
          backgroundSize: `${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px`,
          opacity: 0.07,
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  )
}
