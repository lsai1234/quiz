import { render } from '@testing-library/react'
import { BeforeDashboard } from '../BeforeDashboard'
import { AfterDashboard } from '../AfterDashboard'

/**
 * The comparison has to be a comparison of design and nothing else.
 *
 * This is the test that makes the A/B worth running. It is trivially easy — and
 * very tempting — to win a design comparison by giving the new arm better copy,
 * an extra reassurance, a clearer label, one more piece of information. Any of
 * those turns "which looks better" into "which says more", and the result stops
 * meaning what it will be reported as meaning.
 *
 * So: both arms must render the same words, the same figures and the same
 * actions. If this fails, either fix the arm that drifted or stop calling the
 * result a design preference.
 */

/** Every visible string, in order, whitespace collapsed. */
function words(container: HTMLElement): string[] {
  return (container.textContent ?? '')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
}

describe('the two arms of the comparison', () => {
  it('render exactly the same words', () => {
    const before = render(<BeforeDashboard />)
    const after = render(<AfterDashboard />)

    expect(words(after.container)).toEqual(words(before.container))
  })

  it('offer the same actions, with the same labels', () => {
    const before = render(<BeforeDashboard />)
    const after = render(<AfterDashboard />)

    const labels = (c: HTMLElement) =>
      [...c.querySelectorAll('button')].map((b) => b.textContent?.trim()).sort()

    expect(labels(after.container)).toEqual(labels(before.container))
  })

  it('show the same number of products', () => {
    const before = render(<BeforeDashboard />)
    const after = render(<AfterDashboard />)

    const count = (c: HTMLElement) => (c.textContent?.match(/every month|every 2 months/g) ?? []).length
    expect(count(after.container)).toBe(count(before.container))
    expect(count(before.container)).toBeGreaterThan(0)
  })

  it('is built from the real current components, not a sketch of them', () => {
    // The control arm's whole value is that it is what the hub runs on today. If
    // it stopped importing the live primitives it would be a straw man, and a
    // flattering one.
    const source = require('fs').readFileSync(
      'src/components/styleguide/compare/BeforeDashboard.tsx',
      'utf8',
    )
    expect(source).toContain("from '@/components/ui/Button'")
    expect(source).toContain("from '@/components/ui/Card'")
    expect(source).toContain("from '@/lib/ui/tokens'")
    // And it must not reach for the new system at all.
    expect(source).not.toContain('@/components/system')
  })
})
