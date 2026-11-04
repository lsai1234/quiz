/**
 * The stack guide, drawn: the image every order gets by email (one-off and
 * subscription), and the "Save the image" on the guide page.
 *
 * Rendered by Satori (`next/og`), so layout is flex only, every text node has a
 * width to wrap in, and the image's height is worked out from its content
 * (`guideImageHeight`) rather than fixed: a box of two and a box of eight both
 * end at their footer. The house share-card look (ground, blooms, the two
 * faces), because it is the same brand in the same hand.
 *
 * Words from `GUIDE_COPY` and `ROUTINE_COPY`; claims are the register's,
 * verbatim. This is a private document, sent to the person it is about: it is
 * never a share card, and nothing links it to one.
 */
import type { StackGuide } from '@/lib/guide/build'
import { longDate } from '@/lib/guide/build'
import { GUIDE_COPY } from '@/lib/guide/copy'
import { ROUTINE_COPY } from '@/lib/routine/copy'
import { ringArc, ringPoint, spokenClock } from '@/lib/routine/ring'
import { SHARE_PALETTE as P } from '@/lib/share-card/palette'
import { Bolt, display, mono, withAlpha } from '@/components/share-card/card-kit'
import { LEGAL_ENTITY } from '@/lib/legal/content'

export const GUIDE_W = 1080
const PAD = 72
const INNER = GUIDE_W - PAD * 2
const CARD_PAD = 36
const RING = 520

/* ── Height, from the content ────────────────────────────────────────────── */

/** Lines a string takes at a size and width. Mono is ~0.6em a character; the display face is condensed. */
function lines(text: string, size: number, width: number, face: 'mono' | 'display'): number {
  const perChar = face === 'mono' ? 0.6 : 0.43
  const perLine = Math.max(8, Math.floor(width / (size * perChar)))
  return text.split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0)
}
const tall = (text: string, size: number, width: number, face: 'mono' | 'display', lh: number) => lines(text, size, width, face) * size * lh

const CARD_INNER = INNER - CARD_PAD * 2

function whenLine(p: StackGuide['products'][number]): string {
  return [p.time, p.moment, p.daysLabel, p.amount].filter(Boolean).join(' · ').toUpperCase()
}

function productHeight(p: StackGuide['products'][number]): number {
  let h = CARD_PAD * 2
  h += tall(p.short, 60, CARD_INNER, 'display', 1.0) + 8
  if (p.type.toLowerCase() !== p.short.toLowerCase()) h += 34 + 20 // type
  h += tall(whenLine(p), 24, CARD_INNER, 'mono', 1.4) + 14
  if (p.serving) h += tall(`${GUIDE_COPY.eachServing}: ${p.serving}`.toUpperCase(), 21, CARD_INNER, 'mono', 1.4) + 14
  if (p.claims.length) {
    h += 34 // science label
    for (const c of p.claims) h += 18 + tall(`“${c.wording}”`, 27, CARD_INNER - 28, 'mono', 1.45) + tall(GUIDE_COPY.conditionOfUse(c.condition), 20, CARD_INNER - 28, 'mono', 1.4) + 30
  } else {
    h += tall(GUIDE_COPY.noClaim, 20, CARD_INNER, 'mono', 1.45) + 14
  }
  for (const w of p.warnings) h += tall(w, 19, CARD_INNER, 'mono', 1.45) + 6
  return h + 28
}

function momentHeight(m: StackGuide['routine']['moments'][number]): number {
  const names = m.items.map((i) => i.title).join(', ')
  return 30 + tall(names, 40, INNER - 84, 'display', 1.05) + 34
}

export function guideImageHeight(guide: StackGuide): number {
  const title = GUIDE_COPY.title(guide.firstName)
  let h = PAD + 44 + 56 // wordmark
  h += 34 + 14 // eyebrow
  h += tall(title, 112, INNER, 'display', 0.92) + 26
  h += tall(GUIDE_COPY.intro, 25, INNER, 'mono', 1.5) + 70
  h += 50 + RING + 40 // day heading + ring
  h += guide.routine.moments.reduce((n, m) => n + momentHeight(m), 0) + 30
  h += tall(ROUTINE_COPY.labelFirst, 20, INNER, 'mono', 1.45) + 70
  h += 50 + guide.products.reduce((n, p) => n + productHeight(p), 0)
  h += tall(GUIDE_COPY.scienceNote, 20, INNER, 'mono', 1.45) + 60
  if (guide.services.length) h += 50 + guide.services.reduce((n, s) => n + tall(s, 25, INNER - 50, 'mono', 1.45) + 14, 0) + 40
  h += 50 + tall(GUIDE_COPY.checkIn(longDate(guide.checkInOn)), 25, INNER, 'mono', 1.5) + 60
  h += 80 + PAD // footer
  return Math.ceil(h)
}

