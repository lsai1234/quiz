'use client'

import { useEffect, useState } from 'react'

interface LiveFeedbackProps {
  message: string
  onDismiss: () => void
}

export function LiveFeedback({ message, onDismiss }: LiveFeedbackProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Slight delay so the animation triggers after mount
    const t = setTimeout(() => setVisible(true), 20)
    return () => clearTimeout(t)
  }, [])

  function handleDismiss() {
    setVisible(false)
    setTimeout(onDismiss, 300)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center px-4 pb-10 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ background: 'rgba(9,9,11,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={handleDismiss}
    >
      <div
        className={`w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl transition-transform duration-300 ${
          visible ? 'translate-y-0' : 'translate-y-8'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent flash */}
        <div className="mb-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
          <span
            className="text-xs font-semibold tracking-widest uppercase text-[var(--color-accent)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Building your profile
          </span>
        </div>

        <p className="text-sm leading-relaxed text-[var(--color-text-2)]">{message}</p>

        <button
          onClick={handleDismiss}
          className="mt-4 w-full py-3 rounded-xl bg-[var(--color-surface-2)] text-sm font-semibold text-[var(--color-text)] active:opacity-70 transition-opacity"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Got it, keep going →
        </button>
      </div>
    </div>
  )
}
