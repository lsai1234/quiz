import { act, render, screen, within } from '@testing-library/react'
import { YouScene, YOU_SCENE_COPY, firstNameOf, greetingFor, type YouSceneItem } from '../YouScene'
import { YOU_PALETTE } from '../you-palette'
import { StackReviewPage, deckHeading } from '../StackReviewPage'
import { StackHero } from '../StackHero'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { invalidateCatalogue } from '@/lib/catalogue/load'
import { CLAIMS } from '@/lib/consult/claims'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { CHECK_LINES, GOAL_LINES, RESULTS_HEADINGS } from '@/lib/results'
import { defaultAnswers, useQuizStore } from '@/lib/store'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'

jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }))

/**
 * The You scene: one name for the stack, the answers it was built from, and
 * what we checked. No AI identity, and no goal beside a product without the
 * register's claim beside it.
 */

const byGroup = (group: string): CatalogueProduct => MOCK_CATALOGUE.find((p) => p.swapGroup === group)!
const WHEY = byGroup('protein-whey')
const MAGNESIUM = byGroup('magnesium')
const OTHER = MOCK_CATALOGUE.find((p) => p.id !== WHEY.id && p.id !== MAGNESIUM.id)!

const item = (product: CatalogueProduct, explanation: YouSceneItem['explanation'] = null): YouSceneItem => ({
  key: `slot-${product.id}`,
  product,
  slotType: product.stackSlots[0],
  explanation,
})

const GOAL_ITEM = item(WHEY, {
  kind: 'goal',
  goal: 'muscle',
  sentence: GOAL_LINES.muscle!,
  claim: CLAIMS['protein-muscle-growth'],
})
const ANSWER_ITEM = item(MAGNESIUM, {
  kind: 'answer',
  field: 'diet',
  value: 'poor',
  sentence: 'You said your meals are all over the place right now.',
  claim: CLAIMS['magnesium-tiredness'],
})

