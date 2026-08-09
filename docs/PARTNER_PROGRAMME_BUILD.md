# Partner programme — build plan

Turning `INFLUENCER_PROGRAMME.md` (a costed proposal, no plumbing) into working
software: partner accounts a founder creates, a personal discount code per
partner, a `/partner` login where they track their own numbers and their terms,
and management of all of it in the Founders Hub. Plus switching the scratch card
off.

This document is the **plan**. **Every phase is now built** — see the status
note on each.

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
> Measured on a £90 three-item box costing £45, on the deepest subscription
> rung, after everything. **These figures were corrected during phase 3** — the
> first pass called `unitEconomics` with the per-line `sharedParcelItems` shape
> on a whole-order input and dropped most of the parcel's delivery cost. The
> comparison between the rows, and therefore this decision, is unchanged: every
> row moved by the same amount.
>
> | | keeps on the first month | over a 6-month life |
> |---|---|---|
> | Card on (blended ~15%) — what ran before | −£2.10 | £40.60 |
> | **Off at 0% — now** | **£8.54** | **£51.24** |
> | Off at 15% (option B) | −£2.10 | £40.60 |
> | Off at 50% (the naive flip) | **−£26.92** | £15.78 |
>
> Note what the corrected numbers show that the first pass hid: the scratch card
> was costing us **£10.64 a signup**, not £10.80 of forgone profit on a
> profitable month — month one was actually underwater while it ran.
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

> **Audit run (2026-08), then CORRECTED during phase 3.**
>
> ⚠️ **The first pass of these figures was wrong and is superseded.** It called
> `unitEconomics` with `sharedParcelItems: 3` on a whole-ORDER input. That
> parameter apportions one parcel's delivery across the lines sharing it — the
> per-LINE shape — so applied to a whole order it divided the parcel cost by
> three and collapsed £7.87 of delivery into £0.13. Every figure came out about
> £7.74 too healthy. `sharedParcelItems: 1` is correct for a whole order,
> because the order **is** the parcel.
>
> Corrected, on a £90 three-item box costing £45, card off, 20% code, 15%
> commission on net:
>
> | Route | Discount | Customer pays | We keep | Commission | **After commission** |
> |---|---|---|---|---|---|
> | No code, no discount | 0% | £90.00 | £26.27 | — | **£26.27** |
> | Code alone (one-off, or entry rung) | 20% | £72.00 | £8.54 | £10.80 | **−£2.26** |
> | Code **+ deepest subscription rung** | 36% | £57.60 | −£5.64 | £8.64 | **−£14.28** |
>
> **Both attributed rows lose money on month one.** The bar the programme set
> itself — *an attributed one-off order makes money on its own* — is NOT met at
> the current rates. The undiscounted box pays perfectly well (£26.27), so this
> is the programme's cost, not the product's.
>
> On a subscription it is recovered: month two onwards carries no first-order
> commission and no code discount. On a genuine ONE-OFF there is no month two,
> and an attributed one-off is a straight ~£2 loss at these rates.
>
> Three ways to settle it:
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
>
> **Still worth revisiting** now the corrected figures are in: at a 20% code and
> 15% first-order commission, an attributed ONE-OFF loses ~£2.26 with no
> subscription behind it to recover from. Options if that matters: drop the
> first-order rate, restrict codes to subscription signups, or accept it as the
> cost of the channel. Phase 3's contribution guard stops the commission making
> it worse, but it cannot make a loss-making order profitable.

### D3 — Are partners customers?  ·  **BUILT AS RECOMMENDED (phase 4)**

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

### Phase 3 — The commission ledger  ·  **DONE**

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

> **Built.** `lib/partners/commission.ts` (pure arithmetic) and
> `lib/partners/ledger.ts` (states and settlement), with the hub's Money tab on
> each partner.
>
> States walk one way, with one exception:
>
> ```
> accrued ──(window passes)──▶ confirmed ──(payout run)──▶ paid
>    └──────(refund)──▶ reversed ◀──(refund)──┘
> ```
>
> A `paid` row can still be reversed — money has left, and a later refund must be
> visible rather than quietly absent. What it must never do is drop back into the
> payable balance, so every transition names the states it may leave, in SQL.
>
> | Decision | Why |
> |---|---|
> | `rate` and `netBasis` **stored** on the row | Change a rate next quarter and last quarter must not silently restate. |
> | Idempotency from `UNIQUE(order_id, kind)` | Stripe redelivers, and two can land at once — a read-then-write would still double-pay under a race. Only the database can decide this. |
> | Accrual funnelled through the order service | One path for shop, quiz, mock, subscription first box and renewals. Missing one means silent under-payment. |
> | Accrual never throws | A checkout that already took money must not fail over a bookkeeping row. The order keeps `partnerCode`, so a failed accrual is replayable. |
> | Only `confirmed` is "owed" | An accrual can still be refunded away; showing it as owed promises a partner money that may never be theirs. |
> | Renewal window counted from **signup** | A property of the relationship, so a delayed delivery cannot extend it. |
>
> **The contribution guard** (`partners.maxShareOfContribution: 0.95`) caps a
> payment at 95% of what the order actually made. Measured: a £60 order costing
> £40 keeps £2.72 once delivery, card fees and the returns provision are out,
> while 15% of net is £9.00 — three times the margin. Without the cap the
> difference comes out of our own pocket with nothing to say so. On an order
> already losing money the ceiling is zero: it does not rescue a bad order (see
> D2), it refuses to make it worse.
>
> The daily job (`runDailyJob`) confirms whatever has passed its window. The
> `oldestUnsettled` guard on terms changes — written in phase 1 with nothing to
> guard — is now fed the real earliest unpaid commission.
>
> **Found while building this:** the D1 and D2 figures in §0 were computed with
> the wrong `sharedParcelItems` shape and are corrected above. The same mistake
> is live in `lib/pricing/scenarios.ts` — see §4.

