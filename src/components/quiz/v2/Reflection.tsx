'use client'

/**
 * One line saying what the last answer told us.
 *
 * The smallest part of v2 and one of the most load-bearing: it is the moment
 * the interview stops feeling like a form. "Afternoon crashes on five hours'
 * sleep — that tracks" is the difference between a quiz that collects answers
 * and one that is listening.
 *
 * ── Why it floats instead of sitting in the header ──────────────────────────
 * It used to render under the hint, in the normal flow. It arrives about a
 * second after the question does — the steer is deliberately never waited for —
 * so the options below it were shoved down mid-read. A user test read that as a
 * bug, which is exactly right: content that jumps after you have started
 * reading it is broken behaviour, however nice the sentence is.
 *
 * Reserving the space instead would trade the jump for a permanent empty gap on
 * every question, and with no API key set the steer never lands at all, so the
 * gap would be all anyone ever saw.
 *
 * So it does what v1's "did you know?" aside already does on this same screen:
 * floats above the flow, pinned near the bottom, out of the layout entirely.
 * Nothing can move because of it. It is also tappable to dismiss, because an
 * overlay that cannot be got rid of is its own kind of annoying.
 */

import { useEffect, useState } from 'react'

export function Reflection({ text, reducedMotion }: { text: string | null; reducedMotion: boolean }) {
  const [dismissed, setDismissed] = useState<string | null>(null)

  // A new line is a new thing to say — an earlier dismissal should not silence
  // it forever.
  useEffect(() => { setDismissed(null) }, [text])

  if (!text || dismissed === text) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-5" style={{ bottom: 104 }}>
      <button
        onClick={() => setDismissed(text)}
        aria-label="Dismiss"
        className="pointer-events-auto flex items-start gap-2.5 max-w-md text-left rounded-2xl pl-3 pr-4 py-2.5 border backdrop-blur-md"
        style={{
          background: 'linear-gradient(100deg, rgba(0,212,255,0.14), rgba(0,212,255,0.05))',
          borderColor: 'rgba(0,212,255,0.3)',
          boxShadow: '0 8px 30px -12px rgba(0,212,255,0.45)',
          animation: reducedMotion ? undefined : 'cue-pop 0.45s cubic-bezier(0.22,1,0.36,1) both',
        }}
      >
        <span
          className="mt-0.5 shrink-0 flex items-center justify-center w-6 h-6 rounded-full"
          style={{ background: 'rgba(0,212,255,0.16)' }}
        >
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" className="text-[#00D4FF]" aria-hidden="true">
            <path d="M4 10.5L8 14.5L16 5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="min-w-0 text-[12.5px] leading-snug text-white/85">{text}</span>
      </button>
    </div>
  )
}
