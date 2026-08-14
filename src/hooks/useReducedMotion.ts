'use client'

import { useEffect, useState } from 'react'

/**
 * Whether the visitor has asked for less motion.
 *
 * Ten components currently do this by hand, and all ten do it the same slightly
 * wrong way — read `matchMedia` once in an effect and never listen again, so
 * someone who turns the setting on mid-session keeps the animations until they
 * reload. This listens.
 *
 * Starts `false` so the server and the first client render agree; the effect
 * corrects it before paint. Anything that must not animate for a single frame
 * should key off this value rather than starting an animation and stopping it.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)

    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}
