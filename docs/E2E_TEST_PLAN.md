# End-to-end test plan

Everything to walk before the first real parcel ships, in the order that makes each step
cheap to debug. Written for a founder with a PowerBody **sandbox** account: sandbox
products, sandbox stock, real code, no money and no parcels until the very last phase.

The point of the ordering is that each phase changes **one** thing. When something breaks
in phase C you already know phases A and B were fine, so the fault is in what C added.

---

## The four switches

Three of these live in **Founders Hub → Settings** and can be flipped at runtime; the
fourth is Stripe's own test/live mode. Everything below refers back to this table.

| | Setting | Where | Values |
|---|---|---|---|
| **Shop** | `NEXT_PUBLIC_DATA_SOURCE` | Settings → Data source | `mock` · `real` |
| **Read** | `SUPPLIER_SOURCE` | Settings → Supplier | `mock` · `powerbody` |
| **Write** | `SUPPLIER_ORDERING` | Settings → Order sending | `simulate` · `live` |
| **Money** | `PAYMENTS_SOURCE` | Settings → Payments (Stripe) | `mock` · `stripe` |

### Phases

| Phase | Shop | Read | Write | Money | What it proves |
|---|---|---|---|---|---|
| **A** Smoke | mock | mock | simulate | mock | Every journey runs at all |
| **B** Sandbox catalogue | mock→real | powerbody | simulate | mock | We can read PowerBody and sell what we import |
| **C** Real money, pretend parcels | real | powerbody | simulate | **stripe (test keys)** | The whole business, end to end |
| **D** One real order | real | powerbody | **live** | stripe (test or live) | PowerBody accept what we send |

**Do not skip C.** It is the only phase where the address, the discount, the invoice
fields and the fulfilment queue are all real at once, and it costs nothing.

---

## Before you start

- [ ] `FOUNDER_1_EMAIL` / `FOUNDER_1_PASSWORD` set — otherwise the Founders Hub locks you out
- [ ] `DATABASE_URL` set if you are testing on Vercel (SQLite does not persist on serverless)
- [ ] Note the sandbox's tells so you don't chase them as bugs: **placeholder names like
      `P64`, uniform prices, stock of exactly 10 or 100, no product detail, and orders that
      fail automatically**. PowerBody put every new API account here until they have seen
      the integration place orders correctly.
- [ ] Ask your account manager to confirm **`getProductInfo` is enabled**. Without it every
      imported product is named after its own SKU.

### Stripe test cards (phase C)

| Card | Does |
|---|---|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 9995` | Declines — insufficient funds |
| `4000 0000 0000 0341` | Attaches fine, then **fails on the renewal charge** — the dunning path |
| `4000 0025 0000 3155` | Requires 3-D Secure |

Renewals: use a **Stripe test clock** on the customer and advance it a month. Waiting for
a real month is not a test strategy.

### Postcodes worth keeping to hand

| Postcode | Should |
|---|---|
| `LS1 4DY` | Zone 1 — normal |
| `IV1 1AA` | Zone 2 — flagged as costing more, still sendable |
| `BT1 5GS` | **Refused** — Northern Ireland |
| `JE2 3AB` / `GY1 1AA` | **Refused** — Jersey / Guernsey |

---

## Phase A — smoke, everything mock

No keys, no supplier, no money. Just proves nothing is broken before you add variables.

- [ ] **A1** `/` — the quiz runs start to finish and produces a stack
- [ ] **A2** `/shop` — products list, filters and categories work, a product sheet opens
- [ ] **A3** `/bundles/leg-day-loading` — the bundle landing page renders and adds to basket
- [ ] **A4** Quiz → one-off checkout → `#mock-checkout` → order appears in **Commerce → Orders**
- [ ] **A5** Quiz → subscription → account created → plan visible in `/myhub`
- [ ] **A6** `/founderhub` — every page loads: Commerce, Products, Pricing, Partners, Actions
- [ ] **A7** Fulfilment queue shows the orders from A4/A5 as `pending`

> **Expected wrinkle:** mock-payments orders have **no delivery address** — Stripe is what
> collects one. They will show in the queue as blocked with "no delivery address", and
> sending one is now refused outright. That is correct behaviour, not a bug. Real address
> testing starts in phase C.

