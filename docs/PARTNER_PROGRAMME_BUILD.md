# Partner programme — build plan

Turning `INFLUENCER_PROGRAMME.md` (a costed proposal, no plumbing) into working
software: partner accounts a founder creates, a personal discount code per
partner, a `/partner` login where they track their own numbers and their terms,
and management of all of it in the Founders Hub. Plus switching the scratch card
off.

This document is the **plan**. **Phases 0, 1 and 2 are now built** — see the
status notes on each. Phases 3–6 are not.

**Read §2A before touching the scratch card.** Switching it off is the smallest-
looking change here and the most dangerous: the pricing model keeps reading the
card's numbers after the card is gone, and none of the existing safety checks
fire. Measured figures are in that section.

---

## 0. Three decisions needed before phase 2

Everything in phase 1 can be built without these. Phases 2+ cannot.

> **Phase 0 exists because of these.** Removing the card is not a toggle — it
> touches the pricing model in four places that will not warn you. See §2A.

### D1 — Switching the scratch card off gives everyone 50% (read this first)

> **DECIDED: option A. Built.** `firstMonthDiscount: 0` and
> `scratchReveal.enabled: false`, set together in one commit. The outcomes are
> kept, not deleted, so switching the card back on restores what ran before.
> Measured on a £90 three-item box, first month, after everything:
>
> | | keeps on the first month | lifetime |
> |---|---|---|
> | Card on (blended ~15%) — what ran before | £5.78 | £88.68 |
> | **Off at 0% — now** | **£16.58** | **£99.48** |
> | Off at 15% (option B) | £5.94 | £88.84 |
> | Off at 50% (the naive flip) | **−£18.88** | £64.02 |
>
> The last row is the trap this decision exists to avoid, and note that
> `checkScenarios().ok` stays `true` on it — a loss-making first month is
> promotional by design and the lifetime figure still pays, so nothing would
> have complained. The hub's pricing screen now shows the flat rate as a field
> whenever the card is off, which is the durable fix: the number that takes over
> is visible exactly when it is in force.

`introOffer.scratchReveal.enabled` looks like the switch, and it is — but the
fallback behind it is live and set high:

```ts
introOffer: {
  firstMonthDiscount: 0.5,            // ← the fallback when the card is OFF
  effectiveFirstMonthDiscount: 0.15,  // ← what the card actually averages today
}
```

`resolveIntroDiscount()` reads: card on → allocated rate; **card off → the flat
`firstMonthDiscount`**. So flipping `enabled: false` on its own does not remove
the first-month discount, it replaces a rationed ~15% average with a **flat 50%
for everybody**. That is a much bigger giveaway than the thing being switched off.

So "turn the card off" is really two changes, and the second is the decision:

| Option | `firstMonthDiscount` | Effect |
|---|---|---|
| **A — no baseline intro offer** (recommended) | `0` | The only first-order discount anyone can get is a partner's code. Matches "the only extra discount will be the influencer ones". |
| B — flat rate replacing the card | `0.15` | Same average giveaway as today, minus the game. Keeps a site-wide offer as a conversion lever. |

**Recommend A**, on your own framing — but worth saying plainly: today every
first order carries an average 15% off, and A removes that for non-partner
traffic. That is a conversion change, not just a mechanic change.

### D2 — What a partner's code *is*, now the card is gone

