'use client'

import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { Button, Input } from '@/components/system'
import { Icon } from '@/components/ui/Icon'

/**
 * The giveaway, drawn — "Poster ticket".
 *
 * Chosen from four competing designs judged on craft, clarity and compliance.
 *
 * The giveaway as a printed ticket in the card's own language: a poster face
 * (rail, two-weight prize, the card itself in cyan brackets) and a tear-off
 * stub that carries the entry count as a ticket number and a charge rail of
 * eleven cells — one for the email, ten for sharing — so the two-step mechanic
 * is something you can see fill rather than a sentence you have to parse.
 *
 * It is the only giveaway block on the page: the card thumbnail and the share
 * step live on the ticket, so the "Share your stack" tile above is dropped.
 */

/**
 * The contract every giveaway design implements.
 *
 * Purely presentational: the container (`GiveawayEntry`) owns fetching,
 * storage and submission, and hands a view everything it needs to draw any
 * state. That split is what lets the lab render every state side by side
 * without a network, and lets a redesign swap the view without touching the
 * entry logic.
 */
export interface GiveawayViewProps {
  /** As configured in the Founders Hub, e.g. "Win £200 of supplements". */
  prize: string
  /** A rehearsal: everything must visibly say it is not a real draw. */
  test: boolean
  /** "Closes 30 Nov", or '' when no date is set. */
  closes: string
  /** Extra entries for sharing the card. 10. */
  bonus: number
  /**
   * The person's own giveaway card (a 9:16 poster of their stack, 1080×1920),
   * or null while unavailable. It is the thing they share for the bonus.
   */
  cardImageUrl: string | null
  /** invite: not entered, form closed · form: email form open · entered: done. */
  phase: 'invite' | 'form' | 'entered'
  email: string
  status: 'idle' | 'sending' | 'invalid' | 'closed' | 'error'
  /** They shared the card before entering; the bonus lands when they enter. */
  pendingShare: boolean
  /** Non-null exactly when phase === 'entered'. tickets is 1, or 1 + bonus once shared. */
  entry: { email: string; tickets: number; shared: boolean } | null
  onOpen: () => void
  onEmailChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onShare: () => void
}

const MONO = 'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace'
const DISPLAY = 'var(--font-display)'
const ACCENT = 'var(--color-accent)'
const AMBER = 'var(--tone-attention)'
const INK = 'var(--color-text)'
const INK_2 = 'var(--color-text-2)'

/** The ticket stock: a shade lifted off the page, solid (never glass). */
const PAPER = 'color-mix(in srgb, var(--color-surface) 80%, var(--color-bg))'
const HAIR = 'color-mix(in srgb, var(--color-text) 10%, transparent)'
const NOTCH = 'var(--space-3)'
/** Fixed, so the hero sizes the same whether the caption says "share" or "shared". */
const THUMB_COL = 88

/** Quarter-circle bites out of the two corners on the seam side. */
function notches(edge: 'top' | 'bottom'): string {
  const y = edge === 'bottom' ? '100%' : '0'
  const cut = (x: string) =>
    `radial-gradient(circle at ${x} ${y}, transparent ${NOTCH}, black calc(${NOTCH} + 0.5px))`
  return `${cut('0')} left / 51% 100% no-repeat, ${cut('100%')} right / 51% 100% no-repeat`
}

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")"

function mono(size: number, color: string, tracking = 0.16): CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: size,
    letterSpacing: `${tracking}em`,
    textTransform: 'uppercase',
    color,
    lineHeight: 1.3,
  }
}

/** "Win £200 of supplements" → heavy "Win £200", light "of supplements". */
function splitPrize(prize: string): { lead: string; amount: string; rest: string } {
  const text = (prize ?? '').trim()
  const m = /[£$€]\s?\d[\d,.]*[kK]?/.exec(text)
  if (m) {
    return {
      lead: text.slice(0, m.index).trim(),
      amount: m[0].replace(/\s+/g, ''),
      rest: text.slice(m.index + m[0].length).trim(),
    }
  }
  const verb = /^(win|get|claim)\s+(.+)$/i.exec(text)
  if (verb) return { lead: verb[1], amount: '', rest: verb[2] }
  return { lead: text, amount: '', rest: '' }
}

