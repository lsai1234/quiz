import type { ShareEntry } from '@/lib/share-card/format'
import { SHARE_PALETTE as P } from '@/lib/share-card/palette'
import { Bolt, CropMarks, Grain, Picture, display, mono, widthEm, withAlpha } from './card-kit'

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
 * the address, the small print. No score and no doses.
 *
 * ── It is the poster's language, not a form ────────────────────────────────
 * The first cut of this card set the right words in the right order on a flat
 * ground and read as a form somebody had filled in. Everything that made the
 * story poster look made is back: the photograph full bleed under the prize
 * with the poster's own scrim, crop marks, the two-weight headline, a spec
 * table with dotted leaders, letterspaced mono, and the address as a centred
 * band. The panel gets cyan corner brackets — the crop marks' idea at the
 * panel's scale — because it is the one container on a card that otherwise
 * draws hairlines rather than boxes.
 *
 * ── The safe zones are for type ────────────────────────────────────────────
 * No type in the top 250px or the bottom 190px. The column is pinned to exactly
 * the space between them and its groups are spread with `space-between`, so
 * the first line box starts on the top edge, the last ends on the bottom one,
 * and a stack of three products breathes rather than leaving a hole. The
 * photograph and the crop marks run under both bands, as they do on the story
 * poster; `render.test.tsx` checks the type on its own (`typeOnly`).
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

/** How far the photograph runs down the card before the seam closes it. */
const ART_H = 1180
/** The foot of the header rail, which is what the rail's scrim holds to. */
const RAIL_FLOOR = GIVEAWAY_SAFE_TOP + 66

const RULE = withAlpha(P.ink1, 0.2)
const HAIRLINE = withAlpha(P.ink1, 0.1)
const MUTED = withAlpha(P.ink1, 0.44)
const SECOND = withAlpha(P.ink1, 0.62)

/* ── Type scale ──────────────────────────────────────────────────────────── */
const RAIL = 28
const HERO_MAX = 228
const REST_MAX = 150
const HOOK = 30
const PANEL_PAD_X = 40
const PANEL_INNER = COL - PANEL_PAD_X * 2 - 3 // the 1.5px border, both sides
const TITLE_MAX = 66
const TITLE_MIN = 40
const INDEX_W = 58
const ROW_H = 60
const NAME_MAX = 46
const NAME_MIN = 28
const CATEGORY = 18
const CATEGORY_TRACK = 0.14
/** The leader's least length, plus the gap either side of it. */
const LEADER_ROOM = 24 + 18 * 2
const STEP = 27
const DOMAIN = 104

/**
 * The size at which a line of Big Shoulders fills 96% of `room`.
 *
 * The estimate is a few percent either way, so it never asks for the whole
 * room: the cost of erring is a line a hair short of the edge, where the other
 * way it runs off the card.
 */
function ideal(text: string, room: number): number {
  const em = widthEm(text)
  return em === 0 ? Infinity : Math.floor((room * 0.96) / em)
}

function fit(text: string, room: number, max: number, min: number): number {
  return Math.max(min, Math.min(max, ideal(text, room)))
}

/**
 * IBM Plex Mono advances 0.6em, and the tracking is added on top, so a mono
 * line is the one width that can be computed rather than estimated.
 */
function monoWidth(text: string, size: number, tracking: number): number {
  return Math.ceil(text.length * size * (0.6 + tracking))
}

