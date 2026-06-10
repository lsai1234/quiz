'use client'

import type { StackLevel } from '@/lib/types'

const LEVELS: Array<{ id: StackLevel; label: string; description: string }> = [
  { id: 'essentials', label: 'Essentials', description: 'Core only' },
  { id: 'performance', label: 'Performance', description: 'Well-rounded' },
  { id: 'complete', label: 'Complete', description: 'Full coverage' },
]

interface Props {
  current: StackLevel
  onChange: (level: StackLevel) => void
}

export function LevelSelector({ current, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
      {LEVELS.map(({ id, label, description }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`py-2.5 px-2 rounded-xl text-center transition-all ${
            current === id
              ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
              : 'text-[var(--color-text-2)]'
          }`}
        >
          <div
            className="text-xs font-bold"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {label}
          </div>
          <div
            className={`text-[10px] mt-0.5 ${current === id ? 'text-[var(--color-bg)]/70' : 'text-[var(--color-muted)]'}`}
          >
            {description}
          </div>
        </button>
      ))}
    </div>
  )
}
