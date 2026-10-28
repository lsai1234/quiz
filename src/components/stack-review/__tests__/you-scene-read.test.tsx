import { render, screen } from '@testing-library/react'
import { YouScene } from '../YouScene'
import type { ConsultRead } from '@/lib/consult/read'

jest.mock('gsap', () => ({ __esModule: true, default: { context: () => ({ revert: () => {} }), fromTo: () => {} } }))

/**
 * A consult stack's read on the results page (plan Phase 5): what Amp found,
 * in their words; habit fixes and GP lines only once approved; an unmet goal
 * said honestly, with "here's what to try instead" only when a fix follows.
 */
const read: ConsultRead = {
  consultId: 'c_x',
  identity: 'Wired and tired',
  patterns: [{ id: 'wired', name: 'Wired and tired', line: 'Caffeine late in the day, slow to drop off, then a crash.', state: 'yes', evidence: ['4 coffees a day', 'Last caffeine about 5pm'] }],
  found: null,
  words: null,
  profile: null,
  habits: [{ id: 'caffeine-cut-off', text: 'Have your last caffeine by 2pm.', source: { label: 'NHS: How to get to sleep', url: 'https://www.nhs.uk/' }, ring: null }],
  gp: [{ id: 'always-tired', text: 'If you’ve felt this tired for a few weeks…', source: { label: 'NHS: Tiredness and fatigue', url: 'https://www.nhs.uk/' } }],
  unmet: [{ goal: 'focus', habit: { id: 'walk-and-think', text: 'A brisk walk…', source: { label: 'NHS', url: 'https://www.nhs.uk/' }, ring: null } }],
  checked: ['Kept out: CHRGD Pre-Workout, because one caffeine source is enough'],
  products: {},
}

it('shows the read: the pattern, its line and their own words', () => {
  render(<YouScene name="Sam" stackName="Wired and tired" items={[]} checks={read.checked} read={read} reducedMotion />)
  const section = document.querySelector('[data-read]') as HTMLElement
  expect(section).toHaveTextContent('Wired and tired')
  expect(section).toHaveTextContent('Caffeine late in the day')
  expect(screen.getByText('“4 coffees a day”')).toBeInTheDocument()
  expect(screen.getByText(read.checked[0])).toBeInTheDocument()
})

it('shows the approved habit fixes and GP lines, each with its source (approved 2026-10-28)', () => {
  render(<YouScene name="Sam" stackName="Wired and tired" items={[]} checks={[]} read={read} reducedMotion />)
  expect(document.querySelector('[data-habit="caffeine-cut-off"]')).toHaveTextContent('Have your last caffeine by 2pm.')
  expect(document.querySelector('[data-gp]')).toHaveTextContent('If you’ve felt this tired')
  expect(screen.getByText(/what to try instead/)).toBeInTheDocument()
})

it('shows no line that isn’t approved, and promises no fix for an unmet goal without one', () => {
  const unapproved: ConsultRead = {
    ...read,
    habits: [{ ...read.habits[0], id: 'not-approved' }],
    gp: [{ ...read.gp[0], id: 'not-approved' }],
    unmet: [{ goal: 'focus', habit: { ...read.unmet[0].habit!, id: 'not-approved' } }],
  }
  render(<YouScene name="Sam" stackName="Wired and tired" items={[]} checks={[]} read={unapproved} reducedMotion />)
  expect(document.querySelector('[data-habit]')).toBeNull()
  expect(document.querySelector('[data-gp]')).toBeNull()
  expect(screen.getByText('Nothing we stock is right for focus.')).toBeInTheDocument()
  expect(screen.queryByText(/what to try instead/)).toBeNull()
})