function fitMono(text: string, room: number, max: number, tracking: number): number {
  return Math.min(max, Math.floor(room / (Math.max(1, text.length) * (0.6 + tracking))))
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

/** "The Performance Athlete" → a light "THE" and a heavy rest, like the hero. */
function titleParts(title: string): { lead: string; rest: string } {
  const match = /^(the)\s+(.+)$/i.exec(title.trim())
  return match ? { lead: match[1], rest: match[2] } : { lead: '', rest: title.trim() }
}

/**
 * The hero's own ground, over the photograph — two layers.
 *
 * The poster's type block carries a full-width fade from inside itself, which
 * suits a block that starts halfway down the picture. Here the prize starts
 * just under the rail, and a fade deep enough to hold 228px type over a bright
 * frame turned the whole photograph to murk. So the fade is lighter, and a
 * pool — an ellipse of ground centred on the prize and the line under it —
 * does the rest where the type actually is. The picture keeps the band under
 * the rail and the right edge, which is where a frame's subject sits anyway.
 */
const HERO_FADE = `linear-gradient(to bottom, transparent 0px, ${withAlpha(P.groundBase, 0.22)} 330px, ${withAlpha(P.groundBase, 0.46)} 720px, ${withAlpha(P.groundBase, 0.66)} ${ART_H}px)`
const HERO_POOL = `radial-gradient(78% 22% at 36% 26%, ${withAlpha(P.groundBase, 0.5)} 0%, ${withAlpha(P.groundBase, 0.4)} 55%, ${withAlpha(P.groundBase, 0)} 100%)`

function Header({ label, test }: { label: string; test: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <Bolt size={RAIL + 2} color={P.accent} />
        <div style={{ ...mono(RAIL, 600, P.ink1, 0.3), lineHeight: '40px' }}>GETCHRGD</div>
      </div>
      <div style={{ ...mono(RAIL, 600, test ? P.toneAttention : P.accent, 0.3), lineHeight: '40px' }}>
        {label}
      </div>
    </div>
  )
}

function Prize({ entry }: { entry: ShareEntry }) {
  const heroSize = fit(entry.prizeHero, COL + 8, HERO_MAX, 120)
  const restSize = entry.prizeRest ? fit(entry.prizeRest, COL + 8, REST_MAX, 64) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* The poster's headline: heavy over light, the same size class, the
          optical hang buying the stems back to the margin. */}
      <div style={{ display: 'flex', flexDirection: 'column', marginLeft: -8 }}>
        <div
          style={{
            display: 'flex',
            ...display(heroSize, 800, P.ink1),
            lineHeight: 0.79,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
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
              ...display(restSize, 400, SECOND),
              lineHeight: 0.79,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              marginTop: 8,
            }}
          >
            {entry.prizeRest}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34 }}>
        <div style={{ ...mono(fitMono(entry.hook, COL, HOOK, 0.02), 500, P.ink1, 0.02), lineHeight: '42px' }}>
          {entry.hook}
        </div>
        <div style={{ ...mono(fitMono(entry.invite, COL, HOOK, 0.02), 400, withAlpha(P.ink1, 0.72), 0.02), lineHeight: '42px' }}>
          {entry.invite}
        </div>
      </div>
    </div>
  )
}

/**
 * One row of the spec table: index, name, leader, category.
 *
 * Sized per row rather than per list: a long supplier name shrinks on its own
 * line and leaves the other four at full size. If even the smallest size will
 * not fit beside the category, the row gives the category up — the product's
 * name is the thing the row is for. The row height is fixed either way, so the
 * table keeps its rhythm whatever the names do.
 */
