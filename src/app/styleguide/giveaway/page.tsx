import { sharePersonas } from '@/lib/share-card/personas'
import { cardImageUrl } from '@/lib/share-card/share-link'
import { Board } from './Board'

/**
 * The giveaway ticket at the foot of the results page, in every state.
 * `GiveawayEntry` owns the logic; this reviews `GiveawayEntryView`.
 */
export const dynamic = 'force-dynamic'

export default function GiveawayStyleguide() {
  const payload = sharePersonas()[0].payload
  return <Board thumb={cardImageUrl(payload, 'entry')} />
}
