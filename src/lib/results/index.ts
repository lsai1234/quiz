/**
 * The results page's "why these": the goal-to-claim map, the explanation
 * logic, and every sentence it may show (phrases.ts).
 */
export {
  ANY_CLAIM, GOAL_CLAIMS, goalClaimFor, goalsBackedBy, isAnyClaim, productClaim,
  type AnyClaim, type GoalClaimEntry, type GoalClaimLink,
} from './goal-claims'
export {
  ANSWER_LINE_NEEDS_CLAIM, MAX_CHECK_LINES, explainProduct, explainSlot, whatWeChecked,
  type ProductExplanation,
} from './explain'
export {
  ACTIVE_NAMES, ANSWER_LINES, CHECK_LINES, GOAL_LINES, RESULTS_HEADINGS, activeDisplayName,
  type AnswerField,
} from './phrases'