### Phase 4 — `/partner`  ·  **DONE**

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
✅ Done in phase 1 (`PRICING_CONFIG.partners.payout`), seeded onto each partner's
opening terms row, so the dashboard quotes the terms IN FORCE FOR THEM rather
than a programme-wide default.

> **Built.** `lib/partners/auth.ts` (the realm), `lib/partners/dashboard.ts`
> (what they can see), and two screens behind one login.
>
> **The third realm, and why it is a third realm.** A partner holds their own
> cookie (`partner_session`) and their own table. Not a role flag on `users`:
> if a partner held a customer session, one wrong guard lands them on `/hub`
> looking at somebody's subscription, or a member on `/partner` looking at
> commission. The blast radius of a single mistaken check is another person's
> data, and a third cookie is a cheap price for making that impossible rather
> than unlikely. A partner who also wants to buy signs up as a customer
> separately; the records are unrelated.
>
> | Decision | Why |
> |---|---|
> | Migration **v10** rewrites `partner_sessions` to store `token_hash` | v9 stored the token itself. Anyone reading a backup could have replayed live logins. The table had never held a row, so it was dropped and recreated. |
> | The dashboard takes **no id from the browser** | It is built from the session. There is no shape of request to `/api/partner/me` that reads another partner's numbers — that is structural, not a check somebody has to remember. |
> | The gate is a **layout**, and set-password sits in a different route group | A new screen added under `(partner-gated)` cannot ship unguarded by being forgotten. `/partner/set-password` opts out because someone on an invite has no session yet — which is the entire point of the link. |
> | Login answers **identically** for a wrong password and an unknown email | Otherwise anyone can enumerate which of our partners exist. Suspension is the one exception: they know they have an account, so a generic refusal just sends them to support to be told this anyway. |
> | Invites are **single-use, hashed, 7 days** | Looking up whose link it is does NOT spend it — a preview fetch in an email client would otherwise lock a partner out before they clicked. Only the winner of the burn proceeds, so two tabs cannot both set a password. |
> | Suspension **deletes their sessions** | Not just refused at the door. A live-looking dashboard must not survive on a screen that forgot to check. |
> | Setting a password **drops every session** | That is the entire reason to change one. |
>
> **What the two tabs answer.** *How you're doing*: ready to pay, still in the
> window, paid, reversed — plus orders and spend, all time and this month. Every
> earning row carries **its own clearing date**, so "why isn't this payable yet"
> answers itself on the row that raises the question rather than in a policy
> line elsewhere. *Your deal*: the code and every restriction on it, what they
> earn, the four steps from order to payment, how they get paid, and the full
> dated history with the reason a founder gave for each change.
>
> Verified in a browser: invite link greets by name without spending itself,
> sets a password and signs straight in; the partner sees 1 order and £18.21
> accrued while another partner's 2 orders are invisible to them;
> `/api/portal/partners` answers 401; `/portal` shows the founder login; the
> invite cannot be replayed; and suspending them from the hub signs them out.
> The raw invite token is confirmed absent from the database.

### Phase 5 — Founders management  ·  **DONE**

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

> **Built.** The Partners tab now has two views: **Partners** (who they are, what
> deal they are on, what they have brought in) and **Payouts** (what we owe).
> Both guarded questions are answered on the screen.
>
> The backdating guard was written in phase 1 and fed real data in phase 3; it
> refuses a rate change dated before the oldest commission that is earned and
> not yet paid — `accrued`, `confirmed` or `invoiced`. Stricter than "oldest
> still-accrued" as originally planned, because a `confirmed` row is about to be
> paid AT ITS STORED RATE, and restating terms behind it would leave the ledger
> and the partner's own terms screen disagreeing.

### Phase 6 — Payouts  ·  **DONE**

Monthly run in arrears, £25 minimum, carried forward below it. Self-billed
invoice honouring `partnersChargeVat`. Mark paid with a reference; the ledger
rows move to `paid`.

*Done when:* a month can be closed, and a partner sees the payout on their
dashboard.