---

## Phase B — the sandbox catalogue

Read PowerBody for real; sell nothing yet.

- [ ] **B1** Set `POWERBODY_API_URL` / `_USER` / `_KEY`, then Settings → Supplier → **Live
      PowerBody**. It should not fall back to mock — if it does, a credential is missing.
- [ ] **B2** Products → PowerBody → **Show me some SKUs** returns codes. This is the only
      way to find a code in a sandbox whose products exist nowhere else.
- [ ] **B3** Paste 3–5 SKUs → each comes back with a name, image, stock, cost and what we
      would charge.
      *If they come back named after their own SKU, `getProductInfo` is not enabled — stop
      and get that fixed; everything downstream inherits it.*
- [ ] **B4** **Add** them → they land in Products → Review as `pending`, and are **not**
      visible in the shop
- [ ] **B5** Review one: confirm the machine-written fields (stack slots, goals, dietary
      tags, card copy). Enter a **shipped weight** if you happen to know one — PowerBody
      don't send one, and a missing weight is a warning, never a blocker.
- [ ] **B6** Approve it → it appears in `/shop`
- [ ] **B7** Look two SKUs up that are flavours of one product → **Add as ONE product** →
      one product with a flavour picker, each variant keeping its own SKU
- [ ] **B8** Try to merge two different *sizes* → refused, naming the differing cost
- [ ] **B9** Products → **Check now** (supplier sync) → stock/cost refresh, nothing
      founder-edited is overwritten
- [ ] **B10** Settings → Data source → **real** → the shop now serves only imported
      products, and the quiz recommends from them
- [ ] **B11** `GET /api/portal/supplier/shipping-methods` → how many delivery services this
      account actually has. One (or an "not callable" error) means their published card is
      the whole story; two or more means real speed options are possible and
      `transport_code` is worth wiring up.

---

## Phase C — the whole business, on Stripe test keys

This is the bulk of the testing. Everything is real except the parcel.

Set `PAYMENTS_SOURCE=stripe` with **test** keys, and point a Stripe CLI webhook listener or
a test-mode endpoint at `/api/webhooks/stripe` with `STRIPE_WEBHOOK_SECRET`.

### C1 · One-off purchases

- [ ] **C1.1** Shop → basket → checkout → pay `4242` → land on `/order/confirmation`
- [ ] **C1.2** The confirmation shows the reference, the lines, the address and the masked
      email; **refreshing it does not double-count** a conversion
- [ ] **C1.3** Order in Commerce → Orders is `paid`, with the Stripe payment intent on it
- [ ] **C1.4** Quiz → stack → one-off checkout (the `quiz` channel, not `shop`)
- [ ] **C1.5** Bundle landing page → checkout
- [ ] **C1.6** Guest checkout (signed out) works and the order carries the Stripe email
- [ ] **C1.7** Basket below the £15 minimum → refused **server-side**, with the shortfall
      named. Try it against `/api/cart` directly, not just the UI.
- [ ] **C1.8** Abandon a checkout (close the Stripe page) → the order does not sit as
      `pending_payment` forever: `checkout.session.expired` fails it, and the daily sweep
      catches any whose webhook never arrived
- [ ] **C1.9** Decline card `4000 0000 0000 9995` → no order is marked paid
- [ ] **C1.10** Delivery is charged and consistent end to end — see the delivery section
      below, which is worth walking as its own pass.

### C2 · Subscriptions

- [ ] **C2.1** Quiz → stack → **subscribe** → account created inline (email + password) →
      Stripe subscription checkout → `/myhub` shows the plan `active`
- [ ] **C2.2** Same journey via **OAuth** (Google): the pending checkout survives the
      provider round-trip and resumes at `/api/checkout/continue`
- [ ] **C2.3** The **first box** is raised as an order — check `ord_inv_<invoice id>` exists
      in Commerce → Orders with channel `subscription`
- [ ] **C2.4** The delivery address Stripe collected is on the **subscription**, and on that
      first order
