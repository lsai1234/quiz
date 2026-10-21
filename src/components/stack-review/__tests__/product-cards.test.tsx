import { fireEvent, render, screen, within } from '@testing-library/react'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint/mock-blueprint'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'
import { CLAIMS } from '@/lib/consult/claims'
import { formatFact } from '@/lib/product-facts'
import { GOAL_LINES, explainProduct } from '@/lib/results'
import { StatCard } from '../StatCard'
import { StackDeck } from '../StackDeck'
import { StackHero } from '../StackHero'
import { UpgradesCard } from '../UpgradesCard'
import { ProductSwapModal } from '../ProductSwapModal'

/**
 * The results page's product cards and detail sheet.
 *
 * Phase 1 ("remove what isn't true"): each card used to say what a product
 * does for you: a benefit tag ("Immune Support"), "What it supports" bars,
 * "+Sleep" chips, an onset promise ("Give it 1–3 weeks to notice the
 * difference"). Those are implied health claims. These tests pin that they are
 * gone and that the tag is the product type.
 *
 * Phase 2 ("why these"): the card shows the register's claim, verbatim, and
 * what a pack holds, costs and lasts; the sheet's "Why it's in your stack" is
 * the explanation from lib/results, never the slot's reason or description.
 */

const byGroup = (group: CatalogueProduct['swapGroup']) => MOCK_CATALOGUE.find((p) => p.swapGroup === group)!
const byId = (id: string) => MOCK_CATALOGUE.find((p) => p.id === id)!
const VITAMIN_C = byId('chrgd-vitamin-c-zinc') // 90 tabs, £11.99
const MAGNESIUM = byGroup('magnesium')
const ELECTROLYTES = byGroup('electrolytes') // 30 servings, taken per workout
const ASHWAGANDHA = byGroup('adaptogen') // a kind with no authorised claim

/** Engine and AI copy a slot carries. None of it may reach the card or sheet. */
const SLOT_DESCRIPTION = 'Strengthens everyday immune resilience'
const SLOT_REASON = 'Engine reason: keeps your defences topped up.'

/** Every verbatim claim on the register, for "is this text a claim?" checks. */
const REGISTER = new Set(Object.values(CLAIMS).map((c) => c.wording))

function answers(o: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'Alex', track: 'performance', primaryGoal: null,
    asNeeded: {}, ageBracket: '25-34', exactAge: null, gender: 'male', goals: ['health'],
    trainingFrequency: '3-4x', trainingType: [], lifestyle: [], diet: 'mostly-good',
    currentSupplements: [], currentVitamins: [], tryOurs: [],
    wellbeingAnswers: {}, dynamicAnswers: {}, caffeineLevel: 'medium', budget: null,
    stackPreference: null, trainingExperience: 'intermediate', trainingFocus: null,
    stimPreference: 'yes', trainingTime: null, ...o,
  }
}

/** The text of the claim on the card, without its quotation marks. */
function cardClaimText(): string | null {
  const el = screen.queryByTestId('card-claim')
  return el ? el.textContent!.replace(/^“|”$/g, '') : null
}

/** A slot the way the engine builds an extra: its title is a benefit label. */
function slotFor(product: CatalogueProduct, over: Partial<StackSlotEntry> = {}): StackSlotEntry {
  return {
    slotId: `slot-extra-${product.id}`,
    slotType: 'health',
    title: 'Immune Support',
    description: SLOT_DESCRIPTION,
    recommendedProductId: product.id,
    selectedProductId: product.id,
    selectedVariantId: null,
    required: false,
    canRemove: true,
    canSwap: true,
    swapGroup: product.swapGroup,
    reason: SLOT_REASON,
    confidenceScore: 80,
    displayOrder: 0,
    ...over,
  }
}