/**
 * A line set to fill its column and no more: capped at `max`, and otherwise
 * sized in container units from its length, so "WIN £200" holds one line on a
 * 360px phone instead of breaking under the card.
 */
function fitLine(text: string, max: number, em: number): string {
  const chars = Math.max(4, text.length)
  return `min(${max}px, ${(100 / (chars * em)).toFixed(2)}cqi)`
}

const pad = (n: number) => String(Math.max(0, n)).padStart(2, '0')

function Bolt({ size = 12, color = ACCENT }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path d="M13 2 4 14h7l-1 8 10-12h-7l1-8z" fill={color} />
    </svg>
  )
}

/** Print crop marks just outside the ticket's four corners. */
function CropMarks() {
  const line = 'color-mix(in srgb, var(--color-text) 26%, transparent)'
  const corners: Array<[string, string]> = [['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']]
  return (
    <>
      {corners.map(([v, h]) => (
        <span key={v + h} aria-hidden className="pointer-events-none absolute" style={{ [v]: 0, [h]: 0, width: 0, height: 0 }}>
          <span className="absolute" style={{ [v]: -0.5, [h]: -16, width: 10, height: 1, background: line }} />
          <span className="absolute" style={{ [h]: -0.5, [v]: -16, width: 1, height: 10, background: line }} />
        </span>
      ))}
    </>
  )
}

/** The card's own panel brackets, at thumbnail scale. */
function Brackets({ color }: { color: string }) {
  const arm = 9
  const w = 1.5
  const at: Array<[string, string]> = [['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']]
  return (
    <>
      {at.map(([v, h]) => (
        <span
          key={v + h}
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            [v]: -5,
            [h]: -5,
            width: arm,
            height: arm,
            [`border${v[0].toUpperCase()}${v.slice(1)}`]: `${w}px solid ${color}`,
            [`border${h[0].toUpperCase()}${h.slice(1)}`]: `${w}px solid ${color}`,
          }}
        />
      ))}
    </>
  )
}

function CardThumb({ src, shareable, duplicate, shared, test, bonus, onShare }: {
  src: string | null
  shareable: boolean
  /** The share button below already says this; the card is just a bigger target. */
  duplicate: boolean
  shared: boolean
  test: boolean
  bonus: number
  onShare: () => void
}) {
  const tone = test ? AMBER : ACCENT
  const art = (
    <span
      className="relative block overflow-hidden"
      style={{
        width: 62,
        height: 110,
        borderRadius: 4,
        background: 'color-mix(in srgb, var(--color-text) 6%, var(--color-bg))',
        boxShadow: '0 10px 24px -12px black, 0 0 0 1px color-mix(in srgb, var(--color-text) 12%, transparent)',
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={62} height={110} className="block h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center" style={{ color: INK_2 }}>
          <Bolt size={18} color="currentColor" />
        </span>
      )}
      {test && (
        <span
          className="absolute left-1/2 block text-center"
          style={{
            top: '27%',
            width: '170%',
            transform: 'translate(-50%, -50%) rotate(-24deg)',
            background: AMBER,
            ...mono(10, 'var(--ink-on-accent)', 0.3),
            fontWeight: 700,
            padding: '2px 0',
            boxShadow: '0 2px 8px black',
          }}
        >
          Test
        </span>
      )}
    </span>
  )
  const caption = shared ? (
    <span className="inline-flex items-center gap-1" style={mono(11, INK_2, 0.1)}>
      <Icon name="check" size={12} /> Shared
    </span>
  ) : (
    <span style={mono(11, tone, 0.1)}>+{bonus} · Share</span>
  )

  const body = (
    <>
      <span className="relative block">
        {art}
        <Brackets color={tone} />
      </span>
      <span className="mt-2.5 block text-center">{caption}</span>
    </>
  )

  return shareable ? (
    <button
      type="button"
      onClick={onShare}
      tabIndex={duplicate ? -1 : undefined}
      aria-hidden={duplicate || undefined}
      aria-label={`Share your card — ${bonus} bonus entries`}
      className="gwA-thumb system-focus flex shrink-0 flex-col items-center"
      style={{ width: THUMB_COL + 8, padding: 4, margin: -4, borderRadius: 8 }}
    >
      {body}
    </button>
  ) : (
    <div className="flex shrink-0 flex-col items-center" style={{ width: THUMB_COL }} aria-hidden>
      {body}
    </div>
  )
}

