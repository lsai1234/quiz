import { sharePersonas } from '@/lib/share-card/personas'
import { cardImageUrl } from '@/lib/share-card/share-link'
import { Lab } from './Lab'

/** Giveaway design C, every state. See `../types.ts`. */
export const dynamic = 'force-dynamic'

export default function Page() {
  const payload = sharePersonas()[0].payload
  return <Lab thumb={cardImageUrl(payload, 'entry')} payload={payload} />
}
