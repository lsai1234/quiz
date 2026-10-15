# The last-chance offer — proposal and build

At the very foot of the quiz results page, below the plan, the small print and
the giveaway, somebody who has scrolled past their whole stack without buying
it gets one more, smaller, yes: **a one-time deal on the single product from
their stack that fits them best: free delivery first, then as much off as the
business can afford while still making a little, one tap from paying.**

Review every state at `/styleguide/last-chance`. Tune it in the Founders Hub:
Pricing → Rules → Last-chance offer.

---

## What the customer sees

> **NOT READY FOR THE WHOLE STACK?**
> **Then here's a one-time deal on your top pick.**
> Worked out for your stack, just now. It only exists on this page: it isn't
> in the shop, and no code unlocks it.

A spotlight card that arrives once as it scrolls into view, then stays still:

- **One-time offer**: their best-fitting product lifts into a beam of light
  while a ring charges round it. A **FREE DELIVERY** ribbon sits across it, and
  a **−8% OFF** stamp is pressed on when there is a percentage too.
- **Why it's theirs**: in terms of the goal they gave us, e.g. *You told us
  your top goal is "Build muscle". Of the 3 products in your stack, this is
  the one built around it.*
- **What it does**: one claim from the GB register, verbatim
  (`lib/consult/claims.ts`), or no row at all.
- **What you get**: facts only. *30 servings, £1.11 each, lasts about a month
  at your usage.*
- **Your deal · only on this page**: the deal assembles line by line as it
  arrives:
  - Free delivery, with ~~£4.95~~ struck through.
  - 8% off, with ~~£39.99~~ struck through, now £36.79.
  - The delivered price counts down from £44.94 to **£36.79**, with **You save
    £8.15**.
- One button: **Get it for £36.79 →**, the delivered price. Below it: "Just
  this, once. No subscription. Pay on the next screen." and the Highlands
  surcharge, stated.

**"One-time", honestly.** Everything the card claims about the deal is true by
construction:

- It is worked out here, for this stack.
- It is not in the shop.
- No code unlocks it.
- It is one product, once. Once an order on the deal is confirmed, that
  browser is not offered it again.

There is no countdown and no "ends tonight", because there is no deadline to
state, so none is invented (a false "only available for a very limited time"
is a banned practice under UK consumer law). Every saving is measured against
what the product would really cost delivered through the ordinary checkout:
its shelf price, less the 8% bundle deal a single £50+ product earns anyway,
plus the delivery it would really be charged. The deal must beat that by at
least £1.

**What it never says** (`docs/ORDER_CONFIRMATION_SPEC.md` §5): no timeframes
for results, no outcomes, nothing generated at runtime. The claim id it showed
is checked against the product's own register claims and kept on the order
(`lastChance.claimId`), per OC-C-006.

**Reveal or straight to buy?** Both, without a gate. It reveals itself on
scroll, and the one remaining tap buys. A "tap to reveal" button would spend a
tap at the point attention is lowest. It takes about a second and a half, then
the card is still. Reduced motion gets the finished card.

**Seamless:** one-off orders are guest checkout, so there is no account and no
consent gate. The tap goes straight to Stripe's payment page, where the deal's
own delivery rates are the choices (for example "Free UK mainland delivery").
While the card's button is on screen, the page's sticky "Checkout" bar steps
aside, so there are never two buy buttons.

**When it doesn't show:**
- during a claim;
- once any code is applied (a founder's, a partner's referral or the day's
  code). That is already this visit's deal, and showing a second price beside
  it would only confuse;
- for a stack of one product;
- when nothing in the stack has a deal it can afford.

---

## Which product

`lib/last-chance/pick.ts`. Each product in the stack is scored on:

| Signal | Weight |
|---|---|
| Fit for this person, re-scored fresh with the engine's own `scoreProduct` (0–100) | as is |
| The stack can't do without it (`required`) | +15 |
| It serves the goal they said matters most | +10 |
| There is register wording to say what it does | +5 |

Founders' priority and Top 25 rank are already inside `scoreProduct`, so they
are not added twice.

Only products that can carry **a real deal at a profit** are eligible. They
must be:
- in stock;
- not an accessory;
- not a subscription-only refill;
- not ruled out for this person by a hard gate;
- given a deal by the economics below.