- [ ] **C2.5** Advance a **test clock** one month → a renewal order is raised, and the
      subscription clock advances **once** (not twice — the first invoice must not count)
- [ ] **C2.6** Redeliver the same `invoice.paid` from the Stripe dashboard → **no second
      order**, and the clock does not move again
- [ ] **C2.7** Renewal fails (`4000 0000 0000 0341` + test clock) → plan stays `active`,
      `billingStatus` becomes `past_due`, **exactly one** dunning email in the outbox
      across all of Stripe's retries
- [ ] **C2.8** A later successful payment clears `past_due`
- [ ] **C2.9** Cancel in the **Stripe dashboard** → `/myhub` reflects it (the hub must not
      disagree with the thing holding the card)
- [ ] **C2.10** Pause in Stripe → hub shows paused

> **Worth deliberately racing (C2.11):** Stripe does not promise event order, and a
> subscription's first `invoice.paid` can arrive before the `checkout.session.completed`
> that links it. The webhook now answers **503** to that so Stripe retries. If you can
> replay events out of order from the dashboard, confirm the first box still gets raised.

### C3 · The hub (`/myhub`)

- [ ] **C3.1** Swap a product in the plan → billing impact shown before confirming
- [ ] **C3.2** Add a product / remove a line → totals update
- [ ] **C3.3** Change the delivery date; check the delivery calendar
- [ ] **C3.4** Cancel → the save flow offers alternatives → confirm → settlement figure is
      calculated against **paid cycles**, not calendar months
- [ ] **C3.5** Billing portal button reaches Stripe's portal
- [ ] **C3.6** Check-in / feedback flow records
- [ ] **C3.7** A substitution suggested after a stock-out respects the **safety constraints
      snapshotted at signup** — not whatever the quiz answers say today

### C3b · The exit journey

The settlement is a charge, so it wants walking properly. `/myhub` → Plan →
**Manage subscription** → *Cancel*.

- [ ] **C3b.1** The statement lists **every box with its contents** and **every payment**,
      and the totals add up to the balance shown
- [ ] **C3b.2** Cancel in month 1 of a plan with a multi-month tub → a balance is owed;
      cancel at the free-exit month → **£0.00**
- [ ] **C3b.3** **"Or leave free in N months"** appears with a real figure, and choosing it
      schedules rather than charges — check the hub banner appears afterwards
- [ ] **C3b.4** The scheduled exit **fires by itself**: advance a test clock to that month
      and the plan cancels with nothing charged
- [ ] **C3b.5** *"Actually, keep my plan"* on the banner clears the schedule
- [ ] **C3b.6** Settle now → a **Stripe invoice** is raised and paid; it appears in the
      member's billing portal
- [ ] **C3b.7** **Declined card** (`4000 0000 0000 9995` as the default payment method) →
      the plan **still cancels**, and the invoice is left open and payable
- [ ] **C3b.8** Press Confirm twice quickly → **one** invoice, not two (idempotency)
- [ ] **C3b.9** A member in credit (pause or skip a few months first) → the statement says
      **"We owe you £X"** rather than £0.00

**Waivers** — each should show its own explanation, not a bare £0.00:

- [ ] **C3b.10** Within 14 days of the **first delivery** → statutory waiver, mentions
      returning unopened products
- [ ] **C3b.11** During a price-increase notice period → waived
- [ ] **C3b.12** Just after we substituted a product (out of stock) → waived
- [ ] **C3b.13** A member who has never accepted the settlement terms → waived, and this
      beats every other reason

**Tamper checks** — the figure is a charge, so treat it as one:

- [ ] **C3b.14** POST `/api/hub/subscription/cancel` with `expectedSettlement: 0` on an
      account that owes money → **409**, no charge, the real figure returned
- [ ] **C3b.15** The same call while signed out → **401**
- [ ] **C3b.16** An account with orders belonging to *another* member → their history must
      not appear in the statement

> In **mock payments mode nothing is collected** — the exit records the amount with
> `paid: false` and logs a warning. That is deliberate (an exit record claiming a charge
> that never happened would be worse), but it means C3b.6–C3b.8 need Stripe test keys.

