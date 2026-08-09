import { redirect } from 'next/navigation'

/** Commerce opens on the queue — it is the only part with a deadline. */
export default function CommerceIndex() {
  redirect('/founderhub/commerce/queue')
}
