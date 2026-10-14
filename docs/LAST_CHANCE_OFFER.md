# The last-chance offer — proposal and build

At the very foot of the quiz results page, below the plan, the small print and
the giveaway, somebody who has scrolled past their whole stack without buying
it gets one more, smaller, yes: **the single product from their stack that will
do the most for them, at a price the business can afford, one tap from paying.**

Review every state at `/styleguide/last-chance`.

---

## What the customer sees

> **NOT READY FOR THE WHOLE STACK?**
> **Start with the one that matters most.**

A spotlight card that arrives as it scrolls into view:

- **Your #1 pick** — their best-fitting product, floating in a beam of light
  with a ring that charges round it, and a **−15% OFF** stamp pressed on.
- **Why it's the one** — the engine's own reason it is in *their* stack.
- **What it does** — the approved claim wording for that kind of product.
- **When you'll notice it** — "right away", "within a few weeks", or, for
  things you never consciously feel (protein, vitamins), how it works instead.
- **How long it lasts** — "one pack lasts about six weeks at your usage".
- **The price falls** from list to offer as it arrives, with delivery and the
  all-in total stated plainly, and one button: **Get it for £25.49 →**.
- "Just this, once — no subscription. Pay on the next screen." and a way back
  to the full stack.

**Reveal or straight to buy?** Both, without a gate: it reveals itself on
scroll, and the one remaining tap buys. A "tap to reveal" button would spend a
tap at the point attention is lowest. Reduced motion gets the finished card.

**Seamless:** one-off orders are guest checkout — no account, no consent gate.
The tap goes straight to Stripe's payment page (in mock mode, straight to the
order confirmation).

---

## Which product

`lib/last-chance/pick.ts`. Every product in the stack is scored on:

| Signal | Weight |
|---|---|
| The engine's fit for this person (`confidenceScore`, 0–100) | as is |
| The stack can't do without it (`required`) | +15 |
| You'll *notice* it — immediate / few weeks / couple of months / never felt | +12 / +8 / +3 / 0 |
| Founders' priority (`recommendationPriority`) and Top 25 rank | up to +10 each |

…but only products that can be **sold on their own at a profit** are eligible:
in stock, not a subscription-only refill, and passing the economics below. A
cheap product whose parcel costs more than it makes is skipped, not discounted
harder. If nothing passes, the section doesn't render. A stack of one product
gets no offer.

---

## The money — why the discount is worked out, not chosen

A product sold alone is this business's worst case. PowerBody charge us **£6.50**
to post an order under £50 of wholesale (£5.50 from £50 to £99), and we collect
**£4.95** under £40 or **£2.95** from £40 to £100 — so the parcel loses money
before the goods are counted. We are not VAT-registered, so PowerBody's VAT is a
real cost (every supplier figure × 1.2).

So every offer is run through the same `unitEconomics` waterfall the Founders
Hub pricing pages use — VAT, goods, **both sides of delivery**, card fees (1.5% +
20p) and the returns provision — and takes the **deepest rung of 20 / 15 / 10 /
5% that still leaves at least £3.00, and at least 10% of what we keep**. If even
full price doesn't clear that, no offer is made. Never 25%: that's the daily
code's.

Worked across the catalogue's pricing rule (list = 2 × cost):

