import { isClean } from '../../ai/copy'
import { looksMedical } from '../../ai/guard'
import { EMPTY_ANSWERS } from '../../types'
import { PATTERNS, PROBES, PROBE_BY_ID } from '../library'
import { likelihoods } from '../model'
import { touches } from '../leads'
import type { Probe } from '../types'

const text = (p: Probe) => (typeof p.text === 'function' ? p.text({ ...EMPTY_ANSWERS, energy: 8 }) : p.text ?? '')

/** Every word the person could read from this probe. */
function words(p: Probe): string[] {
  const out = [p.question, p.scene ?? '', text(p)]
  for (const item of p.items) {
    if (item.text) out.push(item.text)
    for (const o of item.options) {
      if (p.format !== 'day-line' || !p.dayLine?.buckets.some((b) => b.key === o.key)) out.push(o.label)
      if (o.said) out.push(o.said)
    }
  }
  if (p.dayLine) out.push(p.dayLine.said(16 * 60))
  return out.filter(Boolean)
}

describe('the Pinpoint library', () => {
  it('has sixteen patterns, each with a unique id, a name, a line and a reason', () => {
    expect(PATTERNS).toHaveLength(16)
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(16)
    for (const p of PATTERNS) {
      expect(p.name.length).toBeGreaterThan(3)
      expect(p.line.length).toBeGreaterThan(10)
      expect(p.because).toMatch(/^For /)
      expect(p.effects.length).toBeGreaterThan(0)
      expect(p.journeys.length).toBeGreaterThan(0)
    }
  })

  it('tests every pattern with at least three probes', () => {
    for (const p of PATTERNS) expect([p.id, PROBES.filter((q) => touches(q, p.id)).length >= 3]).toEqual([p.id, true])
  })

  it('has probes with unique ids that each point at something', () => {
    expect(new Set(PROBES.map((p) => p.id)).size).toBe(PROBES.length)
    expect(PROBES.length).toBeGreaterThanOrEqual(55)
    for (const p of PROBES) expect(PATTERNS.some((pat) => touches(p, pat.id))).toBe(true)
    expect(PROBE_BY_ID['eleven-pm'].format).toBe('this-or-that')
  })

  it('uses every format', () => {
    for (const f of ['scenario', 'this-or-that', 'how-often', 'day-line', 'quick-fire']) expect(PROBES.some((p) => p.format === f)).toBe(true)
  })

  it('keeps every scenario short enough for a phone', () => {
    for (const p of PROBES) expect([p.id, text(p).length <= 125]).toEqual([p.id, true])
    for (const p of PROBES) for (const item of p.items) for (const o of item.options) expect([p.id, o.label.length <= 60]).toEqual([p.id, true])
  })

  it('never says a product, a dose, a claim or a condition', () => {
    const all = [...PATTERNS.flatMap((p) => [p.name, p.line, p.because]), ...PROBES.flatMap(words)]
    for (const w of all) {
      expect([w, isClean(w)]).toEqual([w, true])
      expect([w, looksMedical(w)]).toEqual([w, false])
    }
  })

  it('gives every item a proper answer distribution, and every link a real effect', () => {
    for (const p of PROBES) {
      for (const item of p.items) {
        expect(item.base).toHaveLength(item.options.length)
        expect(item.base.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 5)
        for (const pat of PATTERNS) {
          const l = likelihoods(item, pat.id)
          if (!l) continue
          expect(l.fits.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 5)
          expect(l.doesnt.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 5)
        }
      }
    }
  })

  it('lays day lines out in order, inside their own ends', () => {
    for (const p of PROBES.filter((q) => q.dayLine)) {
      const d = p.dayLine!
      expect(d.start).toBeGreaterThanOrEqual(d.from)
      expect(d.start).toBeLessThanOrEqual(d.to)
      const ends = d.buckets.map((b) => b.until)
      expect([...ends].sort((a, b) => a - b)).toEqual(ends)
      expect(ends[ends.length - 1]).toBeGreaterThanOrEqual(d.to)
    }
  })
})