A cheap product whose parcel costs more than it makes is skipped, not
discounted harder. Ties go to the bigger saving.

---

## The money — why the deal is worked out, not chosen

A product sold alone is this business's worst case. PowerBody charge us
**£6.50** to post an order under £50 of wholesale (£5.50 from £50 to £99),
whatever we charge the customer. We collect **£4.95** under £40 or **£2.95**
from £40 to £100. So the parcel loses money before the goods are counted.

Every deal is run through the same `unitEconomics` waterfall the Founders Hub
pricing pages use: the goods, **both sides of delivery**, card fees (1.5% +
20p), the returns provision and, if the switch says we pay it, VAT. The levers
are pulled in this order:

1. **Delivery first: free.** It is the easiest thing to say yes to, and the
   thing that most often stops a small order.
2. **Then a percentage off the product**: the deepest whole percent that still
   clears the floor, up to 25%. Under 5% it is left off, because "free delivery
   + 2% off" reads as a rounding error.
3. **Where free delivery would lose money, delivery is reduced instead**, to
   the lowest of £0.99 / £1.49 / £1.99 / … that clears the floor. There is no
   percentage on top.
4. **Otherwise no deal and no card.** A full price is never dressed up as an
   offer.

**The floor:** every deal still keeps at least **£3.00**, and at least **10%**
of what we take. The pound figure protects cheap products, where a percentage
of very little is very little. The percentage protects dear ones, where £3
would give most of the margin away.

**Priced on its own:**
- It is never combined with the bundle tier, the daily code or a partner's
  code.
- Checkout bills exactly the deal's price and the deal's delivery. The
  Highlands surcharge (£2.95) still applies up there, as it does on free
  delivery everywhere else, because our cost there never goes away.

Worked across the catalogue's pricing rule (list = 2 × cost), as the engine
quotes it, with PowerBody's VAT counted as a cost (as it is until we register):

| Shelf price | Our cost (ex VAT) | The deal | Customer pays, delivered | Instead of | We keep at full price | We keep with the deal |
|---|---|---|---|---|---|---|
| £11.99 | £6.00 | no deal (under the £15 minimum) | — | £16.94 | £1.22 | — |
| £15.99 | £8.00 | no deal | — | £20.94 | £2.76 | — |
| £19.99 | £10.00 | no deal (the most it could do saves under £1) | — | £24.94 | £4.30 | — |
| £23.99 | £12.00 | delivery £2.49 (was £4.95) | £26.48 | £28.94 | £5.84 | £3.42 |
| £25.99 | £13.00 | delivery £1.49 (was £4.95) | £27.48 | £30.94 | £6.61 | £3.21 |
| £29.99 | £15.00 | free delivery | £29.99 | £34.94 | £8.15 | £3.28 |
| £34.99 | £17.50 | free delivery + 5% off | £33.24 | £39.94 | £10.08 | £3.48 |
| £39.99 | £20.00 | free delivery + 8% off | £36.79 | £44.94 | £12.00 | £3.98 |
| £49.99 | £25.00 | free delivery + 13% off | £43.49 | £52.94 | £13.88 | £4.58 |
| £59.99 | £30.00 | free delivery + 9% off the £55.19 it costs alone | £50.22 | £58.14 | £13.01 | £5.20 |
| £79.99 | £40.00 | free delivery + 13% off the £73.59 it costs alone | £64.02 | £76.54 | £19.13 | £6.80 |
| £109.99 | £55.00 | 18% off the £101.19 it costs alone (delivery already free) | £82.98 | £101.19 | £26.60 | £8.66 |

From £50 a single product already earns the 8% bundle deal at the ordinary
checkout, so "Instead of" and "We keep at full price" use that price. The
percentage comes off it, so the saving on the card is one the customer would
not otherwise have had.

Further guards:

- **A product with no cost on file** is costed at the site-wide pessimistic
  estimate and capped at 10% off.
- **Under the £15 minimum order** there is no deal (checkout would refuse it).
- **The deal must beat the ordinary checkout** (the product's own bundle tier
  included) by at least £1. So it is never worse than just buying the product.
- **A product with no cost on file** has its cost estimated once, from the
  shelf price. Estimated at each discounted price instead, the guess would
  fall with every percent off, which PowerBody's price never does.

