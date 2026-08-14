import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

// jsdom lacks TextEncoder/TextDecoder; `pg` needs them for SCRAM auth.
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder
}

// Tests hit an in-memory database instead of .data/chrgd.db (unless a test run
// explicitly points DATABASE_URL at a Postgres instance).
process.env.DATABASE_PATH = ':memory:'

/**
 * jsdom has no `matchMedia`, and anything that checks `prefers-reduced-motion`
 * needs one. It answers "no preference" — the animated path — so tests exercise
 * the behaviour most visitors get. A test that wants the reduced path redefines
 * `window.matchMedia` itself (see `src/test-utils/matchMedia.ts`).
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
