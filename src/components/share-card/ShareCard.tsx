import type { ShareCardView } from '@/lib/share-card/format'
import { SHARE_PALETTE as P } from '@/lib/share-card/palette'
import { FONT_DISPLAY } from '@/lib/share-card/fonts'
import { cardArt } from '@/lib/share-card/art-file'
import { artField } from '@/lib/share-card/art'
import { numeralPath, DIGIT_UPEM } from '@/lib/share-card/digits'
import { scrimLayers, typeScrim, TYPE_SCRIM_RISE } from '@/lib/share-card/scrim'
import { Bolt, Grain, display, mono, widthEm, withAlpha } from './card-kit'
import { GiveawayCard } from './GiveawayCard'

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
 * ── One poster, three canvases ──────────────────────────────────────────────
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
  /**
   * The outlined numeral, with "CHARGE INDEX" stacked upright beside it.
   *
   * Null where the canvas is too small to carry a numeral at all.
   */
  score: { size: number; left: number; top: number } | null
  cropMarks: boolean
  specName: number
  rowPad: number
  /**
   * The utility tier: the rails, the standfirst, the doses.
   *
   * Stated per format rather than derived from the width, because the link
   * preview is the widest canvas and the one painted smallest.
   *
   * The brief put this tier at 17–20px, which is where it stayed until the card
   * was looked at on a phone: 19px on a 1080 canvas is about 6pt in the hand,
   * and everything at that tier — what the card is, the doses, how to enter —
   * was being scrolled past unread. Lifting it costs the 172:17 scale contrast
   * the brief asked for and buys a card people can actually read. 172:27 is
   * still a tenfold range.
   */
  mono: number
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
        score: { size: 240, left: -22, top: 150 },
        cropMarks: true, specName: 40, rowPad: 12, mono: 24,
        headlineRoom: 1080 - 76 * 2,
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
        cropMarks: false, specName: 30, rowPad: 8, mono: 20,
        headlineRoom: 760,
      }

    /**
     * The story frame. The brief's numbers.
     *
     * Also the entry format once its draw has closed: the giveaway card is a
     * template of its own (`GiveawayCard.tsx`), and without a live promotion
     * an entry card is simply the stack poster.
     */
    default:
      return {
        w: 1080, h: 1920, margin: 84, safeTop: 250, safeBottom: 1620, artH: 1210,
        headlineMax: 172, headlineMin: 92,
        score: { size: 430, left: -38, top: 300 },
        cropMarks: true, specName: 50, rowPad: 15, mono: 27,
        headlineRoom: 1080 - 84 * 2,
      }
  }
}

const RULE = withAlpha(P.ink1, 0.2)
const MUTED = withAlpha(P.ink1, 0.44)

/** The foot of the header rail, which is what the top of the scrim covers. */
const railFloor = (g: Geometry) => g.safeTop + Math.round(g.mono * 2.4)

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
 * from `widthEm`'s per-character estimate rather than real metrics.
 */

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

const SPINE = 'CHARGE INDEX'

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
            // Satori has no `writing-mode`, so the characters are stacked
            // instead — which reads the same at this size and needs no
            // transform.
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
              {c === '\u00a0' ? '\u00a0' : c}
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
  const monoSize = Math.max(14, Math.round(size * 0.45))
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
          width: Math.round(size * 0.82),
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

/**
 * `art` overrides the picture the card would resolve on its own.
 *
 * The routes pass the uploaded image through it — see `art-resolve.ts` — and
 * `/styleguide/share` and the render tests leave it off, which keeps them
 * working with no database. `null` is a real value here and means "draw the
 * gradient field"; only `undefined` falls through to the bundled art.
 */
export function ShareCard({ view, art: override }: { view: ShareCardView; art?: string | null }) {
  // A live draw makes the entry format the giveaway card: a different template,
  // not this poster with an advert bolted on.
  if (view.entry) return <GiveawayCard entry={view.entry} />

  const g = geometry(view.format)
  const art = override === undefined ? cardArt(view.artKey, view.heroImage) : override
  const { line1, line2, size: headline } = fitHeadline(view.stackName, g)
  const rowPad = g.rowPad
  const railSize = g.mono

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
      {/* ── The scrim ───────────────────────────────────────────────────────
          Four layers, each stating what it protects — the header rail, the
          picture's exposure, the type side, the seam. They live in `scrim.ts`
          because the Founders Hub upload slots draw the same gradients over the
          same crop, and a preview that has typed its own copy of them is a
          preview that quietly stops being one. */}
      {scrimLayers({ artH: g.artH, railFloor: railFloor(g) }).map((layer, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0, left: 0, width: g.w, height: g.artH,
            backgroundImage: layer,
          }}
        />
      ))}
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
        {/* The type block's own ground.
            Absolutely positioned inside the block, so it is sized by the block
            and no format has to state where its type starts. Full card width
            and run past the bottom edge, because
            the qty column and the footer reach further than this column does.
            First child, since Satori paints in tree order and has no z-index. */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            left: -g.margin,
            top: -TYPE_SCRIM_RISE,
            width: g.w,
            bottom: -(g.h - g.safeBottom),
            backgroundImage: typeScrim(),
          }}
        />

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

        {/* What this is, for somebody who has never heard of us. The stack
            name is the biggest thing on the card and means nothing to a
            stranger; this is the line that makes the rest of it legible. */}
        <div
          style={{
            display: 'flex',
            ...mono(railSize, 400, withAlpha(P.ink1, 0.72), 0.11),
            marginTop: Math.round(g.specName * 0.42),
          }}
        >
          {view.standfirst}
        </div>

        {/* ── Spec table, not cards ───────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: Math.round(g.specName * 0.5),
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

        {/*
          ── Where to go ───────────────────────────────────────────────────

          The card's entire job on somebody else's story is to send a stranger
          to the quiz, and the address used to be the quietest thing on it: 21px
          mono at 42% opacity, bottom-left of a rail, smaller and fainter than
          the serving counts. Somebody who liked the card had nowhere to go,
          which makes it a poster rather than an advert.

          It is now a band: what they get above, where to get it below, the
          domain in the accent at nearly three times the size it was. Centred,
          because it is addressed to the reader rather than being another field
          in the card's own table.
        */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 26,
            paddingTop: 20,
            paddingBottom: 4,
            borderTop: `1px solid ${withAlpha(P.ink1, 0.13)}`,
          }}
        >
          <div style={mono(railSize - 4, 500, withAlpha(P.ink1, 0.55), 0.2)}>{view.cta.label}</div>
          <div style={{ ...display(Math.round(railSize * 2.1), 800, P.accent, -0.01), marginTop: 8 }}>
            {view.cta.domain}
          </div>
        </div>

        {/* What is left of the old rail: dates and terms, which belong small. */}
        {view.footNote ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: 12,
            }}
          >
            <div style={mono(railSize - 5, 400, withAlpha(P.ink1, 0.38), 0.14)}>{view.footNote}</div>
          </div>
        ) : null}
      </div>

      <Grain w={g.w} h={g.h} />
    </div>
  )
}
