'use client'

import type { BundleHowToStep } from '@/lib/bundles'

interface Props {
  steps: BundleHowToStep[]
}

export function BundleHowTo({ steps }: Props) {
  return (
    <div className="px-5 pt-8 max-w-lg mx-auto">
      <p
        className="text-[10px] font-bold tracking-widest uppercase mb-4"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--color-muted)' }}
      >
        How to run the reset
      </p>

      <div
        className="rounded-2xl p-5 space-y-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {steps.map((step, i) => (
          <div key={step.title} className="flex gap-3.5">
            <span
              className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--color-bg)',
                background: 'var(--color-accent)',
              }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
                {step.title}
              </p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
                {step.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