`partners.introFloorPct: 0.20` is currently defined as *"the floor a partner's
code puts under the scratch card"*. With no card there is no floor to raise, so
the concept has to change to a **straight discount**: a partner's code takes 20%
off the first order, per-partner overridable (which is what "set the discount
amount/terms" asks for).

**This invalidates part of the costing.** `PRICING_STRATEGY.md` §3 modelled
partner economics against the card's blended ~15% — it was the 25%-floor-vs-15%-card
gap that made the original design lose money on every order. With the card gone
and option A chosen, the comparison becomes *20% off + 15% commission* against a
baseline of *0% off, no commission*. The programme still has to clear "an
attributed one-off order makes money on its own".

**Action: re-run the audit before phase 2 ships.** `lib/pricing/unit-economics.ts`
already does the arithmetic; this is an afternoon with the existing tooling, not
new modelling. Ship phases 1 and 5 (internal only) in the meantime.

> **Audit run (2026-08). One open question, and it is about stacking.**
> Measured on the same £90 three-item box, with the card off at 0%, a 20% code
> and 15% commission on net:
>
> | Route | Discount | Customer pays | We keep | Commission | **After commission** |
> |---|---|---|---|---|---|
> | Code alone (one-off, or entry rung) | 20% | £72.00 | £16.58 | £10.80 | **£5.78** |
> | Code **+ deepest subscription rung** | 36% | £57.60 | £2.40 | £8.64 | **−£6.24** |
>
> So the first row clears the bar the programme set itself — *an attributed
> one-off order makes money on its own*. The second does not, because a partner
> code and the biggest bundle's subscription discount currently compound.
>
> That is recoverable — a subscription keeps ~£99 across its life and month two
> onwards pays no first-order commission — so it is an acquisition cost, not a
> leak. But it should be a decision rather than an accident, and it is the one
> thing phase 2 cannot be written without. Three ways to settle it:
>
> 1. **Allow the stack** and accept −£6.24 on the deepest attributed first
>    order, recovered from month two. ← **CHOSEN, and built in phase 2.**
> 2. **Don't stack** — take the better of the partner code and the subscription
>    rate, never both. Simplest to explain to a follower ("20% off, or your
>    subscription rate, whichever is bigger").
> 3. **Cap the combined discount** at whatever leaves the first order at or
>    above zero after commission (~30% on these numbers).
>
> Settled on option 1. Multiplicative stacking, with the margin floor still
> applied per line underneath so nothing is ever sold below cost.

### D3 — Are partners customers?

Three auth realms is a lot, but the alternative is worse.

| Option | Verdict |
|---|---|
| Role flag on `users` | **No.** Partners would hold a customer session; a mistake in a guard lands a partner on `/hub` with a member's subscription surfaces, or a member on `/partner`. The blast radius of one wrong check is somebody else's data. |
| **Separate `partners` table + own session cookie** | **Recommended.** Mirrors the existing split between the customer realm (`HUB_COOKIE`) and the founders realm (`PORTAL_COOKIE`). A partner is a commercial counterparty, not a shopper. |

A partner who also wants to *buy* signs up as a customer separately, with the
same email if they like. The two are unrelated records.

---

## 1. What already exists (do not rebuild)

Worth knowing, because most of the hard parts are done:

| Piece | Where | State |
|---|---|---|
| Commission rates | `PRICING_CONFIG.partners` | 15% first / 5% renewals / 6 months / 20% floor — **live in config** |
| Programme design | `docs/INFLUENCER_PROGRAMME.md` | Costed. Attribution, qualification, payout all specified |
| Versioned migrations | `lib/db/migrations.ts` | Append-only array, SQLite + Postgres |
| Auth patterns | `lib/auth/session.ts`, `lib/portal/auth.ts` | Two working realms to copy from; password hashing in `lib/auth/password.ts` |
| Orders | `orders` table, `lib/orders/` | JSON `data` blob + indexed columns. **No attribution fields yet** |
| Renewal hook | `lib/payments/webhook.ts` → `invoice.paid` | Already creates a renewal order — the exact place renewal commission accrues |
| One-cycle coupons | `lib/payments/stripe.ts` | Already creates per-rate Stripe coupons for the intro discount; a partner code reuses this |
| Unit economics | `lib/pricing/unit-economics.ts` | Contribution net of VAT, delivery, fees, returns — the commission guard needs it |
| Review-queue UX | `app/portal/products/review/` | The pattern to copy for partner management |

**Not present:** any discount-code concept (the card is the only discount
mechanism), any attribution, any partner anything.

---

## 2. Data model

One new migration, appended to `MIGRATIONS` (never edit an applied one). Follows
the house style: TEXT columns, ISO-8601 timestamps from the app, JSON blob for
the parts that will churn.

```sql
CREATE TABLE partners (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT,
  status        TEXT NOT NULL,          -- invited | active | suspended
  data          TEXT NOT NULL,          -- payout details, notes, socials
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE partner_codes (
  code          TEXT PRIMARY KEY,       -- uppercase, e.g. SARAH20
  partner_id    TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  discount_pct  TEXT NOT NULL,          -- 0–1
  terms         TEXT NOT NULL,          -- JSON: firstOrderOnly, maxUses, startsAt, endsAt, minSpend
  status        TEXT NOT NULL,          -- active | paused | expired
  created_at    TEXT NOT NULL
);
CREATE INDEX partner_codes_partner ON partner_codes(partner_id);

-- The deal a partner is on, effective-dated and APPEND-ONLY. Changing terms
-- inserts a row; the current terms are the latest one that has taken effect.
CREATE TABLE partner_terms (
  id             TEXT PRIMARY KEY,
  partner_id     TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  first_order_pct TEXT NOT NULL,
  renewal_pct    TEXT NOT NULL,
  renewal_months TEXT NOT NULL,
  payout         TEXT NOT NULL,         -- JSON: cadence, minimum, selfBilled, chargesVat
  effective_from TEXT NOT NULL,
  note           TEXT,                  -- why it changed, shown to the partner
  created_by     TEXT,                  -- founder email
  created_at     TEXT NOT NULL
);
CREATE INDEX partner_terms_partner ON partner_terms(partner_id, effective_from);

CREATE TABLE partner_sessions (
  token      TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- One row per commission-earning event. The ledger IS the source of truth for
-- what a partner is owed; never recomputed from orders on the fly, because the
-- rate that applied on the day has to survive a rate change.
CREATE TABLE partner_commissions (
  id            TEXT PRIMARY KEY,
  partner_id    TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  order_id      TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,          -- first | renewal
  net_basis     TEXT NOT NULL,          -- net revenue the rate applied to
  rate          TEXT NOT NULL,          -- the rate ON THE DAY
  amount        TEXT NOT NULL,
  state         TEXT NOT NULL,          -- accrued | confirmed | reversed | paid
  confirm_after TEXT NOT NULL,          -- order date + 14-day return window
  payout_id     TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX partner_commissions_partner ON partner_commissions(partner_id);
CREATE UNIQUE INDEX partner_commissions_order_kind ON partner_commissions(order_id, kind);

CREATE TABLE partner_payouts (
  id         TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  period     TEXT NOT NULL,             -- YYYY-MM
  amount     TEXT NOT NULL,
  state      TEXT NOT NULL,             -- due | paid
  reference  TEXT,
  created_at TEXT NOT NULL
);

-- Attribution, on the order itself.
ALTER TABLE orders ADD COLUMN partner_code TEXT;
CREATE INDEX orders_partner_code ON orders(partner_code);
```

Three choices worth defending:

- **`partner_commissions.rate` is stored, not looked up.** Change the rate next
  quarter and last quarter's ledger must not silently restate. Same reason
  `supplierSimulated` is recorded per order rather than read from the setting.
- **`UNIQUE (order_id, kind)`** makes accrual idempotent. Stripe delivers
  webhooks more than once; without this, a retried `invoice.paid` pays a partner
  twice.
- **`partner_terms` is append-only and effective-dated**, rather than columns on
  `partners` that get updated in place. Once a partner can *read* their terms,
  those terms are a statement we are making to a counterparty, and "you changed
  my rate and didn't tell me" needs an answer better than our word. An update
  destroys the evidence; an insert keeps it, gives the partner a dated history,
  and makes a terms change something a founder has to write a reason for.

  This also means **rates become per-partner**. They live in
  `PRICING_CONFIG.partners` today, which is fine while everyone is on the same
  deal and impossible the moment someone negotiates. The config becomes the
  *default* a new partner's first terms row is seeded from.

---

## 2A. Removing the scratch card — the full blast radius

This is the part that needs doing carefully. The card is not a self-contained
feature: **the pricing model reads the card's numbers to decide what every price
and floor should be**, and it goes on reading them after the card is switched
off. Nothing warns you.

### What the model does when you flip the switch

Measured, not guessed — running `pricingThresholds`, `checkScenarios` and
`checkLadder` against each configuration:

| | What a customer gets | What the model thinks | Warnings raised |
|---|---|---|---|
| Card on (today) | ~15% (rationed average) | 15% | none |
| **Naive flip** (`enabled: false`) | **50%** | **15%** | **none** |
| Card off + rate set to 0 | 0% | **15%** | none |

Two separate failures, both silent:

1. **The naive flip.** `firstMonthDiscount: 0.5` is the fallback, so every first
   month goes to half price. On a representative subscribed first month (list
   £103.26, cost £30): today the member pays £70.22 and we keep **£30.64**;
   after the flip they pay £41.30 and we keep **£2.15**. That is **£28.49 an
   order**, and `checkScenarios` still reports nothing losing money — because it
   models the card outcomes, which are still sitting in the config, rather than
   the flat rate that is now actually being applied.

2. **The model never notices either way.** `thresholds.ts` reads
   `introOffer.effectiveFirstMonthDiscount` directly — the *card's budget* — so
   with the card off it keeps modelling a 15% first month that no longer happens
   in either direction. Set the rate to 0 and every floor it computes is
   pessimistic; leave it at 0.5 and every floor is dangerously optimistic.

### The fix: one function, three call sites

Three places reach past the config into card internals:

| File | Line | Reads | Wrong when the card is off |
|---|---|---|---|
| `pricing/thresholds.ts` | ~119 | `effectiveFirstMonthDiscount` | Models a discount that isn't given |
| `pricing/scenarios.ts` | ~77 | `scratchReveal.outcomes` | Models cards that are never dealt; misses the flat rate |
| `pricing/ladder.ts` | ~114 | `scratchReveal.outcomes` | "Deepest offered" drops the intro leg entirely |

Add **one** accessor — the effective first-month discount *actually in force* —
returning the card's budget when the card is on and `firstMonthDiscount` when it
is off, and point all three at it. Small, mechanical, and it is what makes the
card removable without quietly corrupting every floor in the business.

Do this **before** flipping anything.

**It does not make the check hard-fail, and it should not.** An intro discount is
acquisition cost by design — `first-month` is marked promotional and the scenario
that has to pay is `lifetime`. At a flat 50% the lifetime still pays, so the
verdict stays green. What changes is that the numbers become **true**: lifetime
contribution on a representative subscriber reads £209.54 today, £221.94 with no
intro offer, and £181.25 at a flat 50% — a £28 swing per subscriber that the
model previously could not see at all, reporting identical figures for all three.

One behaviour does change: with the card off, the deepest first month is no
longer treated as promotional. A rare card that loses money is the design; a flat
rate *everybody* gets is not, so it counts toward the verdict.

### Everything else the removal touches

**Code that goes quiet on its own** (gated on `scratchRevealAvailable()`, so it
degrades rather than breaking): `ScratchToReveal.tsx`, and the card blocks in
`StackReviewPage.tsx` and `BundleLandingPage.tsx`. `/api/intro-offer` already
returns `{ rate: 0 }`.

- **UX gap to decide:** with the card gone, is there still a first-month offer to
  *communicate*? If D1 → 0, those blocks simply disappear and the stack review
  page loses its offer moment entirely. If D1 → flat 15%, something has to state
  it, and nothing does today — the reveal *was* the statement.

**Code that becomes dead weight:** `intro-allocation.ts` (the whole rationing
ledger and its feedback loop), `recordIntroClaim` in `checkout/finalize.ts`, and
the `intro-allocation` KV key. Leave the module in place but stop calling it —
deleting it is a separate tidy-up, and it is the thing to restore if the card
ever comes back.

**Code that is still needed:** the Stripe one-cycle coupon path in
`payments/stripe.ts`. A partner code needs exactly the same mechanism.

**Portal screens that will lie:** `app/portal/pricing/page.tsx` still renders the
scratch outcome editor, and its partner help text reads *"Keep it near the
average card (15%)"* — meaningless once there is no card. `CutOffs.tsx` and
`LadderPanel.tsx` both explain themselves in terms of the card.

**Docs that go stale:** `PRICING_STRATEGY.md` §4 ("The scratch card loses money
on half of all first months"), §7.3 ("Recut the scratch card") and §7.4 are about
a mechanic that no longer exists; §3 is the partner costing that D2 invalidates.
`INFLUENCER_PROGRAMME.md` describes a partner code as raising the card's floor.
Mark them superseded rather than deleting — the reasoning is why the rates are
what they are.

### Phase 0 — do this first  ·  **DONE**

1. Add the effective-intro-rate accessor; point thresholds, scenarios and ladder
   at it. **No behaviour change** — the card is still on, the numbers are
   identical, and the tests prove it.
2. Decide D1. Set `firstMonthDiscount` deliberately, in the same commit that sets
   `scratchReveal.enabled: false`, so the trap cannot be sprung by a half-applied
   change.
3. Re-run the audit (D2) with the card gone, and reprice the partner rate against
   the new baseline. **Run — figures in §0 D2.** The rate itself stands (an
   attributed one-off clears £5.78); what is still open is whether a code stacks
   with the subscription rate.
4. Portal copy and the pricing screen. **The flat first-month rate now has a
   field on the pricing screen, shown whenever the card is off** — it had none
   before, which is how a number nobody could see came to be in force.
5. Mark the superseded doc sections.

*Done when:* the pricing model reports the discount customers actually get, the
lifetime figure moves when the intro rate moves, and no screen describes a card
that no longer exists.

---

## 3. Phases

Each phase is shippable and useful on its own. Phases 1 and 5 are internal, so
they can go live before D1/D2 are settled.

### Phase 1 — Partner records, codes and terms (internal only)  ·  **DONE**

Migration; `lib/partners/` domain (create, suspend, generate code, set and
supersede terms); founders API + UI at a new top-level **Partners** tab.

Creating a partner generates a code from their name with a collision check
(`SARAH20`, `SARAH20-2`), defaulted to `partners.introFloorPct` and editable, and
seeds a first `partner_terms` row from `PRICING_CONFIG.partners` so every partner
has a dated deal from the moment they exist.

Payout terms move from prose into config in this phase — they are part of what a
partner will be shown, so they need a real home first.

*Done when:* a founder can create a partner, see the generated code, change the
discount and the commission terms, and suspend them; and a terms change leaves a
dated row with a reason. Nothing customer-facing changes. Codes do nothing yet.

### Phase 2 — Redeeming a code  ·  **DONE**

- Scratch card off; `firstMonthDiscount` set per D1.
- A discount-code field at checkout — **new**, nothing like it exists today.
- Validation: active, in window, under max uses, meets terms.
- The code's discount becomes a Stripe coupon via the existing
  `lib/payments/stripe.ts` path.
- `orders.partner_code` written **at order-write time**, never derived later.
- `/?ref=CODE` sets a 30-day cookie and pre-fills the field. A typed code wins
  over a cookie.

*Done when:* a code gives its discount, the order records which partner earned
it, and an expired/suspended code is refused with a reason.

*Watch:* every order path must carry attribution — quiz checkout, shop, bundles,
subscription first order. Missing one means silent under-payment.

> **Built. D2 settled: codes stack.** Option 1 — a code comes off on top of the
> bundle or subscription rate, and an attributed order on the deepest rung loses
> a few pounds on month one, recovered from month two. Accepted as an
> acquisition cost.
>
> Stacking is **multiplicative**, never additive: 20% then 20% is 36%, not 40%.
> Adding them would overstate what comes off at every rung and, at the deep end,
> ask for more than a 2× price can carry. Verified end to end on a £316.92
> basket — £291.56 with the bundle tier alone (8%), £233.23 with `SARAH20` on
> top (26.4%, which is exactly `1 − 0.92 × 0.8`).
>
> The margin floor still applies **per line, under the combined rate**, so
> however the discounts add up nothing is sold below cost.
>
> How it hangs together:
>
> | Piece | Where |
> |---|---|
> | The one place a code becomes money off | `lib/partners/redeem.ts` |
> | Live check while typing (advisory) | `POST /api/partner-code` |
> | Re-validation at purchase (authoritative) | `/api/cart`, `finalizeCheckout` |
> | One-off pricing, code included | `priceOneOffLines(lines, config, partnerPct)` |
> | Subscription first month, one Stripe coupon | `claimIntroDiscount` + `firstMonthDiscountOf` |
> | Attribution, written at order-write time | `orders.partner_code`, `Order.partnerCode` |
> | `?ref=CODE` → 30-day cookie | `src/middleware.ts` |
> | The box itself | `components/checkout/PartnerCodeBox.tsx` |
> | What a partner has brought in | `lib/partners/performance.ts` |
>
> Three things worth knowing:
>
> - **The typing check is advisory.** Between it and the payment a code can be
>   paused, capped out or its partner suspended, so every checkout re-validates
>   through the same function. The browser sends a string; the discount is always
>   decided on this side.
> - **A stale code never fails a checkout.** On the subscription path it takes
>   nothing off and attributes nothing rather than bouncing someone out
>   mid-purchase; on the one-off path the response says so, because that basket
>   is still on screen and can be fixed.
> - **The code is spent when an order exists**, not when someone types it. A cap
>   counting attempts would exhaust itself on people who never bought — the same
>   mistake the intro-allocation ledger exists to avoid.
>
> Still open, and phase 3's job: nothing here is money **owed**. Commission needs
> the return window, a `confirmed` state and the rate stored on the day. What the
> hub shows now is orders and revenue per partner, counted from the orders
> themselves so a refund stops counting without anything having to remember to
> decrement a tally.

### Phase 3 — The commission ledger

- Accrue on payment: `first` for a first order, `renewal` from the existing
  `invoice.paid` handler, capped at `renewalMonths` from signup.
- `confirm_after = order date + 14 days`; a daily job (the cron already exists)
  moves `accrued → confirmed`.
- Refund/dispute → `reversed`.
- **The contribution guard:** commission is floored so it can never make an order
  a loss — compute contribution via `unitEconomics` and cap the payment at
  contribution − 5%. Without this a deep-discount edge case pays a partner out of
  our own margin.

*Done when:* a paid attributed order produces exactly one accrual, a refund
reverses it, a duplicate webhook does not double-pay, and the guard is unit-tested
against a deliberately marginal order.

### Phase 4 — `/partner`

Auth realm (login, logout, set-password-by-invite, reset), and two things behind
it: **how you're doing** and **what your deal is**.

**Performance**

- Orders attributed, this month and all time
- Revenue driven (net)
- Commission **pending / confirmed / paid**, with the confirmation date visible
  so "why isn't this payable yet" answers itself
- Payout history
- Their code and a copyable `?ref=` link

**Terms** — the whole deal, in their own words, with nothing they have to email
to find out:

| | |
|---|---|
| **Their code** | The code itself, the discount it gives a follower, and every restriction on it — first order only, usage cap and how much of it is used, start/end dates, minimum spend |
| **What they earn** | First-order rate, renewal rate, and how many months renewals run from a customer's signup |
| **When it becomes payable** | Accrues on order → confirms after the 14-day return window → reverses on refund. With the actual dates on their own pending rows, not a generic policy line |
| **How they get paid** | Cadence, the £25 minimum and what happens below it, self-billing, and the VAT treatment |
| **History** | Every previous version of the above, dated, with the reason a founder gave for the change |

The history row is the point of `partner_terms` being append-only. A partner who
can see that their renewal rate changed on 1 March, and why, does not have to
take our word for anything — and a founder cannot change a deal without leaving
a record of having done it.

*Done when:* a partner logs in, sees their own numbers and nobody else's, can
answer "what am I on, what am I owed, and when do I get it" without contacting
anyone, and cannot reach `/portal` or `/hub`.

*Note:* "clicks" are not in this phase. Click tracking needs its own storage and
a bot-filtering story, and checkouts are the number that matters. Add later if
partners ask.

*Prerequisite:* payout terms (cadence, £25 minimum, self-billing) exist only as
prose in `INFLUENCER_PROGRAMME.md` today. They have to become real config before
a screen can state them — otherwise the dashboard is quoting a document.

### Phase 5 — Founders management

List every partner with performance side by side; open one to see their orders
and ledger, change their terms, or suspend them; a payouts view showing what is
due this month.

**Changing terms is an insert, not an edit.** The form takes an effective date
and a reason, writes a new `partner_terms` row, and the partner sees both on
their own Terms tab. Two consequences worth stating:

- A rate change **cannot be backdated over a paid commission** — the ledger
  stores the rate that applied and must not restate. Backdating is allowed only
  as far as the oldest still-`accrued` row.
- The reason field is not optional. It is the thing the partner reads.

*Done when:* a founder can answer "who is working, what do we owe, and to whom"
without a database client, and can change someone's deal in a way that partner
can see and date.

### Phase 6 — Payouts

Monthly run in arrears, £25 minimum, carried forward below it. Self-billed
invoice honouring `partnersChargeVat`. Mark paid with a reference; the ledger
rows move to `paid`.

*Done when:* a month can be closed, and a partner sees the payout on their
dashboard.

---

## 4. Risks

- **Code leakage to deal sites.** A 20% code posted publicly is a site-wide 20%
  off funded partly by commission. Mitigate with `firstOrderOnly` and `maxUses`
  in the terms from day one — cheap to build now, expensive to retrofit.
- **Self-referral.** A partner buying through their own code. Detect on email
  match at minimum.
- **Attribution gaps.** Every checkout path must write the code. Enumerate them
  in phase 2 and test each.
- **Reversal depends on refunds being recorded.** `status: 'refunded'` exists on
  orders, but I have not verified there is an automated path that sets it. If
  refunds are manual today, reversal is manual too — worth confirming in phase 3.
- **The economics are unverified post-card.** D2. Do not launch partner traffic
  until the audit is re-run.
- **The pricing model does not currently notice the card being switched off.**
  §2A, measured. Until the effective-intro-rate accessor lands, the scenario and
  threshold checks will report healthy numbers for a configuration that is losing
  £28 an order. This is the single highest-risk item in the plan, and it is also
  the cheapest to fix.
- **Removing the intro offer is a conversion change, not a mechanic change.**
  Every first order carries an average 15% off today. Nobody has measured what
  that discount is buying, and D1 option A removes it for all non-partner
  traffic on the same day partner codes appear. If both land together and orders
  move, there is no way to tell which change did it. Consider staging them.
- **Published terms are a commitment.** Once `/partner` states a rate, a payout
  cadence and a minimum, those stop being internal settings and become something
  a counterparty is relying on. Worth a read by whoever would answer a partner
  disputing a payment, before it ships — the append-only history makes us
  answerable, which is the point, but it also means sloppy defaults are visible.

---

## 5. Suggested order

1. **Phase 0 step 1** — the effective-intro-rate accessor. No behaviour change,
   no decisions needed, and it is what makes every later step safe to verify.
2. **Phase 1** — partner records, codes and terms. Internal only, no decisions
   needed, unblocks everything else.
3. **D1 + D2**, then the rest of **Phase 0**: set the rate deliberately, switch
   the card off, re-run the audit, fix the portal copy.
4. **Phase 2 + 3** together (a code that discounts but never pays is worse than
   neither).
5. **Phase 5** before **Phase 4** — founders need to see the numbers before
   partners are invited to look at them.
6. **Phase 6** before the first month closes.

Steps 1 and 2 need nothing from you and can start now. Everything from step 3
onwards waits on D1/D2.

---

## 6. What I have not verified

Stated plainly, because a plan that hides its gaps is worse than one that has
them:

- **Whether refunds are recorded automatically.** `status: 'refunded'` exists;
  the path that sets it does not obviously.
- **What the intro discount is worth in conversion.** No data was consulted —
  the recommendation for D1 option A rests on your framing, not on evidence that
  removing it is safe.
- **Whether every checkout path can carry attribution.** I enumerated the order
  paths but did not trace each one end to end.
- **Stripe's promotion-code feature.** The plan uses our own codes plus generated
  coupons, matching the existing intro-discount mechanism, on the grounds that we
  need our own terms and reporting anyway. Stripe's native promotion codes might
  do some of this; not investigated.
