'use client'

/**
 * One line saying what the last answer told us.
 *
 * The smallest part of v2 and one of the most load-bearing: it is the moment
 * the interview stops feeling like a form. "Afternoon crashes on five hours'
 * sleep — that tracks" is the difference between a quiz that collects answers
 * and one that is listening.
 *
 * It renders only when the steer arrived in time and only when it describes the
 * answer the user just gave. There is deliberately no placeholder, no skeleton
 * and no reserved space: a slot that sometimes fills a second late is worse
 * than no slot, and a quiz that waits for a compliment is a slow quiz. When it
 * is not there, nothing was there.
 */
export function Reflection({ text, reducedMotion }: { text: string | null; reducedMotion: boolean }) {
  if (!text) return null
  return (
    <p
      className="flex items-start gap-2 mt-3 text-[13px] leading-snug text-[#00D4FF]/85"
      style={{ animation: reducedMotion ? undefined : 'slide-up-in 0.32s cubic-bezier(0.22,1,0.36,1) both' }}
    >
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" className="shrink-0 mt-0.5" aria-hidden="true">
        <path d="M4 10.5L8 14.5L16 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{text}</span>
    </p>
  )
}
