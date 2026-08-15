import type { ReactNode } from 'react'

/**
 * The layered background the glass refracts.
 *
 * This component is load-bearing, not decoration. `backdrop-filter: blur()` over
 * a flat colour produces grey haze — there is nothing behind the surface to
 * bend, so a "glass" card reads as a slightly lighter rectangle and the whole
 * effect looks like a mistake. Everything above this file depends on this file.
 *
 * Four layers, in order:
 *
 * 1. **The base** — nearly black, and slightly cool rather than neutral, so the
 *    blooms have something to be a colour against.
 * 2. **Three blooms** — cyan, violet and teal, each drifting on its own long
 *    cycle. Separate elements rather than one multi-stop background, because a
 *    single gradient can only be animated as a whole and what makes this read as
 *    weather instead of as a wallpaper is that the three move independently.
 * 3. **A vignette** — pulls the corners down, which keeps the eye in the column
 *    and stops the blooms reaching the page edge where they would read as a
 *    coloured border.
 * 4. **Film grain** — the cheapest thing that separates a premium surface from a
 *    flat one. Large soft gradients band visibly on an 8-bit display; grain
 *    breaks the bands and gives the black something to be made of.
 *
 * All of it is fixed to the viewport. The ground is the room the content moves
 * through, not part of the content — scrolling it would make the page feel like
 * it has a texture rather than a depth.
 *
 * Brightness is capped in the tokens, and the cap is a contrast constraint
 * rather than a taste one: the ground sets the floor under every piece of text
 * in the app. The blooms can be as strong as they are only because the specular
 * highlight above them is a band rather than a wash, so body copy never sits in
 * the brightest part of a surface. `tokens.test.ts` holds the line.
 */

export function Ground({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative min-h-screen ${className ?? ''}`} style={{ background: 'var(--ground-base)' }}>
      {/* Inert and behind everything. `pointer-events-none` matters: these cover
          the viewport, and without it the whole page becomes a click target. */}
      <div aria-hidden className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="system-bloom system-bloom-1" />
        <div className="system-bloom system-bloom-2" />
        <div className="system-bloom system-bloom-3" />
        <div className="system-vignette" />
      </div>

      <div aria-hidden className="system-grain" />

      <div className="relative">{children}</div>
    </div>
  )
}
