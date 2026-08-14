import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StackItemCard } from '../StackItemCard'
import { line, product } from '@/lib/changes/__tests__/fixtures'
import { goalAxis } from '@/lib/stack-stats'
import type { LinePhase, LineRecommendation } from '@/lib/feedback'

const AXES = [goalAxis('muscle'), goalAxis('energy'), goalAxis('recovery'), goalAxis('health')]

function rec(over: Partial<LineRecommendation> = {}): LineRecommendation {
  return {
    lineId: 'l1',
    productTitle: 'Whey A',
    slotTitle: 'Protein',
    basis: 'objective',
    onset: 'none',
    phase: 'unfelt',
    daysUntilFelt: 0,
    reason: 'A daily essential you won’t consciously feel.',
    statusLabel: 'Daily essential',
    statusIcon: 'check',
    statusTone: 'essential',
    ...over,
  }
}

function renderCard(over: { recommendation?: Partial<LineRecommendation>; withProduct?: boolean } = {}) {
  const handlers = { onChange: jest.fn(), onManage: jest.fn(), onMicroFeedback: jest.fn() }
  const result = render(
    <StackItemCard
      line={line()}
      recommendation={rec(over.recommendation)}
      product={over.withProduct === false ? undefined : product({ id: 'whey-a', title: 'Whey A' })}
      axes={AXES}
      {...handlers}
    />,
  )
  return { ...result, ...handlers }
}

describe('StackItemCard', () => {
  it('renders in every phase without falling over', () => {
    // Five phases, five different combinations of badge, progress ring and
    // check-in. A card that throws on one of them takes the whole hub down.
    const phases: LinePhase[] = ['unfelt', 'too-early', 'working', 'review', 'check']
    for (const phase of phases) {
      const { unmount } = renderCard({
        recommendation: {
          phase,
          ...(phase === 'too-early'
            ? { progress: { weeksElapsed: 1, weeksTotal: 3, pct: 0.33 }, statusTone: 'building' as const }
            : {}),
        },
      })
      expect(screen.getByText('Whey A')).toBeInTheDocument()
      unmount()
    }
  })

  it('shows the product, which the hub never used to do', () => {
    // Every other screen anchors a product with a tile; this one printed a
    // string. The catalogue has no photos in test, so this is the designed
    // slot-glyph fallback — the point is that something is drawn at all.
    const { container } = renderCard()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('survives a product the catalogue knows nothing about', () => {
    // Lines outlive catalogue entries. A missing product must cost the bars,
    // not the card.
    renderCard({ withProduct: false })
    expect(screen.getByText('Whey A')).toBeInTheDocument()
    expect(screen.queryByText('What it supports')).not.toBeInTheDocument()
  })

  it('scores the product on the stack’s shared axes', () => {
    renderCard()
    expect(screen.getByText('What it supports')).toBeInTheDocument()
    for (const axis of AXES) {
      expect(screen.getByText(axis.label)).toBeInTheDocument()
    }
  })

  it('offers a swap and a manage, and reports which was pressed', async () => {
    const user = userEvent.setup()
    const { onChange, onManage } = renderCard()

    await user.click(screen.getByRole('button', { name: /swap/i }))
    expect(onChange).toHaveBeenCalledWith('l1')

    await user.click(screen.getByRole('button', { name: /manage/i }))
    expect(onManage).toHaveBeenCalledWith('l1')
  })

  it('promotes the action when a product is not landing', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCard({ recommendation: { phase: 'review', statusTone: 'review', statusLabel: "Not landing — let's adjust", statusIcon: 'alert-triangle' } })

    await user.click(screen.getByRole('button', { name: /find a better fit/i }))
    expect(onChange).toHaveBeenCalledWith('l1')
  })

  it('logs an inline rating on the 1–5 scale, without a single emoji', async () => {
    const user = userEvent.setup()
    // `working` on a felt slot is what opens the inline check-in.
    const handlers = { onChange: jest.fn(), onManage: jest.fn(), onMicroFeedback: jest.fn() }
    const { container } = render(
      <StackItemCard
        line={line({ stackSlot: 'energy', slotTitle: 'Energy' })}
        recommendation={rec({ phase: 'working', statusTone: 'good', statusIcon: 'bolt' })}
        product={product({ id: 'whey-a' })}
        axes={AXES}
        {...handlers}
      />,
    )

    const scale = screen.getByRole('radiogroup')
    await user.click(within(scale).getByRole('radio', { name: '5 out of 5' }))

    expect(handlers.onMicroFeedback).toHaveBeenCalledWith('energy', 5)
    expect(screen.getByText(/thanks — logged/i)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('rations weight to the number', () => {
    // `font-black` on every string is why the old card had no hierarchy. The
    // price earns it; the product title does not.
    const { container } = renderCard()
    const title = screen.getByText('Whey A')
    expect(title.className).toContain('font-medium')
    expect(title.className).not.toContain('font-black')
    expect(container.querySelector('.font-black')?.textContent).toBe('£30.00')
  })
})