### C4 · Discounts, codes and the intro offer

Three different discounts that can all touch one basket. The rule that matters: **a partner
code REPLACES the bundle tier rather than stacking on it**, and the margin floor applies
underneath everything.

- [ ] **C4.1** Basket over £50 → the bundle tier discount appears, and Stripe charges the
      discounted amount (the number on screen and the number on the card must match)
- [ ] **C4.2** Partner code on a **quiz stack** → applies, order records the code
- [ ] **C4.3** Partner code on a **subscription** → applies to month one only; month two
      bills full
- [ ] **C4.4** Partner code on a **plain shop basket** → **refused**. Codes work on `quiz`
      and `subscription` channels only.
- [ ] **C4.5** £50+ basket on the 8% tier **plus** a 25% code → pays 25%, not 31%
- [ ] **C4.6** Invalid / paused / capped-out code typed in → checkout is stopped with a
      readable reason and the basket survives
- [ ] **C4.7** A code arriving only from a **referral link cookie** (never typed) that is
      no longer valid → the checkout goes through, attributing nothing. It must not fail.
- [ ] **C4.8** Scratch-to-reveal intro offer → the rate is allocated server-side; scratching
      and leaving costs nothing; checking out banks it once
- [ ] **C4.9** Tamper: send a made-up `introDiscountRate` to the finalize endpoint → it is
      re-validated against the configured outcomes and claims nothing
- [ ] **C4.10** Commission shows up in Partners → the partner's ledger, and reverses when
      the order is refunded

### C5 · Fulfilment queue — still `simulate`

- [ ] **C5.1** The day's orders are grouped by the day they were **paid**
- [ ] **C5.2** Approve / hold / reject each behave, and none of them move money
- [ ] **C5.3** An order to `BT1 5GS` shows **undeliverable** and cannot be sent
- [ ] **C5.4** An order to `IV1 1AA` shows **Zone 2** and can be sent
- [ ] **C5.5** An order with a line missing a supplier SKU is blocked
- [ ] **C5.6** Send the approved orders → button reads "**Simulate** sending N approved",
      and the confirmation says a simulation happened
- [ ] **C5.7** Each order records `supplierSimulated: true`, walks to
      `submitted_to_supplier`, syncs status and tracking, and reaches `shipped`
- [ ] **C5.8** Refund an order from the hub → money moves in Stripe **and** the commission
      reverses
- [ ] **C5.9** Refund from the **Stripe dashboard** instead → the order still shows refunded

### C5b · The exit queue (Founders Hub → Commerce → Exits)

- [ ] **C5b.1** A cancelled plan with a settled balance appears as **Collected**
- [ ] **C5b.2** One whose card declined appears as **Owed**, and the `owed` total at the
      top reflects it
- [ ] **C5b.3** **Waive** and **write off** both demand a note, and the note plus the
      founder's email show on the row afterwards
- [ ] **C5b.4** A written-off balance stops counting towards `owed` — that total is the
      measure of whether this feature is working, so it must not include things you have
      already decided not to chase
- [ ] **C5b.5** A member in credit shows as **Refund due**, and **Mark refunded** clears it
- [ ] **C5b.6** An exit priced from the forecast is flagged as such in the row
- [ ] **C5b.7** Financials shows the exit totals *separately* from sales revenue

### C5c · The exit emails

- [ ] **C5c.1** Settle-and-go → a **receipt** naming both totals and the balance
- [ ] **C5c.2** Declined card → the **failed-charge** email, which opens by confirming the
      cancellation went through and links to the payable invoice
- [ ] **C5c.3** Scheduled exit → a **confirmation** that is unambiguous about boxes and
      payments carrying on until the date
- [ ] **C5c.4** A waived exit's receipt gives the member's own reason, and its subject does
      not mention paying or owing
- [ ] **C5c.5** Re-running the same exit does not queue a second email (deduped per exit)

### C6 · Partner portal

- [ ] **C6.1** Create a partner in Founders Hub → Partners; issue a code
- [ ] **C6.2** Partner sets their password from the emailed link
- [ ] **C6.3** Partner logs in at `/partner` and sees their own numbers only
- [ ] **C6.4** Their terms are readable and match what was agreed
- [ ] **C6.5** Month-end payout run produces a self-billed invoice with the right total

