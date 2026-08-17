import type { ShareCardView } from '@/lib/share-card/format'
import { SHARE_PALETTE as P, px, headlineSize } from '@/lib/share-card/palette'
import { GRAIN_DATA_URI, GRAIN_TILE_PX } from '@/lib/share-card/grain'
import { FONT_DISPLAY, FONT_BODY } from '@/lib/share-card/fonts'
import { cardArt } from '@/lib/share-card/art-file'

/**
 * The share card.
 *
 * ── What it is trying to be ─────────────────────────────────────────────────
 * An object, not a screenshot. The first version of this card was the results
 * page rendered at 1080px — translucent glass rows on a dark ground — and it
 * read exactly like what it was: a piece of an app, photographed. A card that
 * gets posted has to survive on its own, next to whatever else is in someone's
 * story, and that needs four things an app screen does not:
 *
 *   1. **A picture.** Roughly the top 40%. Nothing else buys attention at
 *      thumbnail size.
 *   2. **A hard split.** A solid light data panel under a dark image panel. Two
 *      planes of translucent grey on a dark ground is an interface; black type
 *      on a light panel is print.
 *   3. **Density.** Numbered lists in two columns, not a stack of identical
 *      cards. Ten data points where the old layout fitted four.
 *   4. **A signature.** The mark, the domain, and one enormous number.
 *
 * ── Satori ──────────────────────────────────────────────────────────────────
 * This never mounts in a browser. `next/og` walks the tree with Satori, so there
 * is no `tokens.css`, no `color-mix()`, no `backdrop-filter`, no grid and no
 * class names. Flexbox and absolute positioning only, every value a literal from
 * `palette.ts`. Three behaviours that fail silently rather than throwing, all
 * learned by rendering it:
 *
 *   • Any element with more than one child needs an explicit `display: 'flex'`.
 *   • A React fragment is laid out as a row container, not flattened — so every
 *     branch below returns one real element.
 *   • Two `flex: 1` siblings in a fixed-height column overlap rather than
 *     competing. Anything sized by its content sets `flexShrink: 0`.
 */

const hairline = Math.max(1, Math.round(px(1)))

const display = (size: number, color: string = P.ink1, weight: number = P.weightDisplay) => ({
  fontFamily: FONT_DISPLAY,
  fontSize: size,
  fontWeight: weight,
  letterSpacing: `${P.trackingDisplay}em`,
  lineHeight: P.leadingTight,
  color,
})

const body = (size: number, color: string = P.inkPrint, weight: number = P.weightBody) => ({
  fontFamily: FONT_BODY,
  fontSize: px(size),
  fontWeight: weight,
  lineHeight: P.leadingSnug,
  color,
})

const eyebrow = (color: string, size: number = P.textMeta) => ({
  fontFamily: FONT_DISPLAY,
  fontSize: px(size),
  fontWeight: P.weightStrong,
  letterSpacing: `${P.trackingEyebrow}em`,
  textTransform: 'uppercase' as const,
  color,
})

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * The CHRGD mark, as Satori can draw it.
 *
 * The same geometry as `@/components/brand/CHRGDLogo` — battery cell, two charge
 * bars, the bolt keylined off them — restated here because that component is a
 * browser component built on `currentColor` and CSS variables, and this renderer
 * resolves neither. The paths are the contract: if the master mark moves, both
 * move.
 */
