'use client'

import { useEffect } from 'react'

/**
 * The height of the bit of screen the browser is actually giving us.
 *
 * ── Why `100dvh` was not enough ─────────────────────────────────────────────
 * The quiz is a fixed app shell: a header, a scrolling middle, and a Continue
 * button pinned to the bottom. That only works if the shell is exactly as tall
 * as the visible area. `100dvh` is supposed to be that — the "dynamic" viewport,
 * excluding browser chrome — and in a normal tab it is.
 *
 * It is not, reliably, in the browsers a lot of people actually arrive in. Some
 * in-app webviews (a link opened from Messages, Instagram, TikTok) and some
 * Android Chrome versions resolve `dvh` against the LARGE viewport — the height
 * the page would have if the toolbars were hidden — while the toolbars are
 * sitting there covering the bottom of the screen. The shell is then taller
 * than the window, and the button at its bottom edge is underneath the
 * browser's own bar. Nothing is broken visually, so it reads as a dead end: the
 * page just has no way to continue.
 *
 * ── What this does instead ──────────────────────────────────────────────────
 * Measures it. `window.innerHeight` is the layout viewport, which excludes the
 * browser chrome that is actually on screen, and every engine agrees on it.
 * The value lands on `--app-height`, and the app shells size to it with
 * `100dvh` left as the fallback for anywhere the script has not run.
 *
 * ── Why `innerHeight` and not `visualViewport.height` ───────────────────────
 * `visualViewport` is more precise but it also shrinks when the on-screen
 * keyboard opens. The quiz has a text field on the about-you screen, and
 * collapsing the whole shell to the strip above the keyboard while someone
 * types their name is a worse bug than the one being fixed. `innerHeight`
 * ignores the keyboard and tracks the toolbars, which is exactly the pair of
 * behaviours wanted here.
 */

/**
 * The first measurement, taken before anything paints.
 *
 * An effect would not do on its own: it runs after hydration, and on a mid-range
 * phone that is a second or two of the broken layout — long enough for someone
 * to look for the button, not find it, and leave. This runs while the parser is
 * still on the opening of `<body>`, so the first frame is already right and the
 * component below only has to keep it that way.
 */
export const VIEWPORT_HEIGHT_SNIPPET =
  `document.documentElement.style.setProperty('--app-height',window.innerHeight+'px')`

export function ViewportHeight() {
  useEffect(() => {
    const set = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
    }
    set()

    window.addEventListener('resize', set)
    // Orientation lands before the new height is readable on some engines, so
    // it gets a second look on the next frame as well as an immediate one.
    const onOrientation = () => { set(); requestAnimationFrame(set) }
    window.addEventListener('orientationchange', onOrientation)
    // Returning to a backgrounded tab can restore different chrome than it left.
    window.addEventListener('pageshow', set)

    return () => {
      window.removeEventListener('resize', set)
      window.removeEventListener('orientationchange', onOrientation)
      window.removeEventListener('pageshow', set)
    }
  }, [])

  return null
}
