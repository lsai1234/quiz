'use client'

import { Badge } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import { TRAINER_COPY as C } from '@/lib/trainer/copy'

/**
 * The trainer's face: their photo, or their initial on the accent, with a
 * tick that says a real person is behind it (never an "online" light: we
 * don't know that, and won't pretend to).
 */
export function TrainerAvatar({ name, photoUrl, size = 48 }: { name: string; photoUrl: string | null; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size, borderRadius: 'var(--radius-pill)', objectFit: 'cover', border: '2px solid var(--accent-line)' }}
        />
      ) : (
        <span
          className="hub-figure inline-flex items-center justify-center"
          style={{
            width: size,
            height: size,
            borderRadius: 'var(--radius-pill)',
            background: 'var(--fill-accent)',
            color: 'var(--ink-on-accent)',
            fontSize: size >= 48 ? 'var(--text-title)' : 'var(--text-body)',
            boxShadow: '0 0 var(--space-4) var(--accent-glow)',
          }}
        >
          {name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span
        className="absolute inline-flex items-center justify-center"
        style={{
          right: -2,
          bottom: -2,
          width: Math.max(16, Math.round(size * 0.36)),
          height: Math.max(16, Math.round(size * 0.36)),
          borderRadius: 'var(--radius-pill)',
          background: 'var(--fill-positive)',
          color: 'var(--ink-on-accent)',
          border: '2px solid var(--surface-solid)',
        }}
      >
        <Icon name="check" size={Math.max(9, Math.round(size * 0.2))} />
      </span>
    </span>
  )
}

export function RealBadge() {
  return (
    <Badge tone="positive" dot>
      {C.realPerson}
    </Badge>
  )
}

/** "Today 14:05", "Yesterday 09:12", "6 Nov, 14:05". */
export function when(at: string, now = new Date()): string {
  const d = new Date(at)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const day = (x: Date) => x.toISOString().slice(0, 10)
  if (day(d) === day(now)) return `${C.today} ${time}`
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return `${C.yesterday} ${time}`
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`
}