> **Built — and it needed a correction to phase 3 first.**
>
> `settle` used to move commission straight to `paid`, which made the ledger
> claim money had moved the instant a founder pressed a button. There is now an
> **`invoiced`** state between them:
>
> ```
> accrued ─(window)─▶ confirmed ─(payout raised)─▶ invoiced ─(money sent)─▶ paid
>    └───────────────(refund)──▶ reversed ◀──────────────────────────┘
> ```
>
> "We owe you this" and "we have sent you this" are different facts. The state
> also stops a second run picking up rows that are already on a raised payout —
> `payableNow` counts `confirmed` only.
>
> | Piece | Where |
> |---|---|
> | The monthly run, everyone at once | `runPayouts(period)` — each partner against THEIR OWN minimum |
> | Self-billed invoice | `lib/partners/invoice.ts` — derived from the rows, never stored |
> | Marking it sent | `markPaid(payoutId, reference)` — this is what moves rows to `paid` |
> | Founders' view | `/portal/partners/payouts` |
> | The partner's copy | their dashboard, lines and all |
>
> Decisions worth defending:
>
> - **Each partner is judged against their own minimum**, read from the terms in
>   force for them. The minimum is part of a negotiable deal; a run using the
>   programme default would quietly pay someone on terms they were never given.
> - **Everyone skipped is named with a reason.** A run that silently did nothing
>   for a partner is how "where is my money" starts. Partners who earned nothing
>   at all are left out — that is the ordinary case, not an exception.
> - **The invoice is derived, never stored.** An invoice that disagreed with its
>   own lines is the worst possible artefact to find eighteen months later.
> - **VAT is read from THEIR terms**, not `partnersChargeVat`. It is a fact about
>   them; the config figure is only what a new partner starts on. A registered
>   partner's commission costs us 20% more than the rate suggests.
> - **The payout amount is corrected to what actually moved onto it.** A refund
>   landing mid-run would otherwise leave an invoice for more than its own rows.
> - **A run's period is a LABEL, not a filter.** It sweeps everything cleared,
>   whenever it was earned — which is what arrears means, and what the screen now
>   says out loud so nobody runs twice looking for money already in the first run.
>
> Also built here, from §4: **self-referral**. A partner may use their own code —
> they are a customer like anyone else and we are not policing a personal order —
> but they earn no commission on it, which would otherwise turn the code into a
> standing extra discount funded out of the programme. Matched on email, which
> catches the honest and the careless case; a second address is a trust problem,
> not a validation one, and the ledger makes it visible either way.
>
> Verified end to end: two partners earn, £66.87 clears the £25 minimum and
> £22.29 does not; the run raises one payout and names the skip with its reason;
> the invoice reads `CHRGD-SB-2026-08-MSLJICA8`, one line, `3 × 15% of £445.86`;
> marking it paid with `BACS-77213` moves three ledger rows; and the partner sees
> the invoice, the reference and the self-billing notice on their own dashboard.

---

## 4. Risks

- **Code leakage to deal sites.** A 20% code posted publicly is a site-wide 20%
  off funded partly by commission. Mitigate with `firstOrderOnly` and `maxUses`
  in the terms from day one — cheap to build now, expensive to retrofit.
- **Self-referral.** ✅ Built in phase 6. A partner may use their own code; they
  earn nothing on it. Matched on email — a second address is a trust problem,
  not a validation one.
- **Attribution gaps.** ✅ Closed in phase 2: shop, quiz, mock, subscription
  first box and renewals all funnel through one accrual path in the order
  service, so no route can quietly skip it.
- **Reversal depends on refunds being recorded.** ✅ Confirmed in phase 3: there
  is an automated path. `charge.refunded` from Stripe reaches `refundOrder`,
  which now reverses the commission, and the same function backs a refund
  started in the hub. Both ends agree.

- 🔴 **`lib/pricing/scenarios.ts` understates delivery on every basket.** Found
  while building phase 3, and NOT fixed — it changes numbers on a screen
  founders price from, which should be a deliberate change rather than a side
  effect of a commissions commit.

  `checkScenarios` passes `sharedParcelItems: items` with a whole-basket
  `shelfPrice` and `supplierCost`. That parameter apportions **one parcel's**
  delivery across the lines sharing it, so it belongs on a per-LINE call. On a
  whole-order call it divides the parcel cost by the item count: on a
  three-item box, £7.87 of delivery becomes **£0.13**.

  Effect: every scenario on the Pricing screen reads roughly £7.74 healthier
  than it is on a three-item box, and the "typical quiz box" panel is the main
  one. `thresholds.ts` and `list-price.ts` use the parameter correctly and are
  unaffected; `lib/partners/commission.ts` deliberately passes `1`.

  The fix is one argument. The consequence is that several screens will show
  materially worse — and correct — numbers.
- **The economics are verified and thin.** D2, corrected in phase 3: at a 20%
  code and 15% first-order commission, an attributed order loses ~£2.26 on a
  one-off and ~£14.28 on the deepest subscription rung. Recovered from month two
  on a subscription; not recovered at all on a one-off. Accepted deliberately,
  but revisit the rates before running volume through the channel.
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