function Mark({ size, tone, accent, keyline }: {
  size: number; tone: string; accent: string; keyline: string
}) {
  return (
    <svg width={size} height={Math.round(size * 1.15)} viewBox="0 0 100 115" fill="none">
      <rect x="37" y="0" width="26" height="12" rx="6" fill={tone} />
      <rect x="7" y="11" width="86" height="101" rx="30" fill="none" stroke={tone} strokeWidth="8" />
      <rect x="19" y="29" width="62" height="12" rx="4" fill={tone} />
      <rect x="19" y="49" width="62" height="12" rx="4" fill={tone} />
      <path
        d="M58 22L32 62H51L40 97L76 52H57L58 22Z"
        fill={accent} stroke={keyline} strokeWidth="4" strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The charge field — the card's graphic device.
 *
 * The layout reference for this card is Spotify Wrapped, whose device is an
 * op-art checkerboard. Borrowing that would make the card look like Spotify's
 * rather than ours, so this is the logo's own charge bars run as a field: hard
 * stripes in the accent, tightening as they rise.
 */
function ChargeField({ width, height }: { width: number; height: number }) {
  const bars = 18
  return (
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width, height }}>
      {Array.from({ length: bars }, (_, i) => {
        const t = i / (bars - 1)
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              position: 'absolute',
              left: 0,
              top: Math.round(height * (1 - Math.pow(1 - t, 1.6))) - 8,
              width,
              height: Math.max(3, Math.round(4 + t * 14)),
              background: withAlpha(P.accent, 0.14 + t * 0.30),
            }}
          />
        )
      })}
    </div>
  )
}

/**
 * The routine-fit score, ghosted over the charge field.
 *
 * The reference runs an enormous outlined "2025" up the side of its picture; this
 * is the equivalent, and the one figure on the card that is purely the
 * customer's. It was outlined in the first pass — `color: transparent` plus a
 * `-webkit-text-stroke` — and rendered as nothing at all, because Satori draws
 * the fill and skips the stroke. Filled at low alpha instead: legible, cheap,
 * and reading as texture rather than as a label. The copy of the number meant to
 * be *read* lives in the stat row.
 */
function FitGhost({ score, width, height }: { score: number; width: number; height: number }) {
  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        left: px(P.space3),
        top: Math.round(height * 0.26),
        width: Math.round(width * 0.5),
        ...display(Math.round(height * 0.5), withAlpha(P.accentBright, 0.32)),
      }}
    >
      {String(score)}
    </div>
  )
}

/** The picture, on the charge field, under the masthead. */
function ImagePanel({ view, width, height }: { view: ShareCardView; width: number; height: number }) {
  const art = cardArt(view.artKey, view.heroImage)
  // The masthead owns the top strip and everything else starts beneath it. In
  // the first pass the picture's keyline ran straight through the eyebrow.
  const mastheadH = px(P.space8)
  const artW = Math.round(width * 0.52)
  const artH = height - mastheadH

  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width,
        height,
        background: P.groundBase,
        overflow: 'hidden',
      }}
    >
      {/* The field stops where the picture starts. Run full width at the weight
          that made it visible, it stopped reading as a device and started
          reading as scanlines over the photograph. */}
      <ChargeField width={Math.round(width * 0.48)} height={height} />
      {view.fit ? <FitGhost score={view.fit.score} width={width} height={height} /> : null}

      {/* A bloom under the product, so it sits in light rather than on black. */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: 0,
          top: mastheadH,
          width: artW,
          height: artH,
          backgroundImage: `radial-gradient(circle at 50% 50%, ${withAlpha(P.accent, 0.30)} 0%, ${withAlpha(P.accent, 0)} 62%)`,
        }}
      />

      {/* No frame. The house renders are 2:3 and the panel is close to square,
          so a box around them letterboxed the product inside its own picture. */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: px(P.space2),
          top: mastheadH,
          width: artW,
          height: artH,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art} alt="" width={artW} height={artH} style={{ objectFit: 'contain' }} />
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: px(P.space5), top: px(P.space4) }}>
        <div style={eyebrow(P.accentBright, P.textMeta)}>{view.eyebrow}</div>
      </div>
    </div>
  )
}

/** The brand's bolt, at list size. */
function Bolt({ size, color }: { size: number; color: string }) {
  return (
    <svg width={Math.round(size * 0.62)} height={size} viewBox="30 20 48 79" fill="none">
      <path d="M58 22L32 62H51L40 97L76 52H57L58 22Z" fill={color} />
    </svg>
  )
}

