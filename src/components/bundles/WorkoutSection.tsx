'use client'

import type { BundleWorkout } from '@/lib/bundles'

interface Props {
  workout: BundleWorkout
  seriesName: string
}

function PhaseLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] font-bold tracking-widest uppercase mb-2"
      style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)' }}
    >
      {children}
    </p>
  )
}

export function WorkoutSection({ workout, seriesName }: Props) {
  return (
    <div className="px-5 pt-8 max-w-lg mx-auto">
      <p
        className="text-[10px] font-bold tracking-widest uppercase mb-4"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--color-muted)' }}
      >
        The workout — {seriesName}
      </p>

      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {/* Header */}
        <div className="p-5 pb-4">
          <h2
            className="text-2xl font-black leading-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
          >
            {workout.title}
          </h2>
          <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
            {workout.intro}
          </p>
        </div>

        {/* Warm-up */}
        <div className="px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <PhaseLabel>Warm-up</PhaseLabel>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {workout.warmup}
          </p>
        </div>

        {/* Main session */}
        <div className="px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <PhaseLabel>Main session</PhaseLabel>
          <div className="space-y-1">
            {workout.exercises.map((ex, i) => (
              <div
                key={ex.name}
                className="flex items-center justify-between gap-3 py-2"
                style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : undefined}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black"
                    style={{
                      fontFamily: 'var(--font-display)',
                      color: 'var(--color-accent)',
                      background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                    {ex.name}
                  </span>
                </div>
                <span
                  className="text-xs font-bold flex-shrink-0"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)' }}
                >
                  {ex.prescription}
                </span>
              </div>
            ))}
          </div>

          {/* The rule */}
          <div
            className="mt-3 px-3 py-2.5 rounded-xl text-xs font-semibold leading-snug"
            style={{
              color: 'var(--color-accent)',
              background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
            }}
          >
            The rule: {workout.rule}
          </div>
        </div>

        {/* Finisher + post-workout */}
        <div className="px-5 py-4 grid grid-cols-2 gap-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div>
            <PhaseLabel>Finisher</PhaseLabel>
            <p className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--color-text)' }}>
              {workout.finisher}
            </p>
          </div>
          <div>
            <PhaseLabel>Post-workout</PhaseLabel>
            <p className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--color-text)' }}>
              {workout.postWorkout}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
