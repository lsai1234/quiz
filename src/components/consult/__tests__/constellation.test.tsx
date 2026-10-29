import { fireEvent, render, screen } from '@testing-library/react'
import { Constellation } from '../pinpoint/Constellation'
import { eligiblePatterns } from '@/lib/consult/pinpoint/leads'
import { PROBE_BY_ID } from '@/lib/consult/pinpoint/library'
import { personFor } from '@/lib/consult/pinpoint/__tests__/simulate'
import type { ConsultAnswers } from '@/lib/consult/types'

/** Watch Amp think (plan Phase 7.5), on screen. */
const wired = personFor('everyday', ['wired', 'crash'])
const answered: ConsultAnswers = { ...wired, pinpoint: { steps: [{ kind: 'probe', probe: 'tired-then-awake', answer: { main: 'me' }, stage: 'pinpoint' }], stopped: false, started: true } }

describe('the strip, in the round', () => {
  it('draws a star for every eligible pattern, and opens What I’m thinking', () => {
    const open = jest.fn()
    render(<Constellation size="strip" answers={wired} onOpen={open} />)
    expect(document.querySelectorAll('[data-constellation="strip"] [data-star]')).toHaveLength(eligiblePatterns(wired).length)
    fireEvent.click(screen.getByRole('button', { name: /^What I’m thinking: \d+ leads?\. Narrowing it down: \d+/ }))
    expect(open).toHaveBeenCalled()
  })

  it('rings what the question on screen is splitting', () => {
    render(<Constellation size="strip" answers={wired} probe={PROBE_BY_ID['tired-then-awake']} />)
    expect(document.querySelector('[data-star="wired"] [data-splitting]')).not.toBeNull()
  })

  it('after an answer, sends a pulse from it into each pattern it moved', () => {
    render(<Constellation size="strip" answers={answered} />)
    expect(document.querySelector('[data-pulse="wired"]')).not.toBeNull()
    expect(document.querySelector('[data-pulse="wired"]')).toHaveClass('amp-pulse')
  })
})

describe('the full constellation', () => {
  it('names the contenders, four at most, with the counter under it', () => {
    render(<Constellation size="lg" answers={answered} label="Amp’s leads so far" />)
    expect(screen.getByRole('img', { name: /^Amp’s leads so far\. Narrowing it down: / })).toBeInTheDocument()
    const names = document.querySelectorAll('[data-constellation="lg"] text')
    expect(names.length).toBeGreaterThan(0)
    expect(names.length).toBeLessThanOrEqual(4)
    expect(document.querySelector('[data-narrowing]')).toHaveTextContent(/^Narrowing it down: \d+( → \d+)*$/)
  })
})

describe('under reduced motion', () => {
  const original = window.matchMedia
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...original(q), matches: q.includes('reduce') })) as typeof window.matchMedia
  })
  afterEach(() => {
    window.matchMedia = original
  })

  it('is a ranked list with bars, and the strip is the plain count', () => {
    const { unmount } = render(<Constellation size="lg" answers={answered} />)
    const list = screen.getByRole('list', { name: 'Narrowing it down' })
    expect(list.querySelectorAll('li').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img', { name: /^(strong|likely|possible)$/ }).length).toBeGreaterThan(0)
    expect(document.querySelector('[data-pulse]')).toBeNull()
    unmount()
    render(<Constellation size="strip" answers={answered} />)
    expect(screen.getByRole('button', { name: /^What I’m thinking/ })).toHaveTextContent(/^Leads · \d+$/)
  })
})