function channel(v: number): number {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('the greeting', () => {
  it('uses the first name they typed, capitalised', () => {
    expect(greetingFor('Alex')).toBe('Alex, here’s your stack')
    expect(greetingFor('  alex smith ')).toBe('Alex, here’s your stack')
    expect(firstNameOf('jo')).toBe('Jo')
  })

  it('says it plainly without a name', () => {
    expect(greetingFor(null)).toBe('Here’s your stack')
    expect(greetingFor('   ')).toBe('Here’s your stack')
  })
})

describe('YouScene', () => {
  it('heads the scene with the greeting and the stack’s one name', () => {
    render(<YouScene name="Alex" stackName="Strength Engine Stack" items={[GOAL_ITEM]} checks={[]} reducedMotion />)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('Alex, here’s your stack')
    expect(heading).toHaveTextContent('Strength Engine Stack')
    expect(document.getElementById('scene-you')).toContainElement(heading)
  })

  it('shows nothing from the AI identity card', () => {
    render(<YouScene name="Alex" stackName="Strength Engine Stack" items={[GOAL_ITEM]} checks={['x']} reducedMotion />)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/fully charged|supplement identity|routine fit|focus areas|\/100/i)
  })

  it('puts the claim beside every goal line, verbatim and quoted', () => {
    render(<YouScene stackName="S" items={[GOAL_ITEM]} checks={[]} reducedMotion />)
    const row = document.querySelector(`[data-explained="${WHEY.id}"]`) as HTMLElement
    expect(within(row.closest('[data-line]') as HTMLElement).getByText(GOAL_LINES.muscle!)).toBeInTheDocument()
    expect(within(row).getByText(WHEY.title)).toBeInTheDocument()
    expect(within(row).getByText(`“${CLAIMS['protein-muscle-growth'].wording}”`)).toBeInTheDocument()
    expect(within(row).getByText(YOU_SCENE_COPY.claimLabel)).toBeInTheDocument()
  })

  it('lists only products that have a line, and every product in the strip', () => {
    const quiet = item(OTHER, null)
    render(<YouScene stackName="S" items={[GOAL_ITEM, quiet, ANSWER_ITEM]} checks={[]} reducedMotion />)
    expect(screen.getByRole('heading', { name: RESULTS_HEADINGS.builtFromAnswers })).toBeInTheDocument()
    const rows = document.querySelectorAll('[data-explained]')
    expect([...rows].map((r) => r.getAttribute('data-explained'))).toEqual([WHEY.id, MAGNESIUM.id])
    expect(within(screen.getByRole('list', { name: 'In your stack' })).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('3 products')).toBeInTheDocument()
  })

  it('says a shared line once, with each of its products and their own claims under it', () => {
    const CREATINE = byGroup('creatine')
    const creatine = item(CREATINE, { kind: 'goal', goal: 'muscle', sentence: GOAL_LINES.muscle!, claim: CLAIMS['creatine-performance'] })
    render(<YouScene stackName="S" items={[GOAL_ITEM, ANSWER_ITEM, creatine]} checks={[]} reducedMotion />)
    expect(screen.getAllByText(GOAL_LINES.muscle!)).toHaveLength(1)
    const group = screen.getByText(GOAL_LINES.muscle!).closest('[data-line]') as HTMLElement
    expect([...group.querySelectorAll('[data-explained]')].map((r) => r.getAttribute('data-explained'))).toEqual([WHEY.id, CREATINE.id])
    for (const id of ['protein-muscle-growth', 'creatine-performance']) {
      expect(within(group).getByText(`“${CLAIMS[id].wording}”`)).toBeInTheDocument()
    }
    expect([...document.querySelectorAll('[data-line]')].map((g) => g.getAttribute('data-line')))
      .toEqual([GOAL_LINES.muscle, ANSWER_ITEM.explanation!.sentence])
  })

  it('lists products with no line by name and type only, under their own heading', () => {
    render(<YouScene stackName="S" items={[GOAL_ITEM, item(OTHER)]} checks={[]} reducedMotion />)
    const section = screen.getByRole('heading', { name: RESULTS_HEADINGS.alsoInStack }).closest('section')!
    const row = section.querySelector(`[data-listed="${OTHER.id}"]`) as HTMLElement
    expect(row.textContent).toBe(`${OTHER.title}${productTypeLabel(OTHER)}`)
    expect(section.querySelector('blockquote')).toBeNull()
  })

  it('calls that list "In your stack" when no product has a line', () => {
    render(<YouScene stackName="S" items={[item(OTHER), item(MAGNESIUM)]} checks={[]} reducedMotion />)
    expect(screen.getByRole('heading', { name: RESULTS_HEADINGS.inStack })).toBeInTheDocument()
    expect(screen.queryByText(RESULTS_HEADINGS.alsoInStack)).not.toBeInTheDocument()
    expect(document.querySelectorAll('[data-listed]')).toHaveLength(2)
  })

  it('shows an answer line without a claim when there is none', () => {
    const plain = item(MAGNESIUM, { ...ANSWER_ITEM.explanation!, claim: null } as YouSceneItem['explanation'])
    render(<YouScene stackName="S" items={[plain]} checks={[]} reducedMotion />)
    expect(screen.getByText('You said your meals are all over the place right now.')).toBeInTheDocument()
    expect(screen.queryByText(YOU_SCENE_COPY.claimLabel)).not.toBeInTheDocument()
  })

  it('leaves "Built from your answers" out when no product has a line', () => {
    render(<YouScene stackName="S" items={[item(OTHER)]} checks={[]} reducedMotion />)
    expect(screen.queryByText(RESULTS_HEADINGS.builtFromAnswers)).not.toBeInTheDocument()
  })

  it('lists what we checked, one tick each, and leaves it out when nothing happened', () => {
    const checks = [CHECK_LINES.alreadyTaking.creatine, CHECK_LINES.doseCap('caffeine', 200)]
    const { unmount } = render(<YouScene stackName="S" items={[]} checks={checks} reducedMotion />)
    const section = screen.getByRole('heading', { name: RESULTS_HEADINGS.whatWeChecked }).closest('section')!
    expect(within(section).getAllByRole('listitem').map((li) => li.textContent)).toEqual(checks)
    unmount()
    render(<YouScene stackName="S" items={[]} checks={[]} reducedMotion />)
    expect(screen.queryByText(RESULTS_HEADINGS.whatWeChecked)).not.toBeInTheDocument()
  })

  it('folds a long stack into "+n" in the strip', () => {
    const many = MOCK_CATALOGUE.slice(0, 8).map((p) => item(p))
    render(<YouScene stackName="S" items={many} checks={[]} reducedMotion />)
    const strip = screen.getByRole('list', { name: 'In your stack' })
    expect(within(strip).getAllByRole('listitem')).toHaveLength(6)
    expect(within(strip).getByText('+3')).toBeInTheDocument()
  })

  it('renders the greeting alone while there is no stack to name', () => {
    render(<YouScene name="Sam" stackName={null} items={[]} checks={[]} reducedMotion />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Sam, here’s your stack$/)
  })
})