### C7 · Founders Hub reporting

- [ ] **C7.1** Dashboard totals agree with Commerce → Orders
- [ ] **C7.2** Financials reconcile against Stripe's test-mode balance
- [ ] **C7.3** Pricing page: change a ladder rung → it takes effect without a redeploy
- [ ] **C7.4** Actions queue surfaces price changes and stock-outs needing a decision

---

## Phase D — the real order

One order. Do this on a day you can watch it.

- [ ] **D1** Confirm Read is live PowerBody and the products are ones you have imported
- [ ] **D2** You have worked at least one full day's queue in simulate mode (phase C5)
- [ ] **D3** Place a small order to **your own address**, through the real checkout
- [ ] **D4** Approve it in the fulfilment queue
- [ ] **D5** Settings → **Order sending → Send orders to PowerBody**, confirm the prompt
- [ ] **D6** Send it. The button and confirmation should both say it is going to PowerBody.
- [ ] **D7** Log in to **powerbody.com** (UK warehouse; `.eu` is the EU one) and check:
  - [ ] the order is listed, resting **unpaid** at `holded`
  - [ ] the **product names are right** — not blanks
  - [ ] the **prices are the ones your customer paid** — not £0.00
  - [ ] the delivery address and the recipient's email/phone are on it
  - [ ] your **logo** is on the picking list (upload it in their Dropshipping Settings, and
        turn on the "Invoice / Picking List" option so the retail price fields appear)
- [ ] **D8** Pay it (Sage Pay, on their portal — there are no credit accounts). Paid before
      3pm UK ships the same day.
- [ ] **D9** Status sync pulls their status and the **tracking number** back onto our order
- [ ] **D10** Tell your account manager the integration has placed an order, and ask them to
      **take the account out of DEMO**

> While the account is in DEMO, expect orders to **fail automatically**. A failure at D6 is
> the expected result, not a defect — what you are checking is that the payload is right
> when they look at it.

---

## Delivery — what to check

Delivery is now **charged**, on a ladder that mirrors PowerBody's own (see
`docs/PRICING_GUIDE.md` §2). Worth its own pass, because it touches every journey:

- [ ] **D.1** £30 basket → £4.95 delivery, shown in the basket *before* Stripe
- [ ] **D.2** £60 basket → £2.95
- [ ] **D.3** £120 basket → free, and the basket says so
- [ ] **D.4** The number in the basket matches the number on the Stripe page matches
      `order.shipping` in Commerce → Orders. All three came from different places before.
- [ ] **D.5** Two options appear at Stripe: **UK mainland** and **Highlands, Islands &
      Isle of Man** (+£2.95). Both appear even on a free-delivery basket, because Zone 2
      never ships free.
- [ ] **D.6** Pick **mainland** and give an `IV1 1AA` address → the fulfilment queue shows
      "£2.95 short on postage". Stripe fixes its options before it knows the postcode, so
      this flag is the check on a self-selected zone.
- [ ] **D.7** Subscription checkout charges delivery too, and it **recurs** — check the
      second invoice on a test clock carries it, since a box ships every cycle
- [ ] **D.8** `order.shipping` reaches PowerBody as `shipping_price` on the picking list
      (phase D7)

**Weight.** PowerBody publish no weight in their API, so orders are sent without one and
they weigh the parcel. Their *live* card bands on what we spend with them, not on weight,
so this does not affect what anyone is charged — only the margin model's delivery estimate,
which falls back to 1kg per product.

**Worth confirming with Kasia:** the June 2026 PDF still quotes weight bands (£3.25–£5.17)
and says free delivery is not available to dropshippers, which contradicts the value bands
and free tiers the account actually shows. Every number in the ladder above is built on the
account's card. If the PDF is the live truth, the ladder needs re-cutting.

**Different delivery speeds** need PowerBody to sell more than one service. Run
`GET /api/portal/supplier/shipping-methods` once API access lands (phase B) — until it
returns two, delivery options can only be prices we set, not speeds we buy.
