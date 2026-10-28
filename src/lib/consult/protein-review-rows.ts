/**
 * The protein check's words in the review pack (Phase 5 proposal 2): the
 * basis lines, the controls, and the verdict for each outcome, for an example
 * builder at 75–90kg (a 130–180g range).
 */
import type { ReviewRow } from './review-pack'
import { MEAL_PROMPT, PROTEIN_BASIS_LINE, PROTEIN_COPY, proteinEvidence, proteinVerdictLine, type ProteinMeasure } from './protein'

const TARGET = { lowG: 130, highG: 180, basis: 'lifting' as const }
const OUTCOMES: [string, ProteinMeasure][] = [
  ['A gap of a scoop or more (protein-gap strongly towards)', { intakeG: 55, target: TARGET, gapG: 75, verdict: 'big-gap' }],
  ['A small gap (no nudge)', { intakeG: 115, target: TARGET, gapG: 15, verdict: 'small-gap' }],
  ['In range (protein-gap away)', { intakeG: 145, target: TARGET, gapG: 0, verdict: 'on-target' }],
  ['Above range (protein-gap away)', { intakeG: 200, target: TARGET, gapG: 0, verdict: 'over' }],
]

export function proteinRows(): ReviewRow[] {
  const where = 'The protein check, after the plate (protein.ts)'
  return [
    ...Object.entries(PROTEIN_BASIS_LINE).map(([basis, line]): ReviewRow => ['Protein check', where, line, `Under the question, for someone whose range is “${basis}”. Says what we know, never the number`]),
    ...Object.entries(PROTEIN_COPY).map(([key, line]): ReviewRow => ['Protein check', where, line, `Control: ${key}`]),
    ...Object.entries(MEAL_PROMPT).map(([meal, line]): ReviewRow => ['Protein check', where, line, `Counted day: ${meal}`]),
    ...OUTCOMES.flatMap(([when, m]): ReviewRow[] => {
      const v = proteinVerdictLine(m)
      return [['Protein check', where, `${v.headline} ${v.detail}`, `Verdict, same screen: ${when}`]]
    }),
    ['Protein check', 'Pinpoint evidence and the protein need’s reason (protein.ts)', proteinEvidence(OUTCOMES[0][1]), 'Shown back to them as evidence, and as the reason on a protein product. Never sent to the AI'],
  ]
}
