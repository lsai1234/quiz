import { FONT_DISPLAY } from '@/lib/share-card/fonts'
import { SHARE_PALETTE as P } from '@/lib/share-card/palette'
import { patternWords, type DayShare, type DotsShare, type StartShare, type StoryShare } from '@/lib/share-card/story'
import { arcPath, curveOnRing, pointAt } from '@/lib/consult/day-ring'
import { STORY_CARD_COPY as C } from '@/lib/consult/story-copy'
import type { PatternId } from '@/lib/consult/pinpoint/types'
import { Bolt, CropMarks, Grain, display, mono, withAlpha } from './card-kit'

/**
 * A card from the read's story as a 1080×1920 image (plan Phase 8), drawn by
 * the share card's renderer (Satori) in the share card's two faces, ink and
 * grain. What it shows is only what the payload carries (`share-card/story.ts`):
 * shapes and numbers, a pattern's own name and line, product names. Nothing
 * about the person's answers.
 *
 * Type stays inside y 250–1620, clear of Instagram's own controls, as the
 * stack card's does.
 */

export const STORY_W = 1080
export const STORY_H = 1920
export const STORY_SAFE_TOP = 250
export const STORY_SAFE_BOTTOM = 1620
const M = 96

/** Rows on "Where I'm starting" before the rest are a count. */
const START_ROWS = 5

const SWATCH = { sleep: P.toneInfo, cup: P.ink1, train: P.tonePositive, daylight: P.toneAttention, energy: P.accent } as const

export function StoryShareCard({ share }: { share: StoryShare }) {
  return (
    <div style={{ display: 'flex', position: 'relative', width: STORY_W, height: STORY_H, background: P.groundBase, overflow: 'hidden', fontFamily: FONT_DISPLAY }}>
      {/* The ground: the consult's accent bloom from the top. */}
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: STORY_W, height: STORY_H, backgroundImage: `radial-gradient(95% 45% at 40% 10%, ${withAlpha(P.bloomAccent, 0.2)} 0%, ${withAlpha(P.bloomAccent, 0)} 70%)` }} />
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: STORY_W, height: STORY_H, backgroundImage: `radial-gradient(80% 40% at 85% 92%, ${withAlpha(P.bloomViolet, 0.14)} 0%, ${withAlpha(P.bloomViolet, 0)} 70%)` }} />
      <CropMarks w={STORY_W} h={STORY_H} />

      {/* Header rail. */}
      <div style={{ display: 'flex', position: 'absolute', top: STORY_SAFE_TOP, left: M, width: STORY_W - M * 2, alignItems: 'center', gap: 14 }}>
        <Bolt size={34} color={P.accent} />
        <div style={mono(28, 600, P.ink1, 0.3)}>{C.eyebrow.toUpperCase()}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: STORY_SAFE_TOP + 110, left: M, width: STORY_W - M * 2, bottom: STORY_H - STORY_SAFE_BOTTOM + 90 }}>
        {share.card === 'day' && <Day share={share} />}
        {share.card === 'spotted' && <Spotted pattern={share.pattern} />}
        {share.card === 'dots' && <Dots share={share} />}
        {share.card === 'start' && <Start share={share} />}
      </div>

      {/* Where to find it: our name, nothing about them. */}
      <div style={{ display: 'flex', position: 'absolute', top: STORY_SAFE_BOTTOM - 46, left: M, width: STORY_W - M * 2, ...mono(26, 500, P.ink2, 0.12) }}>{C.footer}</div>
      <Grain w={STORY_W} h={STORY_H} />
    </div>
  )
}

function Title({ children }: { children: string }) {
  // Two lines at most: the longer titles a size down.
  return <div style={{ display: 'flex', ...display(children.length > 12 ? 120 : 150, 800, P.ink1, -0.01), textTransform: 'uppercase', lineHeight: 0.92 }}>{children}</div>
}

/* ── Your day: the ring's shape, no times, no words ──────────────────────── */

function Day({ share }: { share: DayShare }) {
  const R = 44
  const size = 760
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 56 }}>
      <Title>{C.day}</Title>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={R} fill="none" stroke={P.edgeStrong} strokeWidth="1" />
          {[0, 6, 12, 18].map((h) => {
            const a = pointAt(h * 60, R - 3)
            const b = pointAt(h * 60, R + 3)
            return <line key={h} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={P.ink3} strokeWidth="1" strokeLinecap="round" />
          })}
          {share.daylight !== null && <path d={arcPath(10 * 60, 16 * 60, R)} fill="none" stroke={SWATCH.daylight} strokeOpacity={0.2 + share.daylight * 0.6} strokeWidth="9" strokeLinecap="round" />}
          {share.sleep && <path d={arcPath(share.sleep[0], share.sleep[1], R)} fill="none" stroke={SWATCH.sleep} strokeWidth="5" strokeLinecap="round" />}
          {share.energy && 'points' in share.energy && <path d={curveOnRing(share.energy.points)} fill="none" stroke={SWATCH.energy} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
          {share.energy && 'level' in share.energy && <path d={arcPath(13 * 60, 17 * 60, 36)} fill="none" stroke={SWATCH.energy} strokeWidth={2 + share.energy.level * 0.5} strokeLinecap="round" />}
          {share.cup && 'at' in share.cup && <circle cx={pointAt(share.cup.at, R).x} cy={pointAt(share.cup.at, R).y} r="3.4" fill={SWATCH.cup} stroke={P.groundBase} strokeWidth="1.2" />}
          {share.cup &&
            'count' in share.cup &&
            Array.from({ length: Math.min(5, share.cup.count) }, (_, i) => <circle key={i} cx={50 + (i - (Math.min(5, (share.cup as { count: number }).count) - 1) / 2) * 5.5} cy="80" r="1.9" fill={SWATCH.cup} />)}
          {share.train && 'at' in share.train && (
            <path d={diamond(pointAt(share.train.at, R))} fill={SWATCH.train} stroke={P.groundBase} strokeWidth="1.2" />
          )}
          {share.train &&
            'days' in share.train &&
            Array.from({ length: 7 }, (_, i) => <circle key={i} cx={50 + (i - 3) * 5} cy="20" r="1.7" fill={i < (share.train as { days: number }).days ? SWATCH.train : P.edgeStrong} />)}
          {/* Amp, in the middle of it. */}
          <circle cx="50" cy="50" r="14" fill={withAlpha(P.accent, 0.14)} stroke={withAlpha(P.accent, 0.5)} strokeWidth="0.8" />
          <path d="M51.6 41 L45.6 50.3 H49.2 L48 57 L54.4 47.8 H50.8 Z" fill={P.accent} />
        </svg>
      </div>
    </div>
  )
}

