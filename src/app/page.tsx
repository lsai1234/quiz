'use client'

import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  return (
    <main className="flex flex-col min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] overflow-hidden">
      {/* Background glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, color-mix(in oklch, #cfff32 12%, transparent), transparent)',
        }}
      />

      <div className="relative flex flex-col flex-1 max-w-md mx-auto w-full px-5 pt-16 pb-10">
        {/* Brand */}
        <div className="animate-[fade-in_0.4s_ease_both]">
          <span
            className="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--color-muted)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Elite Sport Supplements
          </span>
          <div
            className="mt-1 text-4xl font-black tracking-tight text-[var(--color-accent)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            CHRGD
          </div>
        </div>

        {/* Hero */}
        <div className="mt-12 animate-[fade-up_0.5s_0.1s_ease_both]">
          <h1
            className="text-[2.6rem] font-black leading-[1.05] tracking-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Build your
            <br />
            <span className="text-[var(--color-accent)]">custom stack</span>
            <br />
            in 90 seconds.
          </h1>
          <p className="mt-4 text-base text-[var(--color-text-2)] leading-relaxed">
            Answer 9 questions. Get a personalised supplement identity and a
            stack built for your exact goals, training style and budget.
          </p>
        </div>

        {/* Trust signals */}
        <div className="mt-8 flex gap-4 animate-[fade-up_0.5s_0.2s_ease_both]">
          {[
            { icon: '⚡', label: '90 seconds' },
            { icon: '🎯', label: 'Goal-matched' },
            { icon: '💷', label: 'Budget-aware' },
          ].map(({ icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 text-xs text-[var(--color-text-2)]"
            >
              <span>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Social proof strip */}
        <div className="mt-6 animate-[fade-up_0.5s_0.25s_ease_both]">
          <div
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 flex items-center gap-3"
          >
            <div className="flex -space-x-2">
              {['🏋️', '🚴', '⚽', '🏃'].map((e, i) => (
                <div
                  key={i}
                  className="w-7 h-7 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center text-sm"
                >
                  {e}
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--color-text-2)]">
              <span className="text-[var(--color-text)] font-semibold">2,400+ athletes</span>
              {' '}built their stack this week
            </p>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1 min-h-8" />

        {/* CTA */}
        <div className="animate-[fade-up_0.5s_0.35s_ease_both]">
          <button
            onClick={() => router.push('/quiz')}
            className="w-full py-4 rounded-2xl text-base font-bold tracking-wide text-[var(--color-bg)] bg-[var(--color-accent)] transition-all active:scale-95"
            style={{
              fontFamily: 'var(--font-display)',
              animation: 'pulse-glow 2s ease-in-out infinite',
            }}
          >
            Build my stack →
          </button>
          <p className="mt-3 text-center text-xs text-[var(--color-muted)]">
            Free · No account needed · Takes 90 seconds
          </p>
        </div>
      </div>
    </main>
  )
}
