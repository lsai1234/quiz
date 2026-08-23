/**
 * @jest-environment node
 */
import { fingerprint } from '../fingerprint'

/**
 * The fingerprint hash is hand-rolled (two 32-bit FNV-1a lanes — see
 * `fingerprint.ts` for why it cannot be `crypto.createHash`), so the properties
 * a stock hash would give for free are asserted here instead.
 *
 * A collision is not a crash. It is two unrelated bugs silently merged into one
 * row, where resolving one appears to resolve the other — the exact failure the
 * grouping design is meant to avoid, and one nothing else would catch.
 */
describe('the grouping hash', () => {
  it('does not collide across far more distinct faults than this app will produce', () => {
    const seen = new Map<string, string>()
    const surfaces = ['quiz', 'shop', 'myhub', 'checkout', 'webhook'] as const
    let collisions = 0

    for (let i = 0; i < 25_000; i++) {
      const surface = surfaces[i % surfaces.length]
      const message = `Failure kind ${i} in module ${i % 977}`
      const stack = `Error: x\n    at f (/app/src/lib/m${i % 313}.ts:${i % 97}:1)`
      const shape = `${surface}|${message}|${stack}`

      const fp = fingerprint({ surface, message, stack })
      const previous = seen.get(fp)
      if (previous !== undefined && previous !== shape) collisions++
      seen.set(fp, shape)
    }

    expect(collisions).toBe(0)
    expect(seen.size).toBe(25_000)
  })

  /**
   * Note the messages here are made of letters, not numbers.
   *
   * `normaliseMessage` replaces digits with `<n>`, so "message 1" and
   * "message 2" are *deliberately* one fingerprint — they are one fault with a
   * varying id, which is the entire point of the grouping. Generating inputs
   * that differ only numerically would measure normalisation and report a
   * hash collision that is really a design success.
   */
  it('spreads evenly, so no one bucket attracts unrelated faults', () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz'
    const word = (i: number) =>
      `${letters[i % 26]}${letters[(i >> 5) % 26]}${letters[(i >> 10) % 26]}`

    const buckets = new Array(16).fill(0)
    const distinct = new Set<string>()
    for (let i = 0; i < 16_000; i++) {
      const message = `Cannot read property ${word(i)} of ${word(i * 7 + 3)}`
      const fp = fingerprint({ surface: 'shop', message })
      distinct.add(fp)
      buckets[parseInt(fp[0], 16)]++
    }

    // Guards the test itself: if normalisation collapsed these the bucket
    // assertion below would be measuring nothing.
    expect(distinct.size).toBeGreaterThan(10_000)

    // Uniform would be 1000 per bucket; the slack is wide enough not to be
    // flaky and tight enough to catch a hash that has genuinely clumped.
    for (const n of buckets) expect(n).toBeGreaterThan(700)
  })
})
