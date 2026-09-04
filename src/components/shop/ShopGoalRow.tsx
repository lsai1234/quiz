'use client'

import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { Goal } from '@/lib/types'
import { GOALS_DATA, WELLBEING_DATA } from '@/lib/quiz-goals'
import { QuizIcon } from '@/components/quiz/QuizIcon'

interface Props {
  products: CatalogueProduct[]
  selected: Goal[]
  onSelect: (goal: Goal | null) => void
  /**
   * The roulette, as the last tile.
   *
   * It belongs here rather than on its own line: it is a way into the shop, so
   * it sits with the other ways in — and as a tile it finally looks like the
   * machine it opens instead of like a link. It is last because it is the least
   * serious of them.
   */
  onSurprise?: () => void
}

/**
 * Goal order, taken from the quiz so the two funnels agree on what exists.
 *
 * Short labels for the tiles: the quiz's own wording is a sentence fragment
 * ("Peak performance", "Skin, hair & nails") sized for a full-width option row,
 * and at 68px it wraps to two ragged lines. The full label stays as the title
 * attribute and the accessible name.
 */
const SHORT: Record<string, string> = {
  muscle: 'Muscle', cutting: 'Lean', energy: 'Energy', performance: 'Performance',
  recovery: 'Recovery', health: 'Health', bulking: 'Mass', hydration: 'Hydration',
  'sleep-better': 'Sleep', 'less-stress': 'Stress', focus: 'Focus', immune: 'Immune',
  'skin-hair-nails': 'Skin & hair', 'gut-health': 'Gut', menopause: 'Menopause',
}

const ALL = [...GOALS_DATA, ...WELLBEING_DATA].map((g) => ({ ...g, short: SHORT[g.id] ?? g.label }))

/**
 * Shop by goal.
 *
 * The highest-intent navigation a supplement shop can offer, and the shop did
 * not have it. Somebody arriving at a supplement storefront knows what they
 * want to happen — sleep better, recover faster — long before they know which
 * category it lives in, and the only ways in were a category name, a search box
 * and a quiz.
 *
 * It is also the answer to "loads of text in boxes": a row of glyphs is the
 * first thing on the page that is not a sentence, and the icons are the ones
 * the quiz already uses for the same goals, so the two halves of the product
 * look like one thing.
 *
 * Only goals the catalogue can actually answer are shown. A tile that filters
 * to nothing is worse than no tile.
 */
export function ShopGoalRow({ products, selected, onSelect, onSurprise }: Props) {
  const present = new Set(products.flatMap((p) => p.goals))
  const goals = ALL.filter((g) => present.has(g.id))
  if (goals.length < 3) return null

  return (
    <nav aria-label="Shop by goal">
      <div className="sf-scroll-row flex" style={{ gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4) var(--space-1)' }}>
        {goals.map((g) => {
          const on = selected.includes(g.id)
          return (
            <button
              key={g.id}
              onClick={() => onSelect(on ? null : g.id)}
              aria-pressed={on}
              aria-label={g.label}
              data-interactive
              className="sf-goal flex flex-col items-center flex-shrink-0"
              style={{ width: 68, border: 'none', background: 'none', padding: 0, gap: 'var(--space-2)' }}
            >
              <span
                className="flex items-center justify-center"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 'var(--r-pill)',
                  background: on ? 'var(--accent)' : 'var(--surface)',
                  color: on ? 'var(--accent-ink)' : 'var(--text)' }}
              >
                <QuizIcon name={g.icon} size={24} />
              </span>
              {/*
                One line, truncated. Two-line labels made the row ragged — the
                tiles stopped sitting on a shared baseline and the whole thing
                read as broken rather than as a row.
              */}
              <span
                className="sf-meta text-center leading-tight w-full truncate"
                style={{ color: on ? 'var(--text)' : 'var(--text-dim)', fontSize: 11 }}
                title={g.label}
              >
                {g.short}
              </span>
            </button>
          )
        })}

        {onSurprise && (
          <button
            onClick={onSurprise}
            data-interactive
            className="sf-goal flex flex-col items-center flex-shrink-0"
            style={{ width: 68, border: 'none', background: 'none', padding: 0, gap: 'var(--space-2)' }}
          >
            <span
              className="flex items-center justify-center"
              style={{ width: 56, height: 56, borderRadius: 'var(--r-pill)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              <QuizIcon name="sparkle" size={24} />
            </span>
            <span className="sf-meta text-center leading-tight w-full truncate" style={{ fontSize: 11 }}>
              Surprise me
            </span>
          </button>
        )}
      </div>
    </nav>
  )
}