/* ── The drawing ─────────────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: string }) {
  return <div style={{ display: 'flex', ...mono(24, 600, P.bloomAccent, 0.16), textTransform: 'uppercase', marginBottom: 22 }}>{children}</div>
}

function DayRing({ guide }: { guide: StackGuide }) {
  const { day, moments } = guide.routine
  const timed = moments.filter((m) => m.minutes !== null)
  const R = 40
  const scale = RING / 100
  return (
    <div style={{ display: 'flex', position: 'relative', width: RING, height: RING, alignSelf: 'center', marginBottom: 40 }}>
      <svg width={RING} height={RING} viewBox="0 0 100 100" style={{ position: 'absolute', left: 0, top: 0 }}>
        <circle cx="50" cy="50" r={R} fill="none" stroke={withAlpha(P.bloomAccent, 0.32)} strokeWidth="7" />
        <path d={ringArc(day.bed, day.wake, R)} fill="none" stroke={withAlpha(P.groundBase, 0.7)} strokeWidth="7" />
        {[0, 6, 12, 18].map((h) => {
          const a = ringPoint(h * 60, R - 7.5)
          return <circle key={h} cx={a.x} cy={a.y} r="0.8" fill="rgba(255,255,255,0.4)" />
        })}
        {timed.map((m) => {
          const at = ringPoint(m.minutes!, R)
          return <circle key={`${m.minutes}${m.label}`} cx={at.x} cy={at.y} r="5.8" fill={P.bloomAccent} stroke={P.groundBase} strokeWidth="1.4" />
        })}
      </svg>
      {timed.map((m, i) => {
        const at = ringPoint(m.minutes!, R)
        return (
          <div
            key={`n${m.minutes}${m.label}`}
            style={{ position: 'absolute', left: at.x * scale - 30, top: at.y * scale - 30, width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', ...display(34, 800, P.groundBase, 0) }}
          >
            {String(i + 1)}
          </div>
        )
      })}
      <div style={{ position: 'absolute', left: 0, top: 0, width: RING, height: RING, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', ...display(64, 800, P.ink1, 0) }}>{spokenClock(day.wake)}</div>
        <div style={{ display: 'flex', ...mono(22, 500, P.ink3, 0.12), textTransform: 'uppercase', margin: '4px 0' }}>to</div>
        <div style={{ display: 'flex', ...display(64, 800, P.ink1, 0) }}>{spokenClock(day.bed)}</div>
      </div>
    </div>
  )
}

export function GuideImage({ guide }: { guide: StackGuide }) {
  const height = guideImageHeight(guide)
  const timed = guide.routine.moments.filter((m) => m.minutes !== null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', width: GUIDE_W, height, background: P.groundBase, padding: PAD, overflow: 'hidden' }}>
      {/* The ground: two blooms, as the cards have. */}
      <div style={{ position: 'absolute', left: -260, top: -260, width: 900, height: 900, borderRadius: 900, background: `radial-gradient(circle, ${withAlpha(P.bloomAccent, 0.2)}, ${withAlpha(P.bloomAccent, 0)} 70%)`, display: 'flex' }} />
      <div style={{ position: 'absolute', right: -300, top: 900, width: 900, height: 900, borderRadius: 900, background: `radial-gradient(circle, ${withAlpha(P.bloomViolet, 0.12)}, ${withAlpha(P.bloomViolet, 0)} 70%)`, display: 'flex' }} />

      {/* Wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 56 }}>
        <Bolt size={40} color={P.bloomAccent} />
        <div style={{ display: 'flex', ...display(40, 800, P.ink1, 0.02) }}>CHRGD</div>
      </div>

      <Eyebrow>{GUIDE_COPY.eyebrow}</Eyebrow>
      <div style={{ display: 'flex', width: INNER, ...display(112, 800, P.ink1, -0.01), lineHeight: 0.92, marginBottom: 26 }}>{GUIDE_COPY.title(guide.firstName)}</div>
      <div style={{ display: 'flex', width: INNER, ...mono(25, 400, P.ink2, 0), lineHeight: 1.5, marginBottom: 70 }}>{GUIDE_COPY.intro}</div>

      {/* Your day */}
      <Eyebrow>{GUIDE_COPY.routineHeading}</Eyebrow>
      <DayRing guide={guide} />
      {guide.routine.moments.map((m) => {
        const n = m.minutes === null ? null : timed.indexOf(m) + 1
        return (
          <div key={`${m.minutes}${m.label}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 24, marginBottom: 34 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 60, height: 60, borderRadius: 60, flexShrink: 0,
                background: n ? P.bloomAccent : 'transparent', border: n ? 'none' : `2px dashed ${withAlpha(P.ink1, 0.4)}`,
                ...display(32, 800, P.groundBase, 0),
              }}
            >
              {n ? String(n) : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', width: INNER - 84 }}>
              <div style={{ display: 'flex', ...mono(22, 600, P.bloomAccent, 0.1), textTransform: 'uppercase', marginBottom: 6 }}>
                {[m.minutes === null ? null : spokenClock(m.minutes), m.label].filter(Boolean).join(' · ')}
              </div>
              <div style={{ display: 'flex', ...display(40, 600, P.ink1, 0), lineHeight: 1.05 }}>{m.items.map((i) => i.title).join(', ')}</div>
            </div>
          </div>
        )
      })}
      <div style={{ display: 'flex', width: INNER, ...mono(20, 400, P.ink3, 0), lineHeight: 1.45, marginTop: 6, marginBottom: 70 }}>{ROUTINE_COPY.labelFirst}</div>

      {/* Your products */}
      <Eyebrow>{GUIDE_COPY.productsHeading}</Eyebrow>
      {guide.products.map((p) => (
        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', width: INNER, padding: CARD_PAD, marginBottom: 28, borderRadius: 32, background: P.surface2, border: `1.5px solid ${P.edge}` }}>
          <div style={{ display: 'flex', width: CARD_INNER, ...display(60, 800, P.ink1, -0.005), lineHeight: 1.0, marginBottom: 8 }}>{p.short}</div>
          {p.type.toLowerCase() !== p.short.toLowerCase() && <div style={{ display: 'flex', ...mono(21, 500, P.ink3, 0.12), textTransform: 'uppercase', marginBottom: 20 }}>{p.type}</div>}
          <div style={{ display: 'flex', width: CARD_INNER, ...mono(24, 600, P.ink1, 0.04), lineHeight: 1.4, marginBottom: 14 }}>{whenLine(p)}</div>
          {p.serving && (
            <div style={{ display: 'flex', width: CARD_INNER, ...mono(21, 500, P.ink2, 0.04), lineHeight: 1.4, marginBottom: 14, textTransform: 'uppercase' }}>
              {`${GUIDE_COPY.eachServing}: ${p.serving}`}
            </div>
          )}
          {p.claims.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', width: CARD_INNER }}>
              <div style={{ display: 'flex', ...mono(20, 600, P.bloomAccent, 0.14), textTransform: 'uppercase', marginBottom: 14, marginTop: 6 }}>{GUIDE_COPY.scienceHeading}</div>
              {p.claims.map((c) => (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', width: CARD_INNER, paddingLeft: 22, borderLeft: `6px solid ${P.bloomAccent}`, marginBottom: 20 }}>
                  <div style={{ display: 'flex', width: CARD_INNER - 28, ...mono(27, 500, P.ink1, 0), lineHeight: 1.45 }}>{`“${c.wording}”`}</div>
                  <div style={{ display: 'flex', width: CARD_INNER - 28, ...mono(20, 400, P.ink3, 0), lineHeight: 1.4, marginTop: 8 }}>{GUIDE_COPY.conditionOfUse(c.condition)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', width: CARD_INNER, ...mono(20, 400, P.ink3, 0), lineHeight: 1.45, marginBottom: 14 }}>{GUIDE_COPY.noClaim}</div>
          )}
          {p.warnings.map((w) => (
            <div key={w} style={{ display: 'flex', width: CARD_INNER, ...mono(19, 400, P.ink3, 0), lineHeight: 1.45, marginBottom: 6 }}>{w}</div>
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', width: INNER, ...mono(20, 400, P.ink3, 0), lineHeight: 1.45, marginTop: 4, marginBottom: 60 }}>{GUIDE_COPY.scienceNote}</div>

      {guide.services.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 40 }}>
          <Eyebrow>{GUIDE_COPY.servicesHeading}</Eyebrow>
          {guide.services.map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 14 }}>
              <div style={{ display: 'flex', width: 32, height: 32, borderRadius: 32, background: P.bloomAccent, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={P.groundBase} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                </svg>
              </div>
              <div style={{ display: 'flex', width: INNER - 50, ...mono(25, 500, P.ink1, 0), lineHeight: 1.45 }}>{s}</div>
            </div>
          ))}
        </div>
      )}

      <Eyebrow>{GUIDE_COPY.checkInHeading}</Eyebrow>
      <div style={{ display: 'flex', width: INNER, ...mono(25, 400, P.ink2, 0), lineHeight: 1.5, marginBottom: 60 }}>{GUIDE_COPY.checkIn(longDate(guide.checkInOn))}</div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: INNER, borderTop: `1.5px solid ${P.edge}`, paddingTop: 30, marginTop: 'auto' }}>
        <div style={{ display: 'flex', ...mono(20, 500, P.ink3, 0.08) }}>{`${GUIDE_COPY.plan[guide.plan].toUpperCase()} · ${new Date(guide.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}`}</div>
        <div style={{ display: 'flex', ...mono(20, 600, P.ink2, 0.08) }}>{LEGAL_ENTITY.tradingName.toUpperCase()}</div>
      </div>
    </div>
  )
}
