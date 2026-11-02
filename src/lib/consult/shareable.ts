/**
 * Patterns that may name a shared card, and so the one result name everywhere
 * (`readIdentity`): a shared image never carries health information (plan
 * Phase 8). Left out (docs/share-cards-proposal.md): weight loss (eating
 * less), eating too little for training (running on empty), and what reads as
 * a body changing with age (stiff starter, keeping strong, staying sharp,
 * broken nights).
 */
import type { PatternId } from './pinpoint/types'

export const SHAREABLE_PATTERNS: readonly PatternId[] = [
  'crash',
  'wired',
  'short-sleep',
  'protein-gap',
  'not-recovering',
  'caffeine-train',
  'sweat',
  'plant-gap',
  'indoor',
  'weekend-warrior',
]

export const isShareablePattern = (id: string): id is PatternId => (SHAREABLE_PATTERNS as readonly string[]).includes(id)