/** One cell for the email, a gap, then one per bonus entry for the share. */
function Rail({ tickets, held, test, bonus }: { tickets: number; held: boolean; test: boolean; bonus: number }) {
  // Entered but not shared: the ten empty cells are the next thing to fill.
  const next = tickets === 1
  const lit = (i: number) => i < tickets
  const tone = test ? AMBER : ACCENT
  return (
    <div className="flex items-center" style={{ gap: 3 }} aria-hidden>
      {Array.from({ length: 1 + Math.max(1, Math.min(bonus, 20)) }, (_, i) => {
        const on = lit(i)
        const isHeld = !on && held && i > 0
        const isNext = !on && next && i > 0
        return (
          <span
            key={i}
            className={on ? 'gwA-cell' : undefined}
            style={{
              ['--i' as string]: i,
              flex: i === 0 ? '0 0 22px' : '1 1 0',
              marginRight: i === 0 ? 7 : 0,
              height: 14,
              borderRadius: 2,
              background: on
                ? `linear-gradient(180deg, color-mix(in srgb, ${tone} 70%, white), ${tone})`
                : isHeld
                  ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${tone} 45%, transparent) 0 2px, transparent 2px 5px)`
                  : 'color-mix(in srgb, var(--color-text) 5%, transparent)',
              boxShadow: on
                ? `0 0 10px -2px color-mix(in srgb, ${tone} 70%, transparent)`
                : `inset 0 0 0 1px ${isHeld ? `color-mix(in srgb, ${tone} 50%, transparent)` : isNext ? `color-mix(in srgb, ${tone} 38%, transparent)` : 'color-mix(in srgb, var(--color-text) 13%, transparent)'}`,
            }}
          />
        )
      })}
    </div>
  )
}

function Counter({ tickets, held, test, bonus }: { tickets: number; held: boolean; test: boolean; bonus: number }) {
  const full = tickets >= 1 + bonus
  const tone = test ? AMBER : ACCENT
  return (
    <div aria-hidden>
      <div className="flex items-baseline justify-between">
        <span style={mono(11, INK_2, 0.2)}>Entries</span>
        {full ? (
          <span className="inline-flex items-center gap-1" style={mono(11, tone, 0.2)}>
            <Bolt size={11} color={tone} /> Fully charged
          </span>
        ) : (
          <span style={mono(11, INK_2, 0.2)}>Up to {pad(1 + bonus)}</span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-3.5">
        <span
          key={tickets}
          className={tickets > 0 ? 'gwA-pop' : undefined}
          style={{
            fontFamily: DISPLAY,
            fontSize: 50,
            fontWeight: 700,
            lineHeight: 0.84,
            letterSpacing: '0.01em',
            fontVariantNumeric: 'tabular-nums',
            color: tickets > 0 ? (full ? tone : INK) : 'transparent',
            WebkitTextStroke: tickets > 0 ? undefined : `1px ${INK_2}`,
            textShadow: full ? `0 0 22px color-mix(in srgb, ${tone} 55%, transparent)` : undefined,
          }}
        >
          {pad(tickets)}
        </span>
        <div className="min-w-0 flex-1">
          <Rail tickets={tickets} held={held} test={test} bonus={bonus} />
          <div className="mt-2 flex justify-between gap-2">
            <span style={mono(11, tickets > 0 ? INK : INK_2, 0.1)}>Email +1</span>
            <span style={mono(11, held || tickets > 1 ? INK : tickets === 1 ? tone : INK_2, 0.1)}>
              {held && tickets === 0 ? `+${bonus} held` : `Share card +${bonus}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The significant conditions, set like the foot of a ticket: what binds you on
 * the left, where the rest is written on the right. The links sit in a 44px
 * band so a thumb can hit them without the type getting any louder.
 */
function FinePrint({ test }: { test: boolean }) {
  const link: CSSProperties = { ...mono(11, INK_2, 0.08), textDecoration: 'underline', textUnderlineOffset: 3, minHeight: 44 }
  return (
    <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-2)', borderTop: `1px dashed ${HAIR}` }}>
      {test && (
        <p style={{ ...mono(11, AMBER, 0.08), paddingTop: 'var(--space-2)' }}>Test run — no real draw</p>
      )}
      <div className="flex flex-wrap items-center justify-between" style={{ columnGap: 'var(--space-3)' }}>
        <div style={{ paddingBlock: 'var(--space-1)' }}>
          <p style={mono(11, INK_2, 0.08)}>No purchase necessary</p>
          <p style={mono(11, INK_2, 0.08)}>One entry per email</p>
        </div>
        <div className="flex items-center" style={{ gap: 'var(--space-4)' }}>
          <a href="/legal/competition" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5" style={link}>
            T&amp;Cs<Icon name="arrow-right" size={11} className="-rotate-45" />
          </a>
          <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5" style={link}>
            Privacy<Icon name="arrow-right" size={11} className="-rotate-45" />
          </a>
        </div>
      </div>
    </div>
  )
}

/** The validation stamp, pressed onto the poster face once you are in. */
function Stamp({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="gwA-stamp inline-flex items-center gap-1.5"
      style={{
        ...mono(12, tone, 0.2),
        fontWeight: 700,
        padding: '5px 10px 5px 8px',
        border: `3px double color-mix(in srgb, ${tone} 85%, transparent)`,
        borderRadius: 4,
        transform: 'rotate(-5deg)',
        transformOrigin: 'left center',
        background: `color-mix(in srgb, ${tone} 7%, transparent)`,
      }}
    >
      <Icon name="check" size={14} />
      {children}
    </span>
  )
}

export function GiveawayEntryView(p: GiveawayViewProps) {
  const { entry, bonus, test } = p
  const prize = splitPrize(p.prize)
  const tone = test ? AMBER : ACCENT
  const shared = Boolean(entry?.shared || p.pendingShare)
  const tickets = entry?.tickets ?? 0
  const held = !entry && p.pendingShare

  const heavy = test ? 'Enter the' : [prize.lead, prize.amount].filter(Boolean).join(' ')
  const light = test ? 'test draw' : prize.rest

  let stub: ReactNode
  if (entry) {
    stub = (
      <div role="status" aria-live="polite">
        <p
          className="gwA-rise"
          style={{ fontFamily: DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, color: INK }}
        >
          You’re in — {entry.tickets} {entry.tickets === 1 ? 'entry' : 'entries'}
        </p>
        <p className="mt-1.5" style={{ fontSize: 13, lineHeight: 1.45, color: INK_2 }}>
          Entered as <strong style={{ color: INK, fontWeight: 600, overflowWrap: 'anywhere' }}>{entry.email}</strong>.{' '}
          {p.test
            ? 'Test run — this is a rehearsal, so there is no real draw.'
            : entry.shared
              ? `That includes ${bonus} bonus entries for sharing your card. Good luck!`
              : 'We’ll email you if you win.'}
        </p>
        <div style={{ marginTop: 'var(--space-5)' }}>
          <Counter tickets={entry.tickets} held={false} test={test} bonus={bonus} />
        </div>
        {!entry.shared && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            {/* Filled once they have opted in: by now it is the one next action. */}
            <Button variant="primary" size="lg" icon="share" fullWidth onClick={p.onShare}>
              Share your card for +{bonus} entries
            </Button>
            <p className="mt-2.5" style={{ fontSize: 12, lineHeight: 1.45, color: INK_2 }}>
              Post it to your Instagram story and your {bonus} bonus entries are added.
            </p>
          </div>
        )}
      </div>
    )
  } else if (p.phase === 'invite') {
    stub = (
      <>
        <Counter tickets={0} held={held} test={test} bonus={bonus} />
        {p.pendingShare && (
          <p className="mt-4 flex items-start gap-2" style={{ fontSize: 13, lineHeight: 1.45, color: INK_2 }}>
            <span className="mt-0.5 shrink-0" style={{ color: tone }}><Icon name="check" size={14} /></span>
            <span>You’ve already shared your card, so your {bonus} bonus entries land the moment you enter.</span>
          </p>
        )}
        <div style={{ marginTop: 'var(--space-5)' }}>
          <Button variant="secondary" size="lg" iconRight="arrow-right" fullWidth onClick={p.onOpen}>
            Enter the competition
          </Button>
        </div>
      </>
    )
  } else {
    const sending = p.status === 'sending'
    stub = (
      <>
        <Counter tickets={0} held={held} test={test} bonus={bonus} />
        <form onSubmit={p.onSubmit} noValidate className="gwA-rise" style={{ marginTop: 'var(--space-5)' }}>
          <p aria-hidden className="flex items-baseline" style={{ ...mono(11, INK_2, 0.16), marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <span>Your email</span>
            <span className="flex-1" style={{ borderBottom: `1px dotted color-mix(in srgb, var(--color-text) 28%, transparent)`, transform: 'translateY(-3px)' }} />
            <span style={{ color: tone }}>1 entry</span>
          </p>
          <div className="flex items-start" style={{ gap: 'var(--space-2)' }}>
            <Input
              className="min-w-0 flex-1"
              label="Your email" hideLabel type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off"
              placeholder="you@example.com" value={p.email}
              onChange={(e) => p.onEmailChange(e.target.value)}
              error={p.status === 'invalid' ? 'That doesn’t look like an email address.' : undefined}
            />
            <Button type="submit" variant="primary" size="md" className="min-w-[6.5rem]" loading={sending} disabled={p.email.trim().length < 3}>
              {sending ? 'Entering…' : 'Enter'}
            </Button>
          </div>
          {p.status === 'error' && (
            <p role="alert" className="mt-2 flex items-start gap-1.5" style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--tone-critical)' }}>
              <span className="mt-px shrink-0"><Icon name="alert-triangle" size={13} /></span>
              That didn’t go through — try again in a moment.
            </p>
          )}
          {p.status === 'closed' && (
            <p role="alert" className="mt-2" style={{ fontSize: 12, lineHeight: 1.4, color: INK_2 }}>
              This giveaway has closed.
            </p>
          )}
          <p className="mt-3" style={{ fontSize: 11.5, lineHeight: 1.5, color: INK_2 }}>
            By entering you agree to the{' '}
            <a href="/legal/competition" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: INK, textUnderlineOffset: 2 }}>competition T&amp;Cs</a>
            , including that getCHRGD can email you offers and news. Unsubscribe any time.
          </p>
        </form>
      </>
    )
  }

  return (
    <section aria-label="Giveaway" className="relative mx-auto max-w-lg" style={{ marginTop: 'var(--space-6)' }}>
      <style>{`
        @media (hover: hover) and (prefers-reduced-motion: no-preference) {
          .gwA-thumb > span:first-child { transition: transform var(--duration-base) var(--ease-spring); }
          .gwA-thumb:hover > span:first-child { transform: translateY(-2px) rotate(-1.5deg); }
        }
        @media (prefers-reduced-motion: no-preference) {
          .gwA-cell { animation: gwA-charge 380ms var(--ease-spring) both; animation-delay: calc(var(--i) * 40ms); }
          .gwA-pop { animation: gwA-pop 520ms var(--ease-spring) both; }
          .gwA-stamp { animation: gwA-stamp 460ms var(--ease-spring) 120ms both; }
          .gwA-rise { animation: gwA-rise var(--duration-slow) var(--ease-settle, ease-out) both; }
        }
        @keyframes gwA-charge { from { opacity: .15; transform: scaleY(.35); } to { opacity: 1; transform: none; } }
        @keyframes gwA-pop { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: none; } }
        @keyframes gwA-stamp { from { opacity: 0; transform: rotate(-5deg) scale(1.5); } to { opacity: 1; transform: rotate(-5deg) scale(1); } }
        @keyframes gwA-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      `}</style>

      <CropMarks />

      {/* ── The poster face ─────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          padding: 'var(--space-5) var(--space-5) var(--space-6)',
          borderRadius: 'var(--radius-card) var(--radius-card) 0 0',
          background: `radial-gradient(120% 85% at 0% 0%, color-mix(in srgb, ${tone} 12%, transparent) 0%, transparent 60%), ${PAPER}`,
          boxShadow: 'inset 0 1px 0 0 color-mix(in srgb, var(--color-text) 12%, transparent)',
          mask: notches('bottom'),
          WebkitMask: notches('bottom'),
        }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: GRAIN, opacity: 0.07, mixBlendMode: 'overlay' }} />

        <div className="relative flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
          <span className="inline-flex items-center gap-1.5" style={mono(11, tone, 0.22)}>
            <Bolt size={12} color={tone} />
            {test ? 'Test draw' : 'Giveaway'}
          </span>
          {p.closes && <span style={mono(11, INK_2, 0.16)}>{p.closes}</span>}
        </div>
        <div aria-hidden className="relative" style={{ height: 1, background: HAIR, margin: 'var(--space-3) 0 var(--space-4)' }} />

        <div className="relative flex items-start justify-between" style={{ gap: 'var(--space-4)' }}>
          <div className="min-w-0 flex-1" style={{ containerType: 'inline-size' }}>
            <h2 className="uppercase" style={{ fontFamily: DISPLAY, overflowWrap: 'anywhere' }}>
              <span className="block" style={{ fontSize: fitLine(heavy, 50, 0.565), fontWeight: 700, lineHeight: 0.88, letterSpacing: '-0.035em', color: INK }}>
                {test ? (
                  'Enter the'
                ) : (
                  <>
                    {prize.lead}
                    {prize.lead && prize.amount ? ' ' : ''}
                    {prize.amount && <span style={{ color: ACCENT }}>{prize.amount}</span>}
                  </>
                )}
              </span>
              {(test || prize.rest) && (
                <span className="block" style={{ marginTop: 6, fontSize: fitLine(light, 23, 0.6), fontWeight: 400, lineHeight: 1, letterSpacing: '-0.01em', color: test ? AMBER : INK_2 }}>
                  {' '}
                  {light}
                </span>
              )}
            </h2>

            {entry ? (
              <div style={{ marginTop: 'var(--space-5)' }}>
                <Stamp tone={tone}>{test ? 'Test entry' : 'In the draw'}</Stamp>
              </div>
            ) : test ? (
              <p className="mt-3.5" style={{ fontSize: 13, lineHeight: 1.45, color: INK_2 }}>
                <span style={{ color: AMBER, fontWeight: 600 }}>Not a real draw.</span> A rehearsal of the
                giveaway — nothing here can be won.
              </p>
            ) : (
              <p className="mt-3.5" style={{ fontSize: 13, lineHeight: 1.45, color: INK_2 }}>
                You finished the quiz, so you qualify. Your email is your ticket.
              </p>
            )}
          </div>

          <CardThumb
            src={p.cardImageUrl}
            shareable={!shared}
            duplicate={Boolean(entry)}
            shared={shared}
            test={test}
            bonus={bonus}
            onShare={p.onShare}
          />
        </div>
      </div>

      {/* ── The perforation ─────────────────────────────────────────── */}
      <div aria-hidden className="relative" style={{ height: 0 }}>
        <span
          className="absolute"
          style={{
            left: 'calc(var(--space-3) + 8px)',
            right: 'calc(var(--space-3) + 8px)',
            top: -2,
            height: 4,
            backgroundImage: 'radial-gradient(circle, var(--color-bg) 0 1.6px, transparent 2.1px)',
            backgroundSize: '9px 4px',
            backgroundRepeat: 'repeat-x',
            backgroundPosition: 'center',
            zIndex: 1,
          }}
        />
      </div>

      {/* ── The stub ────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          marginTop: -1,
          padding: 'var(--space-6) var(--space-5) var(--space-3)',
          borderRadius: '0 0 var(--radius-card) var(--radius-card)',
          background: PAPER,
          mask: notches('top'),
          WebkitMask: notches('top'),
        }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: GRAIN, opacity: 0.07, mixBlendMode: 'overlay' }} />
        <div className="relative">
          {stub}
          <FinePrint test={test} />
        </div>
      </div>
    </section>
  )
}