/**
 * A list — the densest way to say "here is what you got".
 *
 * Two shapes, and the difference is not decoration. *Your stack* is numbered
 * because it has an order the engine chose. *Built for* is not a ranking, and
 * numbering it was the most literal thing borrowed from the reference: it made
 * three goals look like a chart position. It gets the brand's bolt instead,
 * which is ours and is honest about the list being a set rather than a countdown.
 *
 * Every item is pinned to one line. Left to wrap, a product name that just
 * reaches the column width takes a second line and pushes the rest of the list
 * out of step with the column beside it — which reads as a broken layout rather
 * than as a long name.
 */
function List({ title, items, max, width, marker }: {
  title: string; items: string[]; max: number; width: string; marker: 'number' | 'bolt'
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width, minWidth: 0, gap: px(P.space2) }}>
      <div style={eyebrow(P.inkPrint2, P.textMicro)}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.slice(0, max).map((item, i) => (
          <div key={`${i}-${item}`} style={{ display: 'flex', gap: px(P.space2), width: '100%' }}>
            {marker === 'number' ? (
              // `String(...)`, not `{i + 1}`. A numeric JSX child makes Satori
              // count the *parent* as having more than one child and throw
              // "Expected <div> to have explicit display: flex" — pointing at an
              // element that already has it. Every text child here is a string.
              <div style={{ ...body(P.textLead, P.inkPrint2, P.weightBody), flexShrink: 0 }}>
                {String(i + 1)}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: px(P.textLead) * P.leadingSnug,
                  flexShrink: 0,
                }}
              >
                <Bolt size={px(P.textBody)} color={P.accentDeep} />
              </div>
            )}
            <div
              style={{
                ...body(P.textLead, P.inkPrint, P.weightStrong),
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The callout band.
 *
 * The strip the card's other two jobs live in. An ordinary share has none; an
 * influencer's carries their code at a size somebody can read off a story
 * without pausing it, which is the entire reason they are posting. The
 * competition's entry band is the second kind, in Phase 5.
 *
 * It sits above the stats rather than in the footer because the footer is where
 * a caption goes, and a code in a caption is a code nobody types.
 */
function Callout({ callout }: { callout: NonNullable<ShareCardView['callout']> }) {
  if (callout.kind === 'code') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: P.inkPrint,
          borderRadius: px(P.radiusRow),
          padding: `${px(P.space3)}px ${px(P.space4)}px`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={eyebrow(withAlpha(P.surfacePrint, 0.62), P.textMicro)}>{callout.caption}</div>
          <div style={display(px(P.textDisplay), P.surfacePrint)}>{callout.code}</div>
        </div>
        <Bolt size={px(P.textDisplay)} color={P.accent} />
      </div>
    )
  }

  /**
   * The entry band.
   *
   * Everything on it is there because the CAP Code requires a significant
   * condition to appear on the promotion itself, not only behind a link: the
   * prize, what somebody has to do, the closing date, and where the full terms
   * are. It is the densest thing on the card for that reason — it is not
   * decoration, it is the part that makes the promotion legal to run.
   *
   * `test` prints across it during a rehearsal, so a card that escapes into a
   * story before the wording is signed off says what it is.
   */
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        background: P.inkPrint,
        borderRadius: px(P.radiusRow),
        padding: `${px(P.space3)}px ${px(P.space4)}px`,
        gap: px(P.space1),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={eyebrow(P.accent, P.textMicro)}>
          {callout.test ? 'Test — not a live promotion' : 'Win'}
        </div>
        <Bolt size={px(P.textLead)} color={P.accent} />
      </div>
      <div style={display(px(P.textTitle), P.surfacePrint)}>{callout.prize}</div>
      <div style={body(P.textBodySm, withAlpha(P.surfacePrint, 0.78))}>{callout.mechanic}</div>
      <div style={body(P.textMicro, withAlpha(P.surfacePrint, 0.55))}>
        {`${callout.closes} · ${callout.terms}`}
      </div>
    </div>
  )
}

/** A caption over an enormous figure — the reference's "42,279 / Minutes Listened". */
function Stat({ label, value, size }: { label: string; value: string; size: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: px(P.space1) }}>
      <div style={body(P.textBodySm, P.inkPrint2, P.weightBody)}>{label}</div>
      <div style={display(size, P.inkPrint)}>{value}</div>
    </div>
  )
}

