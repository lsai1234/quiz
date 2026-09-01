/**
 * The brake on guessing at codes.
 *
 * Not a lock, and the module says so — per-instance and in-memory. What these
 * assert is the shape: rejections count, successes do not, and the window
 * slides so a script that keeps guessing keeps the door shut.
 */
import { __resetCodeGuessLimit, codeAttemptAllowed, recordCodeMiss } from '@/lib/founder-codes/guess-limit'

beforeEach(() => __resetCodeGuessLimit())

const MISSES_ALLOWED = 20

describe('a client working through codes', () => {
  it('is let through until it has missed too many times', () => {
    for (let i = 0; i < MISSES_ALLOWED; i++) {
      expect(codeAttemptAllowed('1.2.3.4')).toBe(true)
      recordCodeMiss('1.2.3.4')
    }
    expect(codeAttemptAllowed('1.2.3.4')).toBe(false)
  })

  it('does not shut the door on anybody else', () => {
    for (let i = 0; i < MISSES_ALLOWED; i++) recordCodeMiss('1.2.3.4')
    expect(codeAttemptAllowed('5.6.7.8')).toBe(true)
  })

  it('keeps the door shut for as long as it keeps guessing', () => {
    const start = 1_000_000
    for (let i = 0; i < MISSES_ALLOWED; i++) recordCodeMiss('1.2.3.4', start)
    // Nine minutes later, one more miss — the window slides rather than resetting.
    recordCodeMiss('1.2.3.4', start + 9 * 60_000)
    expect(codeAttemptAllowed('1.2.3.4', start + 19 * 60_000)).toBe(false)
    // Ten quiet minutes after that last miss and it is forgotten.
    expect(codeAttemptAllowed('1.2.3.4', start + 20 * 60_000)).toBe(true)
  })

  it('never counts a code that worked', () => {
    // A founder redeeming their own codes must not walk themselves into a
    // lockout — only rejections are recorded, and the route only records one
    // when a code is refused.
    for (let i = 0; i < 100; i++) expect(codeAttemptAllowed('1.2.3.4')).toBe(true)
  })

  it('treats an unidentifiable caller as one bucket rather than as unlimited', () => {
    for (let i = 0; i < MISSES_ALLOWED; i++) recordCodeMiss(null)
    expect(codeAttemptAllowed(null)).toBe(false)
  })
})
