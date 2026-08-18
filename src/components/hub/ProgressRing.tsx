'use client'

interface Props {
  /** 0–1. */
  pct: number
  size?: number
  stroke?: number
  color?: string
  /** Tiny label rendered in the centre (e.g. an icon or week number). */
  children?: React.ReactNode
}

/** A small circular progress ring for "building" products. */
export function ProgressRing({ pct, size = 38, stroke = 3, color = 'var(--accent)', children }: Props) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, pct))

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--edge)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - clamped)}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      {children != null && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            fontSize: 'var(--text-meta)',
            fontWeight: 'var(--weight-display)',
            fontFamily: 'var(--font-display)',
            color,
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
