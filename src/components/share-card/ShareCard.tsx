import type { ShareCardView } from '@/lib/share-card/format'
import { SHARE_PALETTE as P, px, mix, FILL_ACCENT, headlineSize } from '@/lib/share-card/palette'
import { GRAIN_DATA_URI, GRAIN_TILE_PX } from '@/lib/share-card/grain'
import { FONT_DISPLAY, FONT_BODY } from '@/lib/share-card/fonts'

/**
 * The share card, drawn for Satori.
 *
 * ── This is not a React component in the usual sense ────────────────────────
 * It never mounts in a browser. `next/og` walks the returned tree with Satori
 * and rasterises it, which means most of what the rest of this codebase relies
 * on is unavailable: no `tokens.css`, no `color-mix()`, no `backdrop-filter`,
 * no CSS grid, no class names, no `@/components/system`. Every value arrives as
 * a literal from `palette.ts`, and layout is flexbox and absolute positioning
 * only.
 *
 * Three Satori behaviours that bite silently rather than throwing, all of which
 * this file was rewritten to fix after looking at the first render:
 *
 *   • Any element with more than one child needs an explicit `display: 'flex'`.
 *   • Two `flex: 1` siblings in a fixed-height column do not compete for space
 *     the way they would in a browser — they overlap. Anything whose height is
 *     its content sets `flexShrink: 0`, and exactly one region flexes.
 *   • Text needs an explicit `fontFamily` or it silently uses the fallback face.
 *
 * None of these produce an error, only a wrong-looking PNG — which is why the
 * decisions that *can* be asserted live in `format.ts` and are tested there, and
 * why the styleguide route renders every format at true size.
 *
 * ── The look is baked, not filtered ─────────────────────────────────────────
 * The app's ground is three blurred blooms drifting on long cycles. Satori has
 * no `filter: blur()`, so each bloom is a radial gradient that fades to
 * transparent — the gradient *is* the blur — frozen at one moment of the drift.
 * Glass surfaces are flat `rgba` at the value the browser composites to. Grain
 * is a tiled data URI. The specular band is a hairline plus a short gradient
 * that finishes exactly at the padding, which is the invariant the whole design
 * rests on (`DESIGN.md`).
 */

const hairline = Math.max(1, Math.round(px(1)))

const display = (size: number, weight: number = P.weightDisplay) => ({
  fontFamily: FONT_DISPLAY,
  fontSize: size,
  fontWeight: weight,
  letterSpacing: `${P.trackingDisplay}em`,
  lineHeight: P.leadingTight,
  color: P.ink1,
})

const body = (size: number, color: string = P.ink2, weight: number = P.weightBody) => ({
  fontFamily: FONT_BODY,
  fontSize: px(size),
  fontWeight: weight,
  lineHeight: P.leadingSnug,
  color,
})

const eyebrow = (color: string = P.accent, size: number = P.textMeta) => ({
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

/** A bloom: a radial gradient standing in for a blurred disc. */
function Bloom({ color, alpha, size, top, left }: {
  color: string; alpha: number; size: number; top: number; left: number
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: size,
        height: size,
        backgroundImage: `radial-gradient(circle at 50% 50%, ${withAlpha(color, alpha)} 0%, ${withAlpha(color, alpha * 0.5)} 35%, ${withAlpha(color, 0)} 68%)`,
      }}
    />
  )
}

/**
 * A raised surface.
 *
 * The specular band is the single detail that makes a plane read as a physical
 * sheet rather than a lighter rectangle: a bright hairline along the top edge
 * and a short gradient falling away beneath it, finishing exactly where the
 * padding ends. Text therefore begins on the plain surface, never inside the
 * highlight — which is what lets the ground run as strong as it does without
 * being paid for in legibility.
 */
