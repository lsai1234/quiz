# Partner programme — build plan

Turning `INFLUENCER_PROGRAMME.md` (a costed proposal, no plumbing) into working
software: partner accounts a founder creates, a personal discount code per
partner, a `/partner` login where they track their own numbers, and management of
all of it in the Founders Hub. Plus switching the scratch card off.

This document is the **plan**. Nothing below is built yet.

---

## 0. Three decisions needed before phase 2

Everything in phase 1 can be built without these. Phases 2+ cannot.

### D1 — Switching the scratch card off gives everyone 50% (read this first)

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

## 3. Phases

Each phase is shippable and useful on its own. Phases 1 and 5 are internal, so
they can go live before D1/D2 are settled.

### Phase 1 — Partner records, codes and terms (internal only)

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

### Phase 2 — Redeeming a code (needs D1 + D2)

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
- **Published terms are a commitment.** Once `/partner` states a rate, a payout
  cadence and a minimum, those stop being internal settings and become something
  a counterparty is relying on. Worth a read by whoever would answer a partner
  disputing a payment, before it ships — the append-only history makes us
  answerable, which is the point, but it also means sloppy defaults are visible.

---

## 5. Suggested order

1. **Phase 1** — no decisions needed, unblocks everything.
2. **D1 + D2**, and re-run the audit.
3. **Phase 2 + 3** together (a code that discounts but never pays is worse than
   neither).
4. **Phase 5** before **Phase 4** — founders need to see it before partners are
   invited to.
5. **Phase 6** before the first month closes.
