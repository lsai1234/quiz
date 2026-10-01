import type { ShareEntry } from '@/lib/share-card/format'
import { SHARE_PALETTE as P } from '@/lib/share-card/palette'
import { Bolt, Grain, display, mono, widthEm, withAlpha } from './card-kit'

/**
 * The giveaway card — the entry format while a draw is running.
 *
 * ── What it is ─────────────────────────────────────────────────────────────
 * An advert with somebody's stack on it. The prize is the hook, the stack is
 * the proof that a real person did this, and the three steps and the address
 * are the whole point: a reshared story is a flat image with no link on it, so
 * a stranger who wants in has only what is printed here.
 *
 * Top to bottom: logo and label, the prize, one line saying who built this
 * and what that means for you, the stack in a bordered panel, how to enter,
 * the address, the small print. No photograph, no score, no doses. The story
 * poster carries those; this card has one job.
 *
 * ── The safe zones are absolute ────────────────────────────────────────────
 * Nothing is drawn in the top 250px or the bottom 190px — no type, no rule, no
 * crop mark. The column is pinned to exactly the space between them and its
 * groups are spread with `space-between`, so the first line box starts on the
 * top edge, the last ends on the bottom one, and a stack of three products
 * breathes rather than leaving a hole. `render.test.tsx` checks the raster.
 *
 * Same Satori rules as `ShareCard.tsx`: every parent with more than one child
 * says `display: flex`, every text child is a string, and nothing wraps that
 * was not asked to.
 */

const W = 1080
const H = 1920
export const GIVEAWAY_SAFE_TOP = 250
export const GIVEAWAY_SAFE_BOTTOM = H - 190
const MARGIN = 84
const COL = W - MARGIN * 2

const RULE = withAlpha(P.ink1, 0.2)
const HAIRLINE = withAlpha(P.ink1, 0.1)

/* ── Type scale ──────────────────────────────────────────────────────────── */
const RAIL = 28
const HERO_MAX = 220
const REST_MAX = 98
const HOOK = 31
const PANEL_PAD_X = 40
const PANEL_INNER = COL - PANEL_PAD_X * 2 - 4 // the 2px border, both sides
const TITLE_MAX = 68
const TITLE_MIN = 40
const INDEX_W = 66
const ROW_H = 60
const NAME_MAX = 46
const NAME_MIN = 28
const STEP = 30
const DOMAIN = 108

/**
 * A size for one line of Big Shoulders that fits `room`, clamped.
 *
 * The estimate is a few percent either way, so it is asked to fill 96% of the
 * room rather than all of it: the cost of erring is a line a hair short of the
 * edge, where the other way it runs off the card.
 */
function fit(text: string, room: number, max: number, min: number): number {
  const em = widthEm(text)
  if (em === 0) return max
  return Math.max(min, Math.min(max, Math.floor((room * 0.96) / em)))
}

/**
 * IBM Plex Mono advances 0.6em, and the tracking is added on top, so a mono
 * line is the one width that can be computed rather than estimated.
 */
function fitMono(text: string, room: number, max: number, tracking: number): number {
  const perChar = 0.6 + tracking
  return Math.min(max, Math.floor(room / (Math.max(1, text.length) * perChar)))
}

/**
 * The hero, split so the amount is the accent.
 *
 * Each part is its own flex child, and flex trims the whitespace at a child's
 * edges — which closes "WIN £200" up to "WIN£200". The space before the amount
 * is load-bearing, so it is made non-breaking.
 */
function heroParts(text: string): Array<{ text: string; money: boolean }> {
  const match = /[£$€]\s?\d[\d,.]*[kK]?/.exec(text)
  if (!match) return [{ text, money: false }]
  const before = text.slice(0, match.index)
  const after = text.slice(match.index + match[0].length)
  return [
    ...(before ? [{ text: before.replace(/ $/, ' '), money: false }] : []),
    { text: match[0], money: true },
    ...(after ? [{ text: after.replace(/^ /, ' '), money: false }] : []),
  ]
}

function Header({ label, test }: { label: string; test: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Bolt size={RAIL + 6} color={P.accent} />
        <div style={{ ...mono(RAIL + 2, 600, P.ink1, 0.3), lineHeight: '40px' }}>GETCHRGD</div>
      </div>
      <div style={{ ...mono(RAIL - 2, 600, test ? P.toneAttention : P.accent, 0.28), lineHeight: '40px' }}>
        {label}
      </div>
    </div>
  )
}

function Prize({ entry }: { entry: ShareEntry }) {
  const heroSize = fit(entry.prizeHero, COL, HERO_MAX, 120)
  const restSize = entry.prizeRest ? fit(entry.prizeRest, COL, REST_MAX, 56) : 0
  const hookSize = fitMono(entry.hook, COL, HOOK, 0)
  const inviteSize = fitMono(entry.invite, COL, HOOK, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div
        style={{
          display: 'flex',
          ...display(heroSize, 800, P.ink1, -0.02),
          lineHeight: 0.82,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          // Big Shoulders' W carries its own side bearing; the hang lines the
          // stem up with the column rather than the glyph box.
          marginLeft: -Math.round(heroSize * 0.03),
        }}
      >
        {heroParts(entry.prizeHero).map((part, i) => (
          <div key={i} style={{ display: 'flex', color: part.money ? P.accent : P.ink1 }}>
            {part.text}
          </div>
        ))}
      </div>
      {entry.prizeRest ? (
        <div
          style={{
            display: 'flex',
            ...display(restSize, 600, withAlpha(P.ink1, 0.74), -0.01),
            lineHeight: 0.86,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            marginTop: Math.round(heroSize * 0.05),
            marginLeft: -Math.round(restSize * 0.02),
          }}
        >
          {entry.prizeRest}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 30 }}>
        <div style={{ ...mono(hookSize, 500, P.ink1, 0), lineHeight: '42px' }}>{entry.hook}</div>
        <div style={{ ...mono(inviteSize, 400, withAlpha(P.ink1, 0.74), 0), lineHeight: '42px' }}>
          {entry.invite}
        </div>
      </div>
    </div>
  )
}