| List price | Our cost (ex VAT) | Offer | Customer pays | We keep at full price | We keep with offer |
|---|---|---|---|---|---|
| £11.99 | £6.00 | not offered | — | £1.22 | — |
| £17.99 | £9.00 | full price | £22.94 (incl. £4.95 delivery) | £3.53 | £3.53 |
| £19.99 | £10.00 | 5% off → £18.99 | £23.94 (incl. £4.95 delivery) | £4.30 | £3.32 |
| £23.99 | £12.00 | 10% off → £21.59 | £26.54 (incl. £4.95 delivery) | £5.84 | £3.48 |
| £29.99 | £15.00 | 15% off → £25.49 | £30.44 (incl. £4.95 delivery) | £8.15 | £3.72 |
| £35.99 | £18.00 | 15% off → £30.59 | £35.54 (incl. £4.95 delivery) | £10.46 | £5.15 |
| £39.99 | £20.00 | 20% off → £31.99 | £36.94 (incl. £4.95 delivery) | £12.00 | £4.12 |
| £49.99 | £25.00 | 15% off → £42.49 | £45.44 (incl. £2.95 delivery) | £13.88 | £6.50 |
| £59.99 | £30.00 | 20% off → £47.99 | £50.94 (incl. £2.95 delivery) | £17.73 | £5.91 |
| £79.99 | £40.00 | 20% off → £63.99 | £66.94 (incl. £2.95 delivery) | £25.43 | £9.67 |

Further guards:

- **A product with no cost on file** is costed at the site-wide pessimistic
  estimate and capped at 10% off.
- **Under the £15 minimum order** — no offer (checkout would refuse it).
- **A saving has to be real on the whole order** — at least £1 and most of the
  headline — so a discount can never be eaten by postage.
- **Over £50, the 8% bundle tier** already applies to a single product; the
  offer replaces it (the deeper wins), never stacks.

The floor (`OFFER_FLOOR`) and the ladder (`OFFER_LADDER`) are two constants in
`lib/last-chance/economics.ts` — easy to tune. The trade-off to decide: the
offer gives away margin to win a sale that otherwise doesn't happen (e.g. a
£39.99 product keeps £4.12 at 20% off instead of £12.00 at full price).

---

## How it can't be gamed

The browser never sends a price to charge. It sends the variant and the price it
was shown; `/api/cart` re-runs `quoteOffer` on the catalogue's own price and cost
and bills that.

- A request showing a lower price than the server's is stopped (the card shows
  the new price and asks again). A higher one goes ahead — good news only.
- The offer is for **one product on its own**: any other basket shape is
  refused, not discounted.
- **No codes on offer orders**, typed or referred: a code could replace the
  checked price with an unchecked one, and a partner referral would add up to
  15% commission the floor didn't count. *(Decision for the founders: this
  means a referred customer's single-product offer purchase isn't credited to
  their partner. The partner keeps the credit for the stack they referred
  somebody to. Reversible — see `wantsOffer` in `/api/cart`.)*
- The order's audit trail records it: `last-chance offer: 15% off CHRGD
  Pre-Workout (list £29.99)`.

---

## Fixed along the way

**Delivery was charged on the wrong basis.** The receipt, basket and bundle
pages all promise free delivery "on what the basket is worth" (before its
discount), but `/api/cart` banded it on the discounted total. A £103.96 stack
was shown "Free delivery" at £95.64 and charged £2.95 by Stripe. Checkout now
bands on the undiscounted subtotal, matching every screen. *(This collects
less delivery on discounted baskets whose list value is £100+ but whose paid
total is under £100 — about £100–£109 with the bundle deal, more with a code —
the honest version of what was already advertised.)*

---

## Measuring it

Two new events: `last_chance_view` (it revealed) and `last_chance_buy` (the tap),
plus `checkout_start` / `checkout_error` with `source: last_chance`, and orders
on the `quiz` channel carrying the `offer` audit event. Read `last_chance_buy`
against `stack_reveal_view` and `purchase` — the question is whether it wins
sales from people who would have left, or takes them from the full stack.

## Files

- `src/lib/last-chance/economics.ts` — the safe-discount engine (`quoteOffer`).
- `src/lib/last-chance/pick.ts` — choosing the product (`pickHeroOffer`).
- `src/app/api/cart/route.ts` — server enforcement (`lastChance`), delivery basis.
- `src/hooks/useOfferCheckout.ts` — the one-tap checkout.
- `src/components/stack-review/LastChance.tsx`, `LastChanceView.tsx` — the card.
- `src/app/styleguide/last-chance/` — every state.
