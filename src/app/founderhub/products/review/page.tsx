import { ReviewQueue } from '@/components/portal/review/ReviewQueue'

/**
 * Review — the queue of products added from PowerBody and not yet on sale.
 *
 * Only the queue lives here. Each product is checked on its own page (the same
 * page it keeps once it is on sale), opened in queue mode so that page can show
 * "3 of 12 · Skip · Back to the queue". The field-by-field editor this screen
 * used to open in place of the list was a second way to change a product, and
 * it is gone — see `ReviewQueue` for what stayed and why.
 */
export default function ReviewPage() {
  return <ReviewQueue />
}
