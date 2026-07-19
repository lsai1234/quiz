import type { CSSProperties } from 'react'

/**
 * The getCHRGD brand mark — the battery cell, the stacked charge-bars and the
 * signature bolt, faithful to the master logo. The bolt is lifted off the bars
 * by a hairline keyline (the surface colour) so it stays crisp at any size, and
 * the whole mark sits on a transparent background. Colours are theme-driven:
 * `tone` paints the cell/bars, `accent` the bolt, `keyline` the bolt outline.
 */
export function CHRGDMark({
  size = 22,
  tone = 'currentColor',
  accent = 'var(--color-accent)',
  keyline = 'var(--color-bg)',
  className,
  style,
}: {
  size?: number
  tone?: string
  accent?: string
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
        fill={accent}
        stroke={keyline}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The full logo lockup: the mark + the "getCHRGD" wordmark, `get` muted and
 * `CHRGD` solid. Transparent background; size the wordmark from the parent via
 * `wordClassName`, the mark via `markSize`.
 */
export function CHRGDLogo({
  markSize = 22,
  className,
  wordClassName = 'text-lg',
}: {
  markSize?: number
  className?: string
  wordClassName?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <CHRGDMark size={markSize} />
      <span
        className={`leading-none tracking-tight ${wordClassName}`}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        <span className="font-semibold" style={{ color: 'var(--color-muted)' }}>get</span>
        <span className="font-black" style={{ color: 'var(--color-text)' }}>CHRGD</span>
      </span>
    </span>
  )
}

/**
 * The standalone bolt — the brand's charge glyph, for the small accents that
 * were carrying a ⚡ emoji. Monochrome (accent by default), crisp at any size.
 */
export function CHRGDBolt({
  size = 16,
  color = 'var(--color-accent)',
  className,
  style,
}: {
  size?: number
  color?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      width={Math.round(size * 0.62)}
      height={size}
      viewBox="30 20 48 79"
      fill="none"
      className={className}
      style={style}
      aria-hidden
    >
      <path d="M58 22L32 62H51L40 97L76 52H57L58 22Z" fill={color} />
    </svg>
  )
}