/**
 * One product in the panel.
 *
 * Sized per row rather than per list: a long supplier name shrinks on its own
 * line and leaves the other four at full size. The row height is fixed either
 * way, so the list keeps its rhythm whatever the names do.
 */
function ProductRow({ index, name, last }: { index: number; name: string; last: boolean }) {
  const size = fit(name, PANEL_INNER - INDEX_W, NAME_MAX, NAME_MIN)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: ROW_H,
        borderBottom: last ? 'none' : `1px solid ${HAIRLINE}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          width: INDEX_W,
          flexShrink: 0,
          ...mono(22, 600, P.accent, 0.12),
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </div>
      <div
        style={{
          display: 'flex',
          ...display(size, 600, P.ink1, -0.005),
          lineHeight: 1,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </div>
    </div>
  )
}

function StackPanel({ entry }: { entry: ShareEntry }) {
  const titleSize = fit(entry.title, PANEL_INNER, TITLE_MAX, TITLE_MIN)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        padding: `30px ${PANEL_PAD_X}px 16px`,
        border: `2px solid ${RULE}`,
        background: P.surface1,
      }}
    >
      <div style={{ ...mono(RAIL - 4, 600, P.accent, 0.28), lineHeight: '30px' }}>{entry.owner}</div>
      <div
        style={{
          display: 'flex',
          ...display(titleSize, 800, P.ink1, -0.015),
          lineHeight: 0.9,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          marginTop: 10,
          marginLeft: -2,
        }}
      >
        {entry.title}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 22,
          borderTop: `1.5px solid ${RULE}`,
        }}
      >
        {entry.products.map((name, i) => (
          <ProductRow key={`${i}-${name}`} index={i} name={name} last={i === entry.products.length - 1} />
        ))}
      </div>
    </div>
  )
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ ...mono(RAIL - 4, 600, P.accent, 0.28), lineHeight: '30px', marginBottom: 12 }}>
        HOW TO ENTER
      </div>
      {steps.map((step, i) => (
        <div key={`${i}-${step}`} style={{ display: 'flex', alignItems: 'center', height: 52 }}>
          <div style={{ display: 'flex', width: INDEX_W, flexShrink: 0, ...mono(STEP - 6, 600, P.accent, 0.12) }}>
            {String(i + 1).padStart(2, '0')}
          </div>
          <div style={{ display: 'flex', whiteSpace: 'nowrap', ...mono(fitMono(step, COL - INDEX_W, STEP, 0.02), 500, P.ink1, 0.02) }}>
            {step}
          </div>
        </div>
      ))}
    </div>
  )
}

function Foot({ entry }: { entry: ShareEntry }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div
        style={{
          display: 'flex',
          ...display(DOMAIN, 800, P.accent, -0.01),
          // A full em, so the line box holds the descenders of "g" and the
          // small print starts below them rather than under them.
          lineHeight: 1,
          whiteSpace: 'nowrap',
          marginLeft: -3,
        }}
      >
        {entry.domain}
      </div>
      <div
        style={{
          display: 'flex',
          ...mono(fitMono(entry.small, COL, 22, 0.04), 400, withAlpha(P.ink1, 0.62), 0.04),
          lineHeight: '30px',
          marginTop: 18,
        }}
      >
        {entry.small}
      </div>
    </div>
  )
}

export function GiveawayCard({ entry }: { entry: ShareEntry }) {
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: W,
        height: H,
        background: P.groundBase,
        overflow: 'hidden',
      }}
    >
      {/* ── Ground: the app's blooms, kept off the safe zones ──────────────
          Two soft fields from the brand palette, centred well inside the
          type column so their tails fall away to ground before either edge
          band. A bloom bright enough to read in the top 250px would be the
          one thing there, and the zone is meant to be clear. */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0, left: 0, width: W, height: H,
          backgroundImage: `radial-gradient(52% 26% at 78% 30%, ${withAlpha(P.bloomAccent, P.bloom1Alpha * 1.25)} 0%, ${withAlpha(P.bloomAccent, 0)} 100%)`,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0, left: 0, width: W, height: H,
          backgroundImage: `radial-gradient(60% 24% at 18% 64%, ${withAlpha(P.bloomViolet, P.bloom1Alpha)} 0%, ${withAlpha(P.bloomViolet, 0)} 100%)`,
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'absolute',
          top: GIVEAWAY_SAFE_TOP,
          left: MARGIN,
          width: COL,
          height: GIVEAWAY_SAFE_BOTTOM - GIVEAWAY_SAFE_TOP,
        }}
      >
        <Header label={entry.label} test={entry.test} />
        <Prize entry={entry} />
        <StackPanel entry={entry} />
        <Steps steps={entry.steps} />
        <Foot entry={entry} />
      </div>

      <Grain w={W} h={H} />
    </div>
  )
}
