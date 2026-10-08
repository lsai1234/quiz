import type { FormEvent } from 'react'

/**
 * The contract every giveaway design implements.
 *
 * Purely presentational: the container (`GiveawayEntry`) owns fetching,
 * storage and submission, and hands a view everything it needs to draw any
 * state. That split is what lets the lab render every state side by side
 * without a network, and lets a redesign swap the view without touching the
 * entry logic.
 */
export interface GiveawayViewProps {
  /** As configured in the Founders Hub, e.g. "Win £200 of supplements". */
  prize: string
  /** A rehearsal: everything must visibly say it is not a real draw. */
  test: boolean
  /** "Closes 30 Nov", or '' when no date is set. */
  closes: string
  /** Extra entries for sharing the card. 10. */
  bonus: number
  /**
   * The person's own giveaway card (a 9:16 poster of their stack, 1080×1920),
   * or null while unavailable. It is the thing they share for the bonus.
   */
  cardImageUrl: string | null
  /** invite: not entered, form closed · form: email form open · entered: done. */
  phase: 'invite' | 'form' | 'entered'
  email: string
  status: 'idle' | 'sending' | 'invalid' | 'closed' | 'error'
  /** They shared the card before entering; the bonus lands when they enter. */
  pendingShare: boolean
  /** Non-null exactly when phase === 'entered'. tickets is 1, or 1 + bonus once shared. */
  entry: { email: string; tickets: number; shared: boolean } | null
  onOpen: () => void
  onEmailChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onShare: () => void
}
