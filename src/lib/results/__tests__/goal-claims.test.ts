import { ALL_GOALS, type Goal } from '@/lib/types'
import type { SwapGroup } from '@/lib/catalogue/types'
import { CLAIMS, CLAIMS_BY_KIND } from '@/lib/consult/claims'
import { APPROVED_CLAIMS } from '@/lib/stack-blueprint/approved-claims'
import {
  ANY_CLAIM, GOAL_CLAIMS, goalClaimFor, goalsBackedBy, isAnyClaim, productClaim,
} from '../goal-claims'

const kind = (swapGroup: SwapGroup) => ({ swapGroup })

describe('GOAL_CLAIMS: the map itself', () => {
  it('has an entry for every quiz goal, and nothing else', () => {
    expect(Object.keys(GOAL_CLAIMS).sort()).toEqual([...ALL_GOALS].sort())
  })

  it('uses only kinds in CLAIMS_BY_KIND, and only claim ids that kind carries', () => {
    for (const [goal, entry] of Object.entries(GOAL_CLAIMS)) {
      if (isAnyClaim(entry)) continue
      for (const link of entry) {
        const carried = CLAIMS_BY_KIND[link.kind]
        expect({ goal, kind: link.kind, known: carried != null }).toEqual({ goal, kind: link.kind, known: true })
        expect(link.claimIds.length).toBeGreaterThan(0)
        for (const id of link.claimIds) {
          expect(CLAIMS[id]).toBeDefined()
          expect(carried).toContain(id)
        }
      }
    }
  })

  it('represents General health as any claim, and nothing else as any claim', () => {
    expect(GOAL_CLAIMS.health).toBe(ANY_CLAIM)
    const anyGoals = Object.entries(GOAL_CLAIMS).filter(([, e]) => isAnyClaim(e)).map(([g]) => g)
    expect(anyGoals).toEqual(['health'])
    for (const id of ANY_CLAIM.prefer) expect(CLAIMS[id]).toBeDefined()
  })

  it('maps goals no authorised claim speaks to, to nothing', () => {
    const unmapped: Goal[] = ['sleep-better', 'less-stress', 'recovery', 'cutting', 'skin-hair-nails', 'gut-health', 'menopause']
    for (const goal of unmapped) expect(GOAL_CLAIMS[goal]).toEqual([])
  })

  it('never draws on APPROVED_CLAIMS paraphrase', () => {
    const verbatim = new Set(Object.values(CLAIMS).map((c) => c.wording))
    const paraphrase = Object.values(APPROVED_CLAIMS).flat().filter((w) => !verbatim.has(w))
    for (const goal of ALL_GOALS) {
      for (const group of Object.keys(CLAIMS_BY_KIND) as SwapGroup[]) {
        const claim = goalClaimFor(goal, kind(group))
        if (claim) expect(paraphrase).not.toContain(claim.wording)
      }
    }
  })
})

describe('goalClaimFor', () => {
  it.each<[Goal, SwapGroup, string | null]>([
    ['muscle', 'protein-whey', 'protein-muscle-growth'],
    ['muscle', 'protein-plant', 'protein-muscle-growth'],
    ['muscle', 'creatine', 'creatine-performance'],
    ['bulking', 'protein-mass', 'protein-muscle-growth'],
    // Held back until sign-off: the electrolyte claims need a carbohydrate-
    // electrolyte solution, and the focus claims are about normal function only.
    ['performance', 'electrolytes', null],
    ['hydration', 'electrolytes', null],
    ['energy', 'vitamin-b', 'b12-tiredness'],
    ['energy', 'magnesium', 'magnesium-tiredness'],
    ['energy', 'vitamin-c', 'vitc-tiredness'],
    ['energy', 'zma', 'magnesium-tiredness'],
    ['immune', 'vitamin-d', 'vitd-immune'],
    ['immune', 'vitamin-c', 'vitc-immune'],
    ['immune', 'zma', 'zinc-immune'],
    ['focus', 'omega-3', null],
    ['focus', 'zma', null],
    // General health: any claim, a protein's bones claim first.
    ['health', 'protein-whey', 'protein-bones'],
    ['health', 'protein-bar', 'protein-muscle-growth'],
    ['health', 'omega-3', 'epa-dha-heart'],
    ['health', 'vitamin-d', 'vitd-immune'],
    // Not backed.
    ['health', 'multivitamin', null],
    ['health', 'sleep-support', null],
    ['muscle', 'vitamin-d', null],
    ['muscle', 'magnesium', null],
    ['energy', 'pre-workout-stim', null],
    ['immune', 'multivitamin', null],
    ['sleep-better', 'magnesium', null],
    ['less-stress', 'magnesium', null],
    ['recovery', 'protein-whey', null],
    ['cutting', 'protein-whey', null],
    ['skin-hair-nails', 'collagen', null],
  ])('%s + %s → %s', (goal, group, id) => {
    const claim = goalClaimFor(goal, kind(group))
    expect(claim?.id ?? null).toBe(id)
    if (claim) expect(claim).toBe(CLAIMS[claim.id])
  })
})

describe('productClaim', () => {
  it('takes the claim backing the first goal the map links, in the order given', () => {
    expect(productClaim(kind('vitamin-c'), ['immune', 'energy'])?.id).toBe('vitc-immune')
    expect(productClaim(kind('vitamin-c'), ['energy', 'immune'])?.id).toBe('vitc-tiredness')
    expect(productClaim(kind('protein-whey'), ['health', 'muscle'])?.id).toBe('protein-bones')
  })

  it("falls back to the kind's first claim when no goal is backed", () => {
    expect(productClaim(kind('omega-3'), ['sleep-better'])?.id).toBe('epa-dha-heart')
    expect(productClaim(kind('vitamin-d'), [])?.id).toBe('vitd-immune')
  })

  it('is null for a kind with no authorised claim', () => {
    for (const group of ['multivitamin', 'collagen', 'pre-workout-stim', 'sleep-support', 'adaptogen', 'probiotic', 'general'] as SwapGroup[]) {
      expect(productClaim(kind(group), ['health', 'muscle', 'immune'])).toBeNull()
    }
  })
})

describe('goalsBackedBy', () => {
  it('lists the goals the map links to one claim of one kind, leaving out General health', () => {
    expect(goalsBackedBy('protein-whey', 'protein-muscle-growth')).toEqual(['muscle', 'bulking'])
    expect(goalsBackedBy('zma', 'magnesium-tiredness')).toEqual(['energy'])
    expect(goalsBackedBy('omega-3', 'epa-dha-heart')).toEqual([])
  })
})
