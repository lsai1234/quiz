/**
 * The goal → slot / product map (data, not branches).
 *
 * This is half of the "decision matrix": which functional slots each goal wants,
 * and which swap groups score a targeted affinity bonus for a goal. The engine
 * (`factory.ts`) reads these tables instead of hard-coding the relationships, so
 * the catalogue relationships can change without editing scoring code.
 */
import type { Goal } from '@/lib/types'
import type { SwapGroup } from '@/lib/catalogue/types'

// ── Slot taxonomy ──────────────────────────────────────────────────────────
// A slot is a functional JOB in the stack. Order is the canonical fill order.
export const SLOT_ORDER = ['protein', 'performance', 'energy', 'hydration', 'recovery', 'health', 'sleep'] as const
export type SlotType = (typeof SLOT_ORDER)[number]

// ── Goal → slot relevance ──────────────────────────────────────────────────
// Which slot types each goal suggests, ranked (earlier = more relevant). Drives
// the performance-track fill order. Intentionally does NOT map energy →
// performance (creatine is not an energy product) or health/cutting → protein.
export const GOAL_SLOT_RELEVANCE: Partial<Record<Goal, SlotType[]>> = {
  muscle:      ['protein', 'performance', 'recovery'],
  bulking:     ['protein', 'performance', 'recovery'],
  cutting:     ['energy', 'health'],
  energy:      ['energy', 'health'],
  performance: ['performance', 'energy', 'protein'],
  hydration:   ['hydration', 'recovery'],
  recovery:    ['recovery', 'health'],
  health:      ['health', 'recovery'],
}

// ── Wellbeing goal slots ───────────────────────────────────────────────────
// Wellbeing stacks are built goal-first: each selected wellbeing goal gets its
// own named slot, filled by the best product tagged with that goal.
export const WELLBEING_GOAL_SLOTS: Array<{ goal: Goal; slotType: SlotType; title: string; description: string }> = [
  { goal: 'sleep-better',    slotType: 'sleep',    title: 'Sleep',               description: 'Improves sleep quality and overnight recovery' },
  { goal: 'less-stress',     slotType: 'sleep',    title: 'Stress',              description: 'Helps you stay calm and wind down' },
  { goal: 'focus',           slotType: 'health',   title: 'Focus',               description: 'Supports brain health and steady concentration' },
  { goal: 'immune',          slotType: 'health',   title: 'Immunity',            description: 'Strengthens everyday immune resilience' },
  { goal: 'skin-hair-nails', slotType: 'recovery', title: 'Skin, Hair & Nails',  description: 'Collagen and nutrients for skin, hair and nail health' },
  { goal: 'gut-health',      slotType: 'health',   title: 'Gut Health',          description: 'Probiotics and fibre for digestion and gut balance' },
  { goal: 'menopause',       slotType: 'health',   title: 'Menopause Support',   description: 'Botanicals and nutrients for hormonal balance' },
  { goal: 'health',          slotType: 'health',   title: 'Daily Health',        description: 'Covers everyday vitamin and mineral gaps' },
]

// ── Goal → swap-group affinity ─────────────────────────────────────────────
// Targeted bonuses so the most clinically relevant product wins when several
// cover the same goal. Summed across the user's goals (a product serving two of
// their goals earns both). Conditional refinements (e.g. sleep-better→magnesium
// only when no sleep follow-up was answered) stay in the engine.
export const GOAL_AFFINITY: Partial<Record<Goal, Partial<Record<SwapGroup, number>>>> = {
  immune:            { 'vitamin-d': 18, multivitamin: 10 },
  focus:             { 'omega-3': 18, multivitamin: 8 },
  'skin-hair-nails': { collagen: 25 },
  'less-stress':     { 'sleep-support': 18, magnesium: 10 },
  recovery:          { aminos: 15, collagen: 8 },
  health:            { multivitamin: 15, 'omega-3': 10 },
  'gut-health':      { probiotic: 20, greens: 12, fibre: 12 },
  menopause:         { menopause: 22, adaptogen: 10 },
}
