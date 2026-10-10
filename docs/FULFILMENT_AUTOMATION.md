# Fulfilment automation — stock, sending, and when an item can't be sent

What happens between a customer paying and a parcel leaving PowerBody, and the
three decisions behind it. Written after order `ord_b73fd33588cdd5b00a` was refused
because one of its four items (`P51016`, Vitamin D3 + K2) had sold out after the
customer paid.

---

## 1. Don't sell what PowerBody can't send — stock is checked at checkout

**Before:** the shop and quiz grey out a sold-out variant, but only from the
catalogue's own flag. That flag is as old as the last nightly sync, and the sync
reads PowerBody's list feed, which stops at ~3,000 products of 8,000+ — so a
product past that point never had its stock refreshed at all. The checkout server
didn't re-check anything.

**Now:** `/api/cart` (shop and quiz) and `finalizeCheckout` (subscriptions) refuse a
sold-out item before a code is claimed or Stripe is asked for anything, with a
sentence naming the item ("Sorry — Vitamin D3 + K2 has just sold out. Swap it in
your stack and try again — you have not been charged.").

- The catalogue flag is checked first (free), then PowerBody is asked **live** about
  exactly what is in the basket, by PowerBody product id — one call per product, no
  paging (`lib/supplier/stock-check.ts`).
- It **fails open**: if PowerBody don't answer within 5s
  (`CHECKOUT_STOCK_DEADLINE_MS`), the catalogue's word stands and the sale goes
  ahead. A rare miss is caught before sending (below). Refusing customers' money
  because a supplier API is slow is the worse failure.
- Whatever PowerBody said is written back onto the catalogue
  (`rememberLiveStock`), so the shop stops offering what just sold out — including
  products the nightly sync never reaches.

## 2. Send paid orders automatically — but only the boring ones

**Settings → Supplier → Send paid orders automatically.** Off by default; only
active while Order sending is live. Turning it on asks for confirmation.

When payment is confirmed (the Stripe webhook, a subscription renewal, a mock
checkout), the order is checked and, if clean, sent to PowerBody straight after the
response — no one presses Send. **Clean** means:

- the send's own gate passes (address, somewhere PowerBody deliver, SKUs);
- every item has a PowerBody code;
- a phone or email for the courier;
- **every item confirmed in stock at PowerBody, live** — here stock fails *closed*:
  if PowerBody can't confirm it, a person looks;
- not a free order (founder code / partner starter) — those always get a look.

Anything else is **held**: it stays in the review queue with
"Not sent automatically: …" written on it, an `auto_send_held` timeline entry, and a
push notification to your phone. A refusal from PowerBody is recorded the same way.

Exactly once: the order is claimed (`Order.autoSend`) before anything happens, so
the webhook trigger and the daily sweep can't both send it, and a race with a
founder's press is answered `ALREADY_EXISTS` by PowerBody, which reads as success.
The daily job catches anything the payment-time trigger missed — **only orders paid
after the switch was turned on**, so switching it on never sends a backlog nobody
has looked at.

## 3. When an item can't be sent after payment — swap, split, or refund

With (1) and (2), the window for this is minutes, not days. It still happens. Each
item on an order that PowerBody don't hold yet now has a **Change** button on the
order page, which asks PowerBody live about the item and the closest replacements,
and offers three answers:

| | What happens | Money | Customer email |
|---|---|---|---|
| **Swap** | The closest like-for-like product goes instead — or **any product picked by searching the catalogue** | Cheaper → the gap is refunded. Dearer → we absorb it | "We've sent X in its place… reply for a refund" |
| **Send the rest now, this later** | The item moves into its own linked order, held until it's back; the rest can go now | None. Second parcel's postage is on us | "X will follow separately… reply for a refund" |
| **Remove and refund** | The item comes off; the rest ships | That line, refunded to their card | "We've taken it off and refunded £X" |

Why these, and why a founder chooses:

- **Swaps are like-for-like and never less safe.** Same swap group, and the
  replacement must keep every promise the original made — vegan stays vegan,
  stimulant-free stays stimulant-free, no new contraindication (pregnancy,
  medication). Without the customer's quiz answers on a one-off order, the
  original product is the best statement of what suits them.
- **Picking by hand is allowed, and honest.** "Or pick any product" searches
  everything in stock by name, brand, flavour or code, any category, with a
  flavour/size picker. Whatever the pick drops from the original ("Not vegan — the
  original was", "Contains stimulants") is shown on it, a swap like that needs a
  second press ("Swap anyway"), and what was accepted is written on the timeline.
- **A one-off customer never agreed to substitutes in advance**, unlike a
  subscriber (who chose a change policy at checkout — `lib/changes/policy`). So
  every email offers a refund by reply, and a person decides rather than an
  automatic rule. Subscriptions keep their existing automatic policy for future
  boxes.
- **The split-off order is a real order.** It shares the original payment, sits in
  the queue as *held* with "Waiting for … to come back in stock", and can later be
  sent, swapped, or refunded — for its own value only. The daily job checks
  back-orders: back in stock → sent automatically (if on), or flagged "Back in
  stock — ready to send" with a push.
- **Refunds are exact.** A partial refund goes against the order's Stripe payment
  for exactly the line (idempotent per line, so a double press can't pay twice),
  *before* the order records it. The order-level Refund button now refunds what the
  order is worth *now* for a split or partly-refunded order, instead of the whole
  payment.

Emails are sent as soon as the founder presses the button (the press is the
decision), or wait in Founders Hub → Emails when no provider is set up. There's a
tick-box to skip the email.

### Known gap

Partner commission is accrued on the order's value when it's paid, and isn't
reduced when one line is refunded (it is reversed in full when a whole order is
refunded). Adjust by hand in Partners if it matters for a particular order.

---

## Files

| File | Role |
|---|---|
| `src/lib/supplier/stock-check.ts` | Live stock, by product id; shortfalls, unconfirmed, what came back |
| `src/lib/supplier/sync.ts` → `rememberLiveStock` | Writes live answers back onto the catalogue |
| `src/app/api/cart/route.ts`, `src/lib/checkout/finalize.ts` | Refuse sold-out items at checkout |
| `src/lib/orders/auto-send.ts` | Automatic sending, the hold reasons, the daily sweep, back-order release |
| `src/lib/supplier/ordering.ts`, `src/lib/portal/store.ts` | The switch, and when it was turned on |
| `src/lib/orders/line-changes.ts` | Swap / send later / remove-and-refund, exact refunds, emails |
| `src/components/portal/OrderLineChange.tsx` | The Change panel on an order |
| `src/lib/notify/templates.ts` → `orderItemUpdate` | The customer email, three versions |
