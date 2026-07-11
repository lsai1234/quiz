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
