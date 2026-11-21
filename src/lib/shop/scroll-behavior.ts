/**
 * How the shop scrolls when it moves you somewhere: smoothly, unless the
 * visitor has asked for less motion, in which case it jumps. Browsers do not
 * apply `prefers-reduced-motion` to `scrollIntoView` on their own.
 */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'auto'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}