describe('the You scene’s colours', () => {
  // The panel is light and every word on it is small, so each ink has to
  // clear AA on both the card and the page behind it.
  it.each(['ink', 'ink2', 'ink3', 'accentInk'] as const)('%s clears AA on the card and the page', (key) => {
    expect(contrast(YOU_PALETTE[key], YOU_PALETTE.card)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(YOU_PALETTE[key], YOU_PALETTE.page)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the tiers in order', () => {
    expect(luminance(YOU_PALETTE.ink)).toBeLessThan(luminance(YOU_PALETTE.ink2))
    expect(luminance(YOU_PALETTE.ink2)).toBeLessThan(luminance(YOU_PALETTE.ink3))
  })
})

describe('the deck heading', () => {
  it('says how many there are to swipe through', () => {
    expect(deckHeading(5)).toBe('Your personalised stack · swipe to see all 5')
    expect(deckHeading(2)).toBe('Your personalised stack · swipe to see both')
    expect(deckHeading(1)).toBe('Your personalised stack')
    expect(deckHeading(5)).not.toMatch(/compare/)
  })
})

describe('StackHero', () => {
  it('states facts only: no summary sentence and no goal chip', () => {
    const blueprint = { ...MOCK_BLUEPRINT, summary: 'Designed to support fat loss while preserving lean muscle.', primaryGoal: 'cutting' as const }
    render(<StackHero blueprint={blueprint} productCount={4} totalPrice={40} />)
    expect(screen.getByText('Your CHRGD Stack')).toBeInTheDocument()
    expect(screen.getByText(MOCK_BLUEPRINT.stackName)).toBeInTheDocument()
    expect(screen.getByText('4 products')).toBeInTheDocument()
    expect(screen.queryByText(/fat loss/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^cutting$/i)).not.toBeInTheDocument()
  })
})

/**
 * The real page, with a stack built by the engine from the mock catalogue: the
 * You scene is rendered by StackReviewPage from the depth on screen.
 */
describe('the results page', () => {
  const answers: QuizAnswers = {
    ...defaultAnswers,
    name: 'alex',
    track: 'performance',
    goals: ['muscle'],
    trainingFrequency: '3-4x',
    trainingType: ['strength'],
    trainingFocus: 'hypertrophy',
    diet: 'mostly-good',
    caffeineLevel: 'medium',
    stimPreference: 'yes',
    currentSupplements: ['creatine'] as QuizAnswers['currentSupplements'],
  }

  beforeEach(() => {
    invalidateCatalogue()
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ products: MOCK_CATALOGUE, source: 'mock' }),
    }) as unknown as typeof fetch
    act(() => {
      useQuizStore.setState({ answers, stackBlueprint: buildStackBlueprint(answers, MOCK_CATALOGUE) })
    })
  })

  afterEach(() => {
    act(() => useQuizStore.setState({ answers: defaultAnswers, stackBlueprint: null }))
  })

  it('opens on the person and their stack’s name, and explains it', async () => {
    render(<StackReviewPage reducedMotion />)
    const heading = await screen.findByRole('heading', { name: /Alex, here’s your stack/ })
    const { stackName } = useQuizStore.getState().stackBlueprint!
    expect(heading).toHaveTextContent(stackName)

    // The top-pick offer at the foot of the page may carry the same line, so
    // the You scene's own copy is checked inside the scene.
    await screen.findAllByText(GOAL_LINES.muscle!)
    const you = within(document.getElementById('scene-you')!)
    expect(you.getByText(GOAL_LINES.muscle!)).toBeInTheDocument()
    expect(you.getByText(`“${CLAIMS['protein-muscle-growth'].wording}”`)).toBeInTheDocument()
    expect(you.getByText(CHECK_LINES.alreadyTaking.creatine)).toBeInTheDocument()
  })

  it('never names a goal the stack does not serve: that would say it serves the rest', async () => {
    const bp = buildStackBlueprint(answers, MOCK_CATALOGUE)
    act(() => useQuizStore.setState({ stackBlueprint: { ...bp, unmetGoals: ['sleep-better'] } }))
    render(<StackReviewPage reducedMotion />)
    await screen.findAllByText(GOAL_LINES.muscle!)
    expect(screen.queryByText(/couldn’t match/i)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/suitable product for/i)
    // The GP disclaimer stays.
    expect(document.body.textContent).toMatch(/Consult your GP/)
  })

  it('keeps all three scene anchors below the bar, in order', async () => {
    render(<StackReviewPage reducedMotion />)
    await screen.findAllByText(GOAL_LINES.muscle!)
    const ids = ['scene-you', 'scene-stack', 'scene-plan']
    const els = ids.map((id) => document.getElementById(id)!)
    for (const el of els) expect(el).toHaveClass('scroll-mt-[calc(env(safe-area-inset-top)+4.5rem)]')
    expect(els[0].compareDocumentPosition(els[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(els[1]).toContainElement(els[2])
    // The dark panel runs to the foot of the page and keeps the checkout bar clear.
    expect(els[1]).toHaveClass('pb-[calc(2.5rem+env(safe-area-inset-bottom))]')
  })

  it('lists the products on screen in the You scene, and the deck says how many', async () => {
    render(<StackReviewPage reducedMotion />)
    await screen.findAllByText(GOAL_LINES.muscle!)
    const strip = screen.getByRole('list', { name: 'In your stack' })
    const n = within(strip).getAllByRole('listitem').length
    expect(screen.getByText(deckHeading(n))).toBeInTheDocument()
  })

  it('carries no stack summary and no goal chip in the Stack scene', async () => {
    render(<StackReviewPage reducedMotion />)
    await screen.findAllByText(GOAL_LINES.muscle!)
    const { summary } = useQuizStore.getState().stackBlueprint!
    expect(screen.queryByText(summary)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Muscle$/)).not.toBeInTheDocument()
  })
})
