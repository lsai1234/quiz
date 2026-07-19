import type { CSSProperties, ReactNode } from 'react'

const ACCENT = '#00D4FF'

/**
 * The getCHRGD brand mark — the battery cell, the stacked charge-bars and the
 * signature bolt, faithful to the master logo. The bolt is lifted off the bars
 * by a hairline keyline (the surface colour) so it stays crisp at any size.
 * Renders on a transparent background; `tone` sets the cell/bar colour (white on
 * dark surfaces) and `keyline` the bolt separation (defaults to the app dark).
 */
export function CHRGDMark({
  size = 20,
  tone = '#FFFFFF',
  keyline = '#0A0A0A',
  className,
  style,
}: {
  size?: number
  tone?: string
  keyline?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      width={size}
      height={Math.round(size * 1.15)}
      viewBox="0 0 100 115"
      fill="none"
      className={className}
      style={style}
      aria-hidden
    >
      {/* positive terminal */}
      <rect x="37" y="0" width="26" height="12" rx="6" fill={tone} />
      {/* battery cell */}
      <rect x="7" y="11" width="86" height="101" rx="30" fill="none" stroke={tone} strokeWidth="8" />
      {/* charge bars — the stacked motif joined on the right */}
      <rect x="22" y="29" width="45" height="12" rx="4" fill={tone} />
      <rect x="22" y="49" width="45" height="12" rx="4" fill={tone} />
      <rect x="55" y="29" width="12" height="32" rx="4" fill={tone} />
      {/* signature bolt, keylined off the bars so it never muddies */}
      <path
        d="M58 22L32 62H51L40 97L76 52H57L58 22Z"
        fill={ACCENT}
        stroke={keyline}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The full logo lockup: the mark + the "getCHRGD" wordmark, with `get` muted and
 * `CHRGD` as the solid wordmark. Transparent background, tidy baseline. Size the
 * wordmark from the parent via `wordClassName`; the mark scales with `markSize`.
 */
export function CHRGDLogo({
  markSize = 18,
  className,
  wordClassName = 'text-[13px]',
  trailing,
}: {
  markSize?: number
  className?: string
  wordClassName?: string
  /** Optional element rendered after the wordmark (e.g. a context label). */
  trailing?: ReactNode
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <CHRGDMark size={markSize} />
      <span
        className={`leading-none ${wordClassName}`}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        <span className="font-semibold tracking-tight text-white/45">get</span>
        <span className="font-black tracking-tight text-white">CHRGD</span>
      </span>
      {trailing}
    </span>
  )
}