describe('StatCard', () => {
  it('tags the card with the product type, not the slot title', () => {
    render(<StatCard slot={slotFor(VITAMIN_C)} product={VITAMIN_C} planType="subscription" />)
    expect(screen.getByText('Vitamin C')).toBeInTheDocument()
    expect(screen.queryByText('Immune Support')).not.toBeInTheDocument()
  })

  it('has no "What it supports" bars', () => {
    render(<StatCard slot={slotFor(VITAMIN_C)} product={VITAMIN_C} planType="subscription" />)
    expect(screen.queryByText('What it supports')).not.toBeInTheDocument()
    expect(screen.queryByText('✦')).not.toBeInTheDocument()
  })

  it('drops the role line, and keeps the price and the way into the detail sheet', () => {
    render(<StatCard slot={slotFor(VITAMIN_C)} product={VITAMIN_C} planType="subscription" answers={answers()} />)
    expect(screen.queryByText(SLOT_DESCRIPTION)).not.toBeInTheDocument()
    expect(screen.queryByText(SLOT_REASON)).not.toBeInTheDocument()
    expect(screen.getByText('£11.99')).toBeInTheDocument()
    expect(screen.getByText('Tap for details ›')).toBeInTheDocument()
  })

  it('shows the claim backing their goal, verbatim from the register, in quotation marks', () => {
    render(<StatCard slot={slotFor(VITAMIN_C)} product={VITAMIN_C} planType="subscription" answers={answers({ goals: ['immune'] })} />)
    expect(screen.getByTestId('card-claim').textContent).toBe(`“${CLAIMS['vitc-immune'].wording}”`)
  })

  it("picks the kind's claim for a goal they gave, passing over goals the map does not back", () => {
    const { unmount } = render(
      <StatCard slot={slotFor(VITAMIN_C)} product={VITAMIN_C} planType="subscription" answers={answers({ goals: ['energy'] })} />,
    )
    expect(cardClaimText()).toBe(CLAIMS['vitc-tiredness'].wording)
    unmount()
    render(
      <StatCard slot={slotFor(VITAMIN_C)} product={VITAMIN_C} planType="subscription" answers={answers({ goals: ['sleep-better', 'energy'], primaryGoal: 'sleep-better' })} />,
    )
    expect(cardClaimText()).toBe(CLAIMS['vitc-tiredness'].wording)
  })

  it('shows the same claim as the why-line in the sheet', () => {
    const a = answers({ goals: ['immune', 'energy'], primaryGoal: 'energy' })
    const explanation = explainProduct({ product: VITAMIN_C, slotType: 'health', answers: a })
    expect(explanation?.claim).toBeTruthy()
    render(<StatCard slot={slotFor(VITAMIN_C)} product={VITAMIN_C} planType="subscription" answers={a} />)
    expect(cardClaimText()).toBe(explanation!.claim!.wording)
    fireEvent.click(screen.getByText('Tap for details ›'))
    expect(screen.getByTestId('sheet-claim').textContent).toBe(`“${explanation!.claim!.wording}”`)
  })

  it("shows the kind's first claim when there are no answers (a bundle page)", () => {
    render(<StatCard slot={slotFor(VITAMIN_C)} product={VITAMIN_C} planType="subscription" />)
    expect(cardClaimText()).toBe(CLAIMS['vitc-immune'].wording)
  })

  it('shows no claim at all for a kind the register gives none', () => {
    render(<StatCard slot={slotFor(ASHWAGANDHA, { slotType: 'sleep' })} product={ASHWAGANDHA} planType="subscription" answers={answers({ goals: ['less-stress'] })} />)
    expect(screen.queryByTestId('card-claim')).not.toBeInTheDocument()
    expect(screen.queryByText(/“/)).not.toBeInTheDocument()
  })

  it('shows servings, cost per serving and how long a pack lasts', () => {
    render(<StatCard slot={slotFor(VITAMIN_C)} product={VITAMIN_C} planType="subscription" answers={answers()} />)
    // 90 tablets at £11.99: 13.3p a serving, a tablet a day for three months.
    expect(screen.getByText('Servings').nextSibling).toHaveTextContent('90')
    expect(screen.getByText('Per serving').nextSibling).toHaveTextContent('13p')
    expect(screen.getByText('Lasts about').nextSibling).toHaveTextContent('3 months')
  })

  it('sizes how long it lasts to how often they train, and to their usage', () => {
    const slot = slotFor(ELECTROLYTES, { slotType: 'hydration' })
    // 30 servings, one a workout. 5–6 sessions a week is 24 a month: six weeks.
    const { unmount } = render(<StatCard slot={slot} product={ELECTROLYTES} planType="subscription" answers={answers({ trainingFrequency: '5-6x' })} />)
    expect(screen.getByText('Lasts about').nextSibling).toHaveTextContent('6 weeks')
    unmount()
    // Two a session is 48 a month: about three weeks.
    render(
      <StatCard slot={slot} product={ELECTROLYTES} planType="subscription" answers={answers({ trainingFrequency: '5-6x' })} usage={{ [ELECTROLYTES.id]: 'heavy' }} />,
    )
    expect(screen.getByText('Lasts about').nextSibling).toHaveTextContent('3 weeks')
  })

  it('prices the variant the slot picked, and works its cost per serving from that variant', () => {
    const twoSizes: CatalogueProduct = {
      ...VITAMIN_C,
      id: 'two-sizes',
      servings: 90,
      variants: [
        { id: 'small', title: '90 tabs', flavour: null, size: '90 tabs', price: 11.99, compareAtPrice: null, available: true },
        { id: 'large', title: '180 tabs', flavour: null, size: '180 tabs', price: 18, compareAtPrice: null, available: true },
      ],
    }
    render(<StatCard slot={slotFor(twoSizes, { selectedVariantId: 'large' })} product={twoSizes} planType="subscription" />)
    expect(screen.getByText('£18.00')).toBeInTheDocument()
    expect(screen.getByText('Servings').nextSibling).toHaveTextContent('180')
    expect(screen.getByText('Per serving').nextSibling).toHaveTextContent('10p')
    expect(screen.getByText('Lasts about').nextSibling).toHaveTextContent('6 months')
  })

  it('leaves out every number it cannot know, rather than guessing one', () => {
    const unknown: CatalogueProduct = {
      ...VITAMIN_C,
      id: 'no-count',
      servings: undefined as unknown as number,
      consumption: undefined,
      variants: [{ id: 'v', title: 'Tub', flavour: null, size: null, price: 20, compareAtPrice: null, available: true }],
    }
    render(<StatCard slot={slotFor(unknown)} product={unknown} planType="subscription" answers={answers()} />)
    expect(screen.queryByText('Servings')).not.toBeInTheDocument()
    expect(screen.queryByText('Per serving')).not.toBeInTheDocument()
    expect(screen.queryByText('Lasts about')).not.toBeInTheDocument()
    expect(screen.getByText('£20.00')).toBeInTheDocument()
  })

  it('falls back to "Supplement", never the slot title, when the product is gone', () => {
    render(<StatCard slot={slotFor(VITAMIN_C)} product={undefined} planType="subscription" />)
    expect(screen.getByText('Supplement')).toBeInTheDocument()
    expect(screen.queryByText('Immune Support')).not.toBeInTheDocument()
  })
})