function Surface({ children, pad = P.space4, radius = P.radiusRow }: {
  children: React.ReactNode
  pad?: number
  radius?: number
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        flexShrink: 0,
        background: P.surface1,
        border: `${hairline}px solid ${P.edge}`,
        borderRadius: px(radius),
        padding: px(pad),
      }}
    >
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: px(P.specularDepth),
          borderTopLeftRadius: px(radius),
          borderTopRightRadius: px(radius),
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,${P.specularStrength}) 0%, rgba(255,255,255,0) 100%)`,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: px(radius),
          right: px(radius),
          height: hairline,
          background: P.specularLine,
        }}
      />
      {children}
    </div>
  )
}

/**
 * Routine fit, as the arc gauge the reveal screen already uses.
 *
 * Echoes `ScoreRing` rather than `ChargeMeter` on purpose: this number is
 * introduced to the customer as a ring, and the card is the same number. The
 * glow is a second, wider, low-opacity arc rather than a `drop-shadow`, because
 * Satori's filter support does not extend to one.
 */
function FitRing({ score, label, compact }: { score: number; label: string; compact?: boolean }) {
  const size = px(compact ? 46 : 54)
  const stroke = px(4)
  const r = size / 2 - stroke * 1.6
  const circ = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circ
  const c = size / 2

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: px(P.space3), flexShrink: 0 }}>
      <div style={{ display: 'flex', position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(-90 ${c} ${c})`}>
            <circle cx={c} cy={c} r={r} fill="none" stroke={P.surface3} strokeWidth={stroke} />
            <circle
              cx={c} cy={c} r={r} fill="none"
              stroke={mix(P.accent, 'glow')} strokeWidth={stroke * 2.6}
              strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
            />
            <circle
              cx={c} cy={c} r={r} fill="none"
              stroke={P.accent} strokeWidth={stroke}
              strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
            />
          </g>
        </svg>
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0, left: 0, width: size, height: size,
            alignItems: 'center', justifyContent: 'center',
            ...display(px(P.textLead)),
          }}
        >
          {score}
        </div>
      </div>
      {/* No "out of 100" caption. A ring filled to 88 with the number in the
          middle is already reading as a percentage, and the second line cost
          ~35px of header — which was the whole margin the square card needed for
          its second product. */}
      <div style={{ display: 'flex' }}>
        <div style={eyebrow(P.ink2, P.textMicro)}>{label}</div>
      </div>
    </div>
  )
}

/**
 * A coverage bar.
 *
 * `targeted` is the whole reason this takes a flag rather than just a number.
 * `stackStatScore` gives every product a small baseline on every axis, so a goal
 * nothing in the stack addresses still scores around 31 — and a bar a third
 * full, captioned with a goal the customer asked for and did not get, reads as a
 * claim on a public card. Untargeted axes are drawn as faint context, which is
 * the idiom the product deck already uses.
 */
function CoverageBar({ label, score, targeted }: { label: string; score: number; targeted: boolean }) {
  const h = px(6)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: px(P.space2) }}>
      <div style={eyebrow(targeted ? P.ink2 : P.ink3, P.textMicro)}>{label}</div>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: h,
          borderRadius: h,
          background: P.surface3,
        }}
      >
        <div
          style={{
            display: 'flex',
            width: `${score}%`,
            height: h,
            borderRadius: h,
            ...(targeted ? { backgroundImage: FILL_ACCENT } : { background: mix(P.ink3, 'line') }),
          }}
        />
      </div>
    </div>
  )
}

function Chip({ children, tone = P.ink2, accent, size = P.textBody }: {
  children: React.ReactNode; tone?: string; accent?: boolean; size?: number
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        background: accent ? mix(P.accent, 'fill') : P.surface2,
        border: `${hairline}px solid ${accent ? mix(P.accent, 'line') : P.edge}`,
        borderRadius: px(P.radiusPill),
        padding: `${px(P.space2)}px ${px(P.space4)}px`,
        ...body(size, tone, P.weightStrong),
      }}
    >
      {children}
    </div>
  )
}

/** One product: what it is, and — where the format has room — why. */
function LineupRow({ slot, product, reason, showReason }: {
  slot: string; product: string; reason: string; showReason: boolean
}) {
  return (
    <Surface pad={P.space3}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={eyebrow(P.accent, P.textMicro)}>{slot}</div>
        <div style={body(P.textLead, P.ink1, P.weightStrong)}>{product}</div>
        {showReason ? <div style={body(P.textBodySm, P.ink3)}>{reason}</div> : null}
      </div>
    </Surface>
  )
}

function Footer({ view }: { view: ShareCardView }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        paddingTop: px(P.space4),
        borderTop: `${hairline}px solid ${P.edge}`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...display(px(P.textTitle)), letterSpacing: `${P.trackingTitle}em` }}>
          {view.footer}
        </div>
        <div style={body(P.textBodySm, P.ink3)}>Build yours in 90 seconds</div>
      </div>
      {view.code ? <Chip tone={P.accent} accent>{view.code}</Chip> : null}
    </div>
  )
}

