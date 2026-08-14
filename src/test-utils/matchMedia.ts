/**
 * Force `prefers-reduced-motion` on or off for a test.
 *
 * `jest.setup.ts` installs a stub that always answers "no preference", which is
 * the path most visitors take. Call this when the point of the test is the other
 * path — that an animation is skipped, a sheet closes instantly, a shimmer stops.
 *
 * Returns a restore function; call it in `afterEach` so the preference doesn't
 * leak into the next test in the file.
 */
export function setReducedMotion(reduced: boolean): () => void {
  const previous = window.matchMedia

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduced : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })

  return () => {
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: previous })
  }
}