function Footer({ view, markSize }: { view: ShareCardView; markSize: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: px(P.space2) }}>
        <Mark size={markSize} tone={P.inkPrint} accent={P.accentDeep} keyline={P.surfacePrint} />
        <div style={{ ...display(px(P.textTitle), P.inkPrint), letterSpacing: `${P.trackingTitle}em` }}>
          getCHRGD
        </div>
      </div>
      <div style={eyebrow(P.inkPrint, P.textMeta)}>{view.footer}</div>
    </div>
  )
}

/**
 * The advert, on the entry card.
 *
 * ── The thing this exists to solve ──────────────────────────────────────────
 * A story somebody reshares is a flat image. There is no link on it, no
 * swipe-up, no tappable sticker — the person who sees it has nothing to press.
 * So the route back to us has to be *printed*, large enough to read at a glance
 * and short enough to remember for the two seconds it takes to open the app:
 * a handle, and where the quiz is once you get there.
 *
 * Everything else here is the CAP Code's: the prize, the steps, the closing
 * date and where the full terms are, all on the promotion itself rather than
 * behind a link — because a reshared image cannot carry a link either.
 */
function EntryAdvert({ entry }: { entry: NonNullable<ShareCardView['entry']> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, gap: px(P.space3) }}>
      {entry.test ? (
        <div style={eyebrow(P.toneAttention, P.textMicro)}>Test — not a live promotion</div>
      ) : null}

      {/* The prize, as the loudest thing on the card after the stack name. */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={eyebrow(P.inkPrint2, P.textMicro)}>Win</div>
        <div style={display(px(P.textDisplay), P.inkPrint)}>{entry.prize}</div>
      </div>

      {/* Three steps, numbered. An advert that needs reading twice does not get
          entered, so this is a list rather than the prose the terms page uses. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: px(P.space2) }}>
        <div style={eyebrow(P.inkPrint2, P.textMicro)}>How to enter</div>
        {entry.steps.map((step, i) => (
          <div key={`${i}-${step}`} style={{ display: 'flex', gap: px(P.space2), alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: px(P.space6),
                height: px(P.space6),
                flexShrink: 0,
                borderRadius: px(P.radiusPill),
                background: P.inkPrint,
                ...body(P.textBodySm, P.surfacePrint, P.weightStrong),
              }}
            >
              {String(i + 1)}
            </div>
            <div
              style={{
                ...body(P.textBody, P.inkPrint, P.weightStrong),
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {step}
            </div>
          </div>
        ))}
      </div>

      {/* The route. The one element on this card that cannot be dropped: it is
          the only path from a reshared story back to the quiz. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: P.inkPrint,
          borderRadius: px(P.radiusRow),
          padding: `${px(P.space3)}px ${px(P.space4)}px`,
        }}
      >
        <div style={display(px(P.textTitle), P.surfacePrint)}>{entry.handle}</div>
        <div style={body(P.textBodySm, withAlpha(P.surfacePrint, 0.75))}>{entry.route}</div>
      </div>

      <div style={body(P.textMicro, P.inkPrint2)}>{`${entry.closes} · ${entry.terms}`}</div>
    </div>
  )
}

export function ShareCard({ view }: { view: ShareCardView }) {
  const { spec } = view
  const isOg = view.format === 'og'

  // A margin, so the card reads as an object sitting on the brand's ground
  // rather than as a full-bleed screen. The reference does the same.
  const margin = isOg ? 0 : px(P.space4)
  const cardW = spec.width - margin * 2
  const cardH = spec.height - margin * 2
  const imageH = Math.round(cardH * view.imageRatio)
  const pad = px(P.space6)

  const dataPanel = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        background: P.surfacePrint,
        padding: pad,
        gap: px(P.space4),
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: px(P.space1), flexShrink: 0 }}>
        <div style={display(headlineSize(view.stackName, cardW - pad * 2), P.inkPrint)}>
          {view.stackName}
        </div>
        {view.archetype ? (
          <div style={body(P.textLead, P.inkPrint2, P.weightBody)}>{view.archetype}</div>
        ) : null}
      </div>

      {/* On the entry card the stack is the hook, not the subject — one column,
          so the advert below it gets the room. */}
      {view.entry ? (
        <div style={{ display: 'flex', flexShrink: 0 }}>
          <List
            title="Your stack"
            items={view.lineup.map((r) => r.product)}
            max={spec.lineupRows}
            width="100%"
            marker="number"
          />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: px(P.space4), flexShrink: 0, overflow: 'hidden' }}>
          {/* Not 50/50: product names run half as long again as focus labels, and
              an even split is what put the longest of them on the edge of wrapping. */}
          <List
            title="Your stack"
            items={view.lineup.map((r) => r.product)}
            max={spec.lineupRows}
            width="52%"
            marker="number"
          />
          {view.builtFor.length > 0 ? (
            <List
              title="Built for"
              items={view.builtFor}
              max={spec.lineupRows}
              width="44%"
              marker="bolt"
            />
          ) : null}
        </div>
      )}

      {view.overflow > 0 ? (
        <div style={{ ...body(P.textBodySm, P.inkPrint2), flexShrink: 0 }}>
          {`+${view.overflow} more in your stack`}
        </div>
      ) : null}

      {/* The card's slack, in one place. Without it the lists stretched and the
          gap opened up between a list and its own overflow line.
          On the entry card it moves below the advert: the advert has to follow
          the stack closely, or the card reads as two unrelated posters. */}
      {view.entry ? null : <div style={{ display: 'flex', flex: 1, minHeight: 0 }} />}

      {view.callout ? <Callout callout={view.callout} /> : null}
      {view.entry ? <EntryAdvert entry={view.entry} /> : null}
      {view.entry ? <div style={{ display: 'flex', flex: 1, minHeight: 0 }} /> : null}

      <div style={{ display: 'flex', gap: px(P.space4), flexShrink: 0 }}>
        {view.stats.map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} size={px(P.textDisplay)} />
        ))}
      </div>

      <Footer view={view} markSize={px(P.textTitle)} />
    </div>
  )

  const ground = (
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: spec.width, height: spec.height }}>
      <div
        style={{
          display: 'flex', position: 'absolute', top: 0, left: 0, width: spec.width, height: spec.height,
          backgroundImage: `radial-gradient(circle at 12% 4%, ${withAlpha(P.bloomAccent, 0.55)} 0%, ${withAlpha(P.bloomAccent, 0)} 58%)`,
        }}
      />
      <div
        style={{
          display: 'flex', position: 'absolute', top: 0, left: 0, width: spec.width, height: spec.height,
          backgroundImage: `radial-gradient(circle at 92% 88%, ${withAlpha(P.bloomViolet, 0.45)} 0%, ${withAlpha(P.bloomViolet, 0)} 58%)`,
        }}
      />
      <div
        style={{
          display: 'flex', position: 'absolute', top: 0, left: 0, width: spec.width, height: spec.height,
          backgroundImage: `url(${GRAIN_DATA_URI})`,
          backgroundRepeat: 'repeat',
          backgroundSize: `${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px`,
          opacity: P.grainOpacity,
        }}
      />
    </div>
  )

  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: spec.width,
        height: spec.height,
        background: P.groundBase,
        padding: margin,
      }}
    >
      {ground}
      {isOg ? (
        <div style={{ display: 'flex', flexDirection: 'row', width: cardW, height: cardH, position: 'relative' }}>
          <div style={{ display: 'flex', width: Math.round(cardW * 0.36), height: cardH, flexShrink: 0 }}>
            <ImagePanel view={view} width={Math.round(cardW * 0.36)} height={cardH} />
          </div>
          <div style={{ display: 'flex', flex: 1, minWidth: 0, height: cardH }}>{dataPanel}</div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: cardW,
            height: cardH,
            position: 'relative',
            borderRadius: px(P.radiusSheet),
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', width: cardW, height: imageH, flexShrink: 0 }}>
            <ImagePanel view={view} width={cardW} height={imageH} />
          </div>
          {dataPanel}
        </div>
      )}
    </div>
  )
}
