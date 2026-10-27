# Offer Phase 4: proposals (approved and built)

> **Status.** Approved as recommended (partner code that loses to the gift:
> no discount, referral kept) and built. `BONUS_AT_CHECKOUT` is now true; the
> hub's switch decides whether customers see the gift. One difference from
> the proposal below: the webhook doesn't re-read the Stripe line's metadata,
> because the order already carries the gift from the server's own check
> (`Order.bonus` and the `bonus` line); Stripe's line is display only. The
> address-only match is honoured as proposed, with no note. The rest of this
> document is the proposal as approved.

Phase 4 items 3, 4 and 5 change payment logic, Stripe objects and what goes to
PowerBody, so under the plan's rules they are proposed here before anything is
built. Until they are approved and built the bonus cannot reach a customer:

- `BONUS_AT_CHECKOUT` (`src/lib/offer/public.ts`) is `false`.
- `GET /api/offer` reports the bonus as off to every visitor, whatever the hub
  switch says. `OFFER_BONUS_PREVIEW=1` shows it on a preview server so the page
  can be reviewed.
- `/api/cart` refuses every bonus claim with `not-ready` ("free gifts can't be
  added to orders yet. Nothing has been charged"), even in preview. So no order
  is ever taken that promises a gift it doesn't carry.

What is built and live behind those gates: the results page layout (Start here,
Or get the full stack, the bonus lines and conditions, the sticky bar following
the chosen option), the receipt's free line, the page's half of codes vs the
bonus, and the draft terms at `/legal/free-gift`.

## 3. Codes and the bonus: the server half

**Built on the page.** When a code is applied and the depth comes with a bonus,
the page compares what the code takes off this order (priced with and without
it, through the same `calculatePricing` as the receipt) with the bonus's shop
price (`codeOrBonus`):

- Code worth more: the code stays, no gift, and the receipt says "Your code is
  worth more than the free {bonus}, so you've got the code."
- Gift worth more (or equal): the code comes off and the code box says why. An
  advertised daily code the gift would beat isn't shown beside it.

**Proposed for the server.** The page's decision isn't enough on its own,
because the checkout falls back to the referral cookie (`resolveCheckoutCode`),
so a code can arrive at `/api/cart` that the page took off.

1. In `/api/cart`, when a bonus claim and a code arrive together, price the
   order with and without the code and apply the same `codeOrBonus` rule.
2. Code worth more: refuse the bonus (409, `reason: 'code'`), nothing charged;
   the page drops the gift and shows the receipt line above.
3. Gift worth more: price the order without the code and carry on. The order
   notes say "code {X} not applied: free {bonus} worth more".
4. **Your call:** a partner's code that loses to the gift. Recommended: no
   discount, but the order still records the partner's referral (attribution
   only, no commission rule changes). The alternative is that partner codes
   always beat the gift, so a partner's link never loses its discount.

## 4. How the bonus appears in Stripe

**One-off (Checkout, `mode: 'payment'`).** One extra line item:

- `price_data.unit_amount: 0`, `quantity: 1`
- `product_data.name: "Free: {product title}"`
- `product_data.metadata: { line: 'bonus', productId, variantId }`

The session total doesn't change. Stack lines, the stack discount and the
delivery line are built exactly as now, so the charge matches the page. The
bonus is never priced in.

To check in Stripe test mode first: that Checkout accepts a £0 line item in
payment mode. If it doesn't, the fallback is no Stripe line: the bonus is named
in the session's `custom_text.submit` ("Includes a free {product}") and on our
own receipt and confirmation email, and it's recorded on the order either way.

**Subscription (Checkout, `mode: 'subscription'`).** A one-time £0 line item
alongside the recurring ones. In subscription mode Stripe puts one-time line
items on the first invoice only, which is exactly "first box only". Same name
and metadata as above. The same £0 test-mode check applies; the fallback is a
£0 invoice item added to the first invoice by the webhook.

The webhook reads the `line: 'bonus'` metadata and checks it against the claim
the order was created with. A bonus line that doesn't match is dropped from
fulfilment and flagged for review.

## 5. Fulfilment

- **On the order.** One new optional field on the order document (stored in
  the existing `data` JSON column; no table or migration change):
  `bonus: { productId, variantId, sku, title, worth, supplierCost, level }`.
  `worth` is its shop price at the time; `supplierCost` is PowerBody's price
  ex VAT, as `OrderLine.supplierCost` is.
- **To PowerBody.** The bonus goes as an ordinary line on the same supplier
  order, quantity 1, its own SKU, so it ships in the same parcel. No change to
  how delivery is charged to us beyond its weight, which the margin check
  already counts (`stackMargin` includes its grams).
- **Cost recorded.** The order's economics (contribution, margin) include the
  bonus's cost, so the hub's order and margin views show what it cost us.
- **Hub order view.** The line carries a "Bonus" badge and shows £0.00 paid
  and its cost to us.
- **Sold out after payment.** If the supplier stock check at send time finds it
  gone, the order is sent without it and the customer gets one email saying so
  (the gift was free, so there is nothing to refund). The terms say this.
- **Subscriptions.** Only the first box's supplier order carries it. Renewals
  never do.

## First order only (from Phase 3, still awaiting approval)

Signed-in customers are checked before payment. Guests are checked at the
webhook by email, Stripe customer and delivery postcode with the first address
line. If a repeat is caught after payment, the bonus line is removed in the
review queue and the customer is emailed. When only the address matches, the
gift is honoured. The draft terms describe this check; they change if this
proposal does.

## Terms: decisions in the draft

The draft at `/legal/free-gift` (`src/lib/offer/terms.ts`, in the review pack)
makes three choices that need a yes:

1. **Returns:** you don't send the gift back and nothing comes off the refund
   for it. If a part-return leaves the order under the minimum, you keep the
   gift and aren't charged for it.
2. **Sold out after payment:** sent without it, with an email.
3. **Codes:** whichever is worth more, as in item 3.