export function ShareCard({ view }: { view: ShareCardView }) {
  const { spec } = view
  const pad = px(P.gutter + P.space3)
  const isOg = view.format === 'og'
  // The column the headline actually has, not the frame it sits in.
  const headlineWidth = (isOg ? spec.width * 0.44 : spec.width) - pad * 2

  const header = (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, gap: px(P.space3) }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={eyebrow()}>{view.eyebrow}</div>
        {view.tier ? <div style={eyebrow(P.ink3, P.textMicro)}>{view.tier}</div> : null}
      </div>

      <div style={{ display: 'flex', ...display(headlineSize(view.stackName, headlineWidth)) }}>
        {view.stackName}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: px(P.space5), flexWrap: 'wrap' }}>
        {view.archetype ? <Chip tone={P.accent} accent>{view.archetype}</Chip> : null}
        {view.fit ? <FitRing score={view.fit.score} label={view.fit.label} compact={isOg} /> : null}
      </div>

      {view.focusAreas.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: px(P.space3) }}>
          <div style={eyebrow(P.ink3, P.textMicro)}>Built for</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: px(P.space2) }}>
            {view.focusAreas.map((f) => (
              <Chip key={f.label} size={P.textBodySm}>{f.label}</Chip>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )

  // The lineup is the only region allowed to flex. Everything else is sized by
  // its content, so a long name or a fourth focus chip pushes rows out through
  // the overflow line rather than off the bottom edge.
  const lineup = (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: px(P.space3) }}>
      <div style={{ ...eyebrow(P.ink3, P.textMicro), flexShrink: 0 }}>
        {isOg ? 'In your stack' : 'The lineup'}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          gap: px(P.space2),
          // Satori does not clip an overflowing flex child — it draws it over
          // whatever comes next, so a lineup one row too long lands on top of
          // the coverage bars. `lineupRows` is set per format so this never
          // fires; it is here so that if it ever does, the failure is a cropped
          // row rather than two sections printed on each other.
          overflow: 'hidden',
        }}
      >
        {view.lineup.map((row) => (
          <LineupRow key={`${row.slot}-${row.product}`} {...row} showReason={spec.showReasons} />
        ))}
      </div>
      {/* Outside the clip on purpose. "+3 more" is the line that tells someone
          the stack is bigger than the card, so it is the last thing that should
          be lost to a tight frame — it was, on the square, until it moved here. */}
      {view.overflow > 0 ? (
        <div style={{ ...body(P.textBodySm, P.ink3), flexShrink: 0 }}>
          {`+${view.overflow} more in your stack`}
        </div>
      ) : null}
    </div>
  )

  const coverage = view.coverage.length > 0 ? (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, gap: px(P.space3) }}>
      <div style={eyebrow(P.ink3, P.textMicro)}>Coverage</div>
      <div style={{ display: 'flex', gap: px(P.space3) }}>
        {view.coverage.map((c) => (
          <CoverageBar key={c.label} label={c.label} score={c.score} targeted={c.targeted} />
        ))}
      </div>
    </div>
  ) : null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        width: spec.width,
        height: spec.height,
        background: P.groundBase,
      }}
    >
      {/* ── The ground ─────────────────────────────────────────────────────── */}
      <Bloom color={P.bloomAccent} alpha={P.bloom1Alpha} size={spec.width * 1.6} top={-spec.width * 0.62} left={-spec.width * 0.34} />
      <Bloom color={P.bloomViolet} alpha={P.bloom2Alpha} size={spec.width * 1.5} top={spec.height * 0.3} left={spec.width * 0.22} />
      <Bloom color={P.bloomTeal} alpha={P.bloom3Alpha} size={spec.width * 1.3} top={spec.height * 0.58} left={-spec.width * 0.5} />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0, left: 0, width: spec.width, height: spec.height,
          backgroundImage: `url(${GRAIN_DATA_URI})`,
          backgroundRepeat: 'repeat',
          backgroundSize: `${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px`,
          opacity: P.grainOpacity,
        }}
      />
      {/* Vignette. Gentle: strong enough to settle the corners, light enough to
          leave the blooms visible — they are what makes this read as CHRGD at
          thumbnail size, before a single word is legible. */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0, left: 0, width: spec.width, height: spec.height,
          backgroundImage: 'radial-gradient(130% 95% at 50% 30%, rgba(7,7,10,0) 45%, rgba(7,7,10,0.55) 100%)',
        }}
      />

      {/* ── The card ───────────────────────────────────────────────────────────
          One child, never a fragment. Satori does not flatten `<>…</>` the way
          React does — it lays the fragment out as a node of its own, with the
          default row direction, which silently turns a stacked card into two
          columns running off the edge. Each branch below therefore returns a
          single real element. */}
      <div
        style={{
          display: 'flex',
          position: 'relative',
          width: spec.width,
          height: spec.height,
          padding: pad,
        }}
      >
        {isOg ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              width: '100%',
              height: '100%',
              gap: px(P.space8),
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '44%',
                justifyContent: 'space-between',
              }}
            >
              {header}
              <Footer view={view} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>{lineup}</div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '100%',
              gap: px(P.space6),
            }}
          >
            {header}
            {lineup}
            {coverage}
            {spec.showFooter ? <Footer view={view} /> : null}
          </div>
        )}
      </div>
    </div>
  )
}