Every number above is a setting: Founders Hub → Pricing → Rules → Last-chance
offer. The settings are the floor (£ and %), the deepest percentage, the
smallest percentage worth adding, and the cap for uncosted products. The
trade-off they set: the deal gives away margin to win a sale that otherwise
doesn't happen. For example, a £29.99 product keeps £3.28 on the deal instead
of £8.15 at full price.

---

## VAT on our costs

The supplier prices stored in the hub are PowerBody's **ex VAT** prices.
PowerBody add VAT to every invoice, and until we are VAT-registered none of it
comes back. So their 20% on goods and delivery is a real cost, and every deal
above is worked out with it in.

Two switches in Founders Hub → Pricing → Rules → VAT:

- **VAT-registered** (off): flip it the day registration takes effect. Their
  VAT is then reclaimed, we hand over VAT on sales, and the whole hub
  reprices, this offer included.
- **PowerBody charge us VAT** (on): only ever turned off if PowerBody stopped
  charging VAT. Turned off while they still do, every margin is about a fifth
  of cost too generous.

---

## How it can't be gamed

The browser never sends a price to charge. It sends three things: the variant,
the product price it was shown, and the delivery it was shown. `/api/cart`
re-runs `quoteOffer` on the catalogue's own price and cost and bills that.

- **If the server's price or delivery is higher than shown**, the order is
  stopped and the card shows the new deal ("This deal has changed: it's now
  £X delivered") and asks again. Lower goes ahead, because that is only good
  news.
- **A request that doesn't say what delivery it was shown** is held to the
  ordinary charge, so leaving the field out can never loosen the check.
- **The deal is for one product on its own.** Any other basket shape is
  refused, not discounted. So is a product the card would never offer: a
  subscription-only refill or an accessory.
- **If the deal no longer exists** (a setting or a cost changed since the page
  was drawn), the card keeps its place and says so: "This deal isn't
  available any more", with its button stood down.
- **No codes on offer orders**, typed or referred:
  - A code could replace the checked price with an unchecked one.
  - A partner referral would add up to 15% commission the floor didn't count.
  - In practice a referred visitor never sees the offer, because their
    partner's code is applied to the stack automatically and the offer steps
    aside whenever a code is applied. *(Reversible: see `wantsOffer` in
    `/api/cart`.)*
- **A 409 shows only the deal.** Contribution, margin and floor stay on the
  server.
- **The order records the deal three ways:**
  - **Audit trail:** `last-chance offer: free delivery (was £4.95) + 8% off on
    CHRGD Whey Protein (list £39.99, £36.79 delivered); claim shown:
    protein-muscle-growth`.
  - **`lastChance` snapshot:** lets the receipt show "Discount" and "Delivery:
    FREE".
  - **`deliveryDue`:** what each zone was offered at, so the fulfilment queue
    judges a Highlands order against the rate it was actually given rather
    than re-banding it.

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

Two new events, `last_chance_view` (it revealed) and `last_chance_buy` (the
tap), both carrying `discountPct` and `delivery` (free / reduced / included),
plus `checkout_start` / `checkout_error` with `source: last_chance`, and orders
on the `quiz` channel carrying the `offer` audit event. Read `last_chance_buy`
against `stack_reveal_view` and `purchase` — the question is whether it wins
sales from people who would have left, or takes them from the full stack.

## Files

- `src/lib/last-chance/economics.ts` — the deal engine (`quoteOffer`), its
  billing (`priceOfferOrder`, `offerDeliveryOptions`) and `publicQuote`.
- `src/lib/last-chance/pick.ts` — choosing the product (`pickHeroOffer`).
- `src/app/api/cart/route.ts` — server enforcement (`lastChance`), delivery basis.
- `src/lib/stack-blueprint/pricing.ts` — `lastChance` settings; `vat.supplierChargesVat`.
- `src/lib/orders/` — `lastChance` snapshot and `deliveryDue` on the order; the
  receipt's discount line; the queue's Highlands check.
- `src/hooks/useOfferCheckout.ts` — the one-tap checkout.
- `src/components/stack-review/LastChance.tsx`, `LastChanceView.tsx` — the card.
- `src/app/styleguide/last-chance/` — every state.
