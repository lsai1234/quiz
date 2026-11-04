/** The words of "Reorder" (Option 2). Scripted, in the review pack (`checkInCopyRows`). */
export const REORDER_COPY = {
  eyebrow: 'Reorder',
  heading: 'Your box, again',
  headingWithout: 'Your box, without what you’ve stopped',
  leftOut: (products: string) => `Left out: ${products}.`,
  priceNote: (total: string) => `${total} at today’s shop prices. Your discounts and delivery are worked out at checkout.`,
  cta: 'Continue to checkout',
  failed: 'Something went wrong starting the checkout. Try again in a moment.',
  empty: 'There’s nothing left in this box to reorder.',
} as const
