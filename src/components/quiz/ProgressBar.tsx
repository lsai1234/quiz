'use client'

const TOTAL_STEPS = 9

export function ProgressBar({ step }: { step: number }) {
  const pct = Math.round(((step + 1) / TOTAL_STEPS) * 100)

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs text-[var(--color-muted)]">
          Step {step + 1} of {TOTAL_STEPS}
        </span>
        <span className="text-xs font-semibold text-[var(--color-accent)]">{pct}%</span>
      </div>
      <div className="h-1 w-full rounded-full bg-[var(--color-border)]">
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