describe('ProductDetailSheet', () => {
  function openSheet(product: CatalogueProduct, a?: QuizAnswers | null, over: Partial<StackSlotEntry> = {}) {
    render(<StatCard slot={slotFor(product, over)} product={product} planType="subscription" answers={a} />)
    fireEvent.click(screen.getByText('Tap for details ›'))
  }

  /** The sheet's portal root: everything after the card. */
  const sheet = () => within(document.body.lastElementChild as HTMLElement)

  it('says why from their answers: what they said, then the product and its claim, verbatim', () => {
    openSheet(VITAMIN_C, answers({ goals: ['immune'] }))
    const why = within(screen.getByTestId('why-in-stack'))
    expect(why.getByText("Why it's in your stack")).toBeInTheDocument()
    expect(why.getByText(GOAL_LINES.immune!)).toBeInTheDocument()
    expect(why.getByText(VITAMIN_C.title)).toBeInTheDocument()
    expect(why.getByTestId('sheet-claim').textContent).toBe(`“${CLAIMS['vitc-immune'].wording}”`)
    // Said once: no separate "What it does" repeating the same claim.
    expect(screen.queryByTestId('what-it-does')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('sheet-claim')).toHaveLength(1)
  })

  it("never shows the slot's reason or description, with or without answers", () => {
    openSheet(VITAMIN_C, answers({ goals: ['immune'] }))
    expect(screen.queryByText(SLOT_REASON)).not.toBeInTheDocument()
    expect(screen.queryByText(SLOT_DESCRIPTION)).not.toBeInTheDocument()
  })

  it('leaves the why section out when nothing may be said, and shows what it does instead', () => {
    // Vitamin C is not scored for energy, so there is no line; the card's claim still shows.
    openSheet(VITAMIN_C, answers({ goals: ['energy'] }))
    expect(screen.queryByText("Why it's in your stack")).not.toBeInTheDocument()
    expect(screen.queryByText(SLOT_REASON)).not.toBeInTheDocument()
    const does = within(screen.getByTestId('what-it-does'))
    expect(does.getByText('What it does')).toBeInTheDocument()
    expect(does.getByTestId('sheet-claim').textContent).toBe(`“${CLAIMS['vitc-tiredness'].wording}”`)
  })

  it('has no why section without answers', () => {
    openSheet(VITAMIN_C, null)
    expect(screen.queryByTestId('why-in-stack')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('what-it-does')).getByTestId('sheet-claim').textContent)
      .toBe(`“${CLAIMS['vitc-immune'].wording}”`)
  })

  it('shows no claim and no why-line for a kind the register gives none', () => {
    openSheet(ASHWAGANDHA, answers({ goals: ['less-stress', 'sleep-better'] }), { slotType: 'sleep' })
    expect(screen.queryByTestId('why-in-stack')).not.toBeInTheDocument()
    expect(screen.queryByTestId('what-it-does')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sheet-claim')).not.toBeInTheDocument()
    expect(screen.queryByText(/stress|sleep/i)).not.toBeInTheDocument()
  })

  it('only ever quotes register wording', () => {
    openSheet(VITAMIN_C, answers({ goals: ['immune', 'energy'] }))
    for (const el of [...screen.queryAllByTestId('sheet-claim'), ...screen.queryAllByTestId('card-claim')]) {
      expect(REGISTER.has(el.textContent!.replace(/^“|”$/g, ''))).toBe(true)
    }
  })

  it('lists format, servings, cost per serving and how long it lasts at their usage', () => {
    openSheet(VITAMIN_C, answers())
    const facts = sheet()
    expect(facts.getByText('The facts')).toBeInTheDocument()
    expect(facts.getByText('Format').nextSibling).toHaveTextContent(formatFact(VITAMIN_C.formats).label)
    expect(facts.getByText('Per unit').nextSibling).toHaveTextContent('90 servings')
    expect(facts.getByText('Cost per serving').nextSibling).toHaveTextContent('13p')
    expect(facts.getByText('Lasts').nextSibling).toHaveTextContent('About three months at your usage')
  })

  it('does not say "at your usage" when it had no answers to size it by', () => {
    openSheet(VITAMIN_C, null)
    expect(sheet().getByText('Lasts').nextSibling).toHaveTextContent(/^About three months$/)
  })

  it('keeps the plan badges, swap and remove', () => {
    openSheet(VITAMIN_C, answers())
    expect(screen.getByText('Optional add-on')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Swap product' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('tags the sheet with the product type', () => {
    openSheet(VITAMIN_C)
    expect(screen.getByRole('heading', { name: VITAMIN_C.title })).toBeInTheDocument()
    expect(screen.getAllByText('Vitamin C').length).toBeGreaterThan(1)
    expect(screen.queryByText('Immune Support')).not.toBeInTheDocument()
  })

  it('makes no onset promise, in a sentence or as a fact', () => {
    openSheet(MAGNESIUM)
    expect(screen.getByText('The facts')).toBeInTheDocument()
    expect(screen.getByText('Format')).toBeInTheDocument()
    expect(screen.queryByText(/you.ll feel/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/notice the difference|expect to notice|from the first day|doing the work/i)).not.toBeInTheDocument()
  })
})

describe('StackDeck', () => {
  it('shows each card by product type, with no stat bars and no slot titles', () => {
    const slots = [slotFor(VITAMIN_C), slotFor(MAGNESIUM, { slotId: 'slot-sleep', title: 'Sleep', displayOrder: 1 })]
    render(<StackDeck slots={slots} products={MOCK_CATALOGUE} planType="subscription" />)
    expect(screen.getByText('Vitamin C')).toBeInTheDocument()
    expect(screen.getByText('Magnesium')).toBeInTheDocument()
    expect(screen.queryByText('What it supports')).not.toBeInTheDocument()
    expect(screen.queryByText('Sleep')).not.toBeInTheDocument()
  })

  it('passes their answers and usage to every card', () => {
    const slots = [
      slotFor(VITAMIN_C),
      slotFor(ELECTROLYTES, { slotId: 'slot-hydration', slotType: 'hydration', displayOrder: 1 }),
    ]
    render(
      <StackDeck
        slots={slots}
        products={MOCK_CATALOGUE}
        planType="subscription"
        answers={answers({ goals: ['energy'], trainingFrequency: '5-6x' })}
        usage={{ [ELECTROLYTES.id]: 'heavy' }}
      />,
    )
    const claims = screen.getAllByTestId('card-claim').map((el) => el.textContent!.replace(/^“|”$/g, ''))
    expect(claims[0]).toBe(CLAIMS['vitc-tiredness'].wording)
    for (const c of claims) expect(REGISTER.has(c)).toBe(true)
    expect(screen.getAllByText('Lasts about').map((el) => el.nextSibling?.textContent)).toEqual(['3 months', '3 weeks'])
    expect(screen.queryByText(SLOT_DESCRIPTION)).not.toBeInTheDocument()
  })
})

describe('StackHero', () => {
  it('has no "AI personalised" badge, even on a personalised stack', () => {
    render(<StackHero blueprint={{ ...MOCK_BLUEPRINT, personalised: true }} productCount={3} totalPrice={40} />)
    expect(screen.getByText('Your CHRGD Stack')).toBeInTheDocument()
    expect(screen.getByText(MOCK_BLUEPRINT.stackName)).toBeInTheDocument()
    expect(screen.queryByText(/AI personalised/i)).not.toBeInTheDocument()
  })
})

describe('UpgradesCard', () => {
  it('says nothing about goals when there is nothing to add', () => {
    render(<UpgradesCard boosters={[]} onAdd={() => {}} />)
    expect(screen.getByText('Nothing else to add right now.')).toBeInTheDocument()
    expect(screen.queryByText(/goal/i)).not.toBeInTheDocument()
  })

  it('tags each add-on with its product type, not the goal it would add', () => {
    render(<UpgradesCard boosters={[MAGNESIUM]} onAdd={() => {}} />)
    expect(screen.getByText('Magnesium')).toBeInTheDocument()
    expect(screen.queryByText(/^\+(?!\s)/)).not.toBeInTheDocument()
    expect(screen.queryByText('Sleep')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add' })).toBeInTheDocument()
  })
})

describe('ProductSwapModal', () => {
  it('names the product type in the header and the sentence', () => {
    render(
      <ProductSwapModal
        slot={slotFor(VITAMIN_C)}
        currentProduct={VITAMIN_C}
        alternatives={[]}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Vitamin C')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Change your vitamin C' })).toBeInTheDocument()
    expect(screen.queryByText(/immune support/i)).not.toBeInTheDocument()
  })

  it('keeps an acronym or a letter-led type as written mid-sentence', () => {
    const zma = { ...MAGNESIUM, swapGroup: 'zma' as const }
    const bComplex = { ...MAGNESIUM, swapGroup: 'vitamin-b' as const }
    const { rerender } = render(
      <ProductSwapModal slot={slotFor(zma)} currentProduct={zma} alternatives={[]} onSelect={() => {}} onClose={() => {}} />,
    )
    expect(screen.getByRole('heading', { name: 'Change your ZMA' })).toBeInTheDocument()
    rerender(
      <ProductSwapModal slot={slotFor(bComplex)} currentProduct={bComplex} alternatives={[]} onSelect={() => {}} onClose={() => {}} />,
    )
    expect(screen.getByRole('heading', { name: 'Change your B-complex' })).toBeInTheDocument()
  })
})
