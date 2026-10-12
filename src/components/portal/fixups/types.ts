/**
 * What a Fix-ups pass tells the card around it.
 *
 * Each pass already scans the catalogue to decide what it would touch, so it is
 * the pass that knows the count — the card only shows it. Reported up rather
 * than fetched twice, so the number in the closed card and the number in the
 * open panel can never disagree.
 */
export interface FixupSummary {
  /** Products this pass would touch right now; null while it is still counting. */
  count: number | null
  /** One line: what it would do, to how many. */
  line: string
}

/** The two props every pass takes when it sits on the Fix-ups page. Both optional: a pass works on its own too. */
export interface FixupPanelProps {
  onSummary?: (summary: FixupSummary) => void
  /**
   * True while the pass is running. The card stays open until it is false
   * again — collapsing a running pass hides the only Stop button there is.
   */
  onRunningChange?: (running: boolean) => void
}