function SpecRow({ index, name, category, last }: {
  index: number; name: string; category: string; last: boolean
}) {
  const categoryW = category ? monoWidth(category, CATEGORY, CATEGORY_TRACK) + LEADER_ROOM : 0
  const besideCategory = ideal(name, PANEL_INNER - INDEX_W - categoryW)
  const showCategory = !!category && besideCategory >= NAME_MIN
  const size = showCategory
    ? Math.min(NAME_MAX, besideCategory)
    : fit(name, PANEL_INNER - INDEX_W, NAME_MAX, NAME_MIN)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: ROW_H,
        borderBottom: last ? 'none' : `1px solid ${HAIRLINE}`,
      }}
    >
      <div style={{ display: 'flex', width: INDEX_W, flexShrink: 0, ...mono(20, 600, P.accent, 0.12) }}>
        {String(index + 1).padStart(2, '0')}
      </div>
      <div
        style={{
          display: 'flex',
          ...display(size, 600, P.ink1, -0.01),
          lineHeight: 1,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {name}
      </div>
      {showCategory ? (
        <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
          {/* A dotted leader. `border-style: dotted` is rejected by Satori, so
              this is a repeating gradient — same line, and it renders. */}
          <div
            style={{
              display: 'flex',
              flex: 1,
              height: 1,
              minWidth: 24,
              marginLeft: 18,
              marginRight: 18,
              backgroundImage: `repeating-linear-gradient(90deg, ${withAlpha(P.ink1, 0.3)} 0 2px, transparent 2px 7px)`,
            }}
          />
          <div style={{ display: 'flex', flexShrink: 0, ...mono(CATEGORY, 500, MUTED, CATEGORY_TRACK) }}>
            {category}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** The panel's corner brackets — the crop marks' idea, at the panel's scale. */
function Brackets() {
  const arm = 22
  const weight = 2.5
  const out = -2
  return (
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {[
        { top: out, left: out, borderTopWidth: weight, borderLeftWidth: weight },
        { top: out, right: out, borderTopWidth: weight, borderRightWidth: weight },
        { bottom: out, left: out, borderBottomWidth: weight, borderLeftWidth: weight },
        { bottom: out, right: out, borderBottomWidth: weight, borderRightWidth: weight },
      ].map((pos, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            width: arm,
            height: arm,
            borderStyle: 'solid',
            borderColor: P.accent,
            borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
            ...pos,
          }}
        />
      ))}
    </div>
  )
}

function StackPanel({ entry }: { entry: ShareEntry }) {
  const { lead, rest } = titleParts(entry.title)
  const titleSize = fit(entry.title, PANEL_INNER + 4, TITLE_MAX, TITLE_MIN)
  // The stamp gives way to a long name rather than crowding it.
  const ownerW = monoWidth(entry.owner, RAIL - 4, 0.3)
  const stampW = monoWidth(entry.stamp, RAIL - 6, 0.3)
  const showStamp = ownerW + stampW + 40 <= PANEL_INNER

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'relative',
        padding: `30px ${PANEL_PAD_X}px 12px`,
        border: `1.5px solid ${RULE}`,
        // A dark plate, so the panel reads as an object set over the
        // photograph's last light rather than a box drawn on the ground.
        background: withAlpha(P.groundBase, 0.64),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 30 }}>
        <div style={mono(RAIL - 4, 600, P.accent, 0.3)}>{entry.owner}</div>
        {showStamp ? <div style={mono(RAIL - 6, 600, MUTED, 0.3)}>{entry.stamp}</div> : null}
      </div>
      <div
        style={{
          display: 'flex',
          ...display(titleSize, 800, P.ink1, -0.015),
          lineHeight: 0.9,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          marginTop: 12,
          marginLeft: -3,
        }}
      >
        {lead ? <div style={{ display: 'flex', fontWeight: 400, color: SECOND }}>{`${lead} `}</div> : null}
        <div style={{ display: 'flex' }}>{rest}</div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 20,
          borderTop: `1.5px solid ${RULE}`,
        }}
      >
        {entry.products.map((p, i) => (
          <SpecRow
            key={`${i}-${p.name}`}
            index={i}
            name={p.name}
            category={p.category}
            last={i === entry.products.length - 1}
          />
        ))}
      </div>
      <Brackets />
    </div>
  )
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* The label runs into a rule, the way a section opens in a report. */}
      <div style={{ display: 'flex', alignItems: 'center', height: 30, marginBottom: 10 }}>
        <div style={{ display: 'flex', flexShrink: 0, ...mono(RAIL - 2, 600, P.accent, 0.3) }}>HOW TO ENTER</div>
        <div style={{ display: 'flex', flex: 1, height: 1, marginLeft: 22, background: withAlpha(P.ink1, 0.16) }} />
      </div>
      {steps.map((step, i) => {
        const text = step.toUpperCase()
        return (
          <div key={`${i}-${step}`} style={{ display: 'flex', alignItems: 'center', height: 54 }}>
            <div
              style={{
                display: 'flex',
                width: INDEX_W + 12,
                flexShrink: 0,
                ...display(40, 800, P.accent, -0.01),
                lineHeight: 1,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </div>
            <div
              style={{
                display: 'flex',
                whiteSpace: 'nowrap',
                ...mono(fitMono(text, COL - INDEX_W - 12, STEP, 0.08), 500, P.ink1, 0.08),
              }}
            >
              {text}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Where to go, as a band: the address in the accent, centred, with the small
 * print under it. Centred because it is addressed to the reader rather than
 * being another field in the card's own table — the poster's CTA band.
 */
function Foot({ entry }: { entry: ShareEntry }) {
  const small = entry.small.toUpperCase()
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flexShrink: 0,
        paddingTop: 24,
        borderTop: `1px solid ${withAlpha(P.ink1, 0.13)}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          ...display(DOMAIN, 800, P.accent, -0.01),
          // A full em, so the line box holds the descenders of "g" and the
          // small print starts below them rather than under them.
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {entry.domain}
      </div>
      <div
        style={{
          display: 'flex',
          ...mono(fitMono(small, COL, 21, 0.14), 400, withAlpha(P.ink1, 0.5), 0.14),
          lineHeight: '28px',
          marginTop: 16,
        }}
      >
        {small}
      </div>
    </div>
  )
}

/**
 * `art` is the resolved photograph — the founder's upload for this stack's art
 * family — or null, which draws the family's gradient field. `typeOnly` draws
 * the type column on the bare ground and nothing else; it exists so the render
 * test can check where the type is without the picture in the way.
 */
export function GiveawayCard({ entry, art, artKey, typeOnly = false }: {
  entry: ShareEntry
  art: string | null
  artKey?: string
  typeOnly?: boolean
}) {
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
      {typeOnly ? null : (
        <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: W, height: H }}>
          <Picture art={art} artKey={artKey} w={W} h={H} artH={ART_H} railFloor={RAIL_FLOOR} />
          {[HERO_FADE, HERO_POOL].map((layer, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                position: 'absolute',
                top: 0, left: 0, width: W, height: i === 0 ? ART_H : H,
                backgroundImage: layer,
              }}
            />
          ))}
          <CropMarks w={W} h={H} />
        </div>
      )}

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

      {typeOnly ? null : <Grain w={W} h={H} />}
    </div>
  )
}