const diamond = ({ x, y }: { x: number; y: number }) => `M${x} ${y - 4}L${x + 4} ${y}L${x} ${y + 4}L${x - 4} ${y}Z`

/* ── What Amp spotted: the pattern's own name and line ──────────────────── */

function Spotted({ pattern }: { pattern: PatternId }) {
  const words = patternWords(pattern)
  if (!words) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40, marginTop: 260 }}>
      <div style={{ display: 'flex', ...mono(34, 600, P.accent, 0.24) }}>{C.spotted.toUpperCase()}</div>
      <div style={{ display: 'flex', ...display(words.name.length > 14 ? 150 : 190, 800, P.ink1, -0.01), textTransform: 'uppercase', lineHeight: 0.92 }}>{words.name}</div>
      <div style={{ display: 'flex', ...mono(40, 500, P.ink2, 0), lineHeight: 1.35 }}>{words.line}</div>
    </div>
  )
}

/* ── How Amp got there: the constellation, settled ─────────────────────── */

function Dots({ share }: { share: DotsShare }) {
  const W = STORY_W - M * 2
  const H = 520
  const rx = W / 2 - 120
  const ry = H / 2 - 50
  const cx = W / 2
  const cy = H / 2
  const named = share.named.map((id) => patternWords(id)?.name).filter((n): n is string => Boolean(n))
  const at = (s: DotsShare['stars'][number]) => ({ x: cx + Math.cos(s.a) * rx * s.d, y: cy + Math.sin(s.a) * ry * s.d + (s.s === 'out' ? 30 : 0) })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <Title>{C.dots}</Title>
      <div style={{ display: 'flex', position: 'relative', width: W, height: H }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <circle cx={cx} cy={cy} r="44" fill={withAlpha(P.accent, 0.14)} stroke={withAlpha(P.accent, 0.5)} strokeWidth="2" />
          {share.stars.map((s, i) => {
            const p = at(s)
            const r = s.s === 'out' ? 7 : 9 + 22 * s.w
            const colour = s.s === 'yes' ? P.tonePositive : s.s === 'out' ? P.ink3 : P.accent
            return <circle key={i} cx={p.x} cy={p.y} r={r} fill={colour} fillOpacity={s.s === 'out' ? 0.3 : 0.45 + 0.55 * s.w} />
          })}
        </svg>
      </div>
      {named.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {named.map((n) => (
            <div key={n} style={{ display: 'flex', ...display(76, 800, P.tonePositive, 0), textTransform: 'uppercase', lineHeight: 0.95 }}>
              {n}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', ...mono(34, 600, P.ink2, 0.2) }}>{`${C.narrowing.toUpperCase()}: ${share.narrowing.join(' → ')}`}</div>
    </div>
  )
}

/* ── Where I'm starting: names only ────────────────────────────────────── */

function Start({ share }: { share: StartShare }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
      <Title>{C.start}</Title>
      {share.hero && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '34px 40px', borderRadius: P.radiusCard * 2, border: `3px solid ${withAlpha(P.accent, 0.5)}`, background: P.surface2 }}>
          <div style={{ display: 'flex', ...mono(28, 600, P.accent, 0.24) }}>{C.hero.toUpperCase()}</div>
          <div style={{ display: 'flex', ...display(80, 800, P.ink1, 0), textTransform: 'uppercase' }}>{share.hero}</div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, borderRadius: P.radiusCard * 2, border: `4px solid ${withAlpha(P.accent, 0.4)}` }}>
        {share.products.slice(0, START_ROWS).map((name) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '26px 30px', borderRadius: P.radiusRow * 2, background: withAlpha(P.accent, 0.12), border: `2px solid ${withAlpha(P.accent, 0.35)}` }}>
            <Bolt size={34} color={P.accent} />
            <div style={{ display: 'flex', ...mono(40, 600, P.ink1, 0) }}>{name}</div>
          </div>
        ))}
        {share.products.length > START_ROWS && <div style={{ display: 'flex', padding: '8px 30px', ...mono(32, 500, P.ink2, 0.1) }}>{`+${share.products.length - START_ROWS} more`}</div>}
      </div>
    </div>
  )
}
