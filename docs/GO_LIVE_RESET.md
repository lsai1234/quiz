# Clearing the test data before you go live

**Founders Hub → Settings → Going live.**

`docs/STRIPE_GO_LIVE.md` is the runbook for *configuring* Stripe. This is the one
screen inside the app that checks the configuration took, and clears the orders
and subscriptions you made while testing so the first real month starts at zero.

---

## Do it in this order

1. **Read the checklist** on the page. Every item is read from the running
   deployment, not from a document, so it cannot go stale.
2. **Download a copy** of what is about to be deleted.
3. **Run the reset** — while you are still on the test keys.
4. **Then** switch to live: add `STRIPE_LIVE_SECRET_KEY` and
   `STRIPE_LIVE_WEBHOOK_SECRET`, redeploy, and flip **Settings → Payments →
   Which Stripe** to live mode.

Running the reset *after* the switch is the mistake the whole screen is shaped to
prevent. The guard below means it cannot destroy anything real if you do, but the
order above is still the one that leaves you with clean numbers.

## What it clears, and what it keeps

Ticked by default — the money:

- **Orders** — every shop, quiz and subscription order and its fulfilment state
- **Subscriptions** — member subscriptions, the product-change queue, stock
  exceptions and their consent records
- **Emails** — everything queued, sent or failed in the outbox
- **Partner earnings** — commissions and payouts for the deleted orders

Opt-in: share cards and competition entries · analytics events · the error log.

**Always kept:** user accounts, sessions and sign-in identities · partner
accounts, codes and terms · products, prices and the catalogue · every setting ·
share-card artwork · the reset's own audit record.

You keep your test logins, so you can immediately re-test against live keys with
a real card.

## The guard: live rows are never deleted

`orders` and `subscriptions` carry a `mode` column (migration v15) recording
which Stripe world wrote them — `mock`, `sandbox` or `live` — taken from the
secret key in use at the time.

**The reset never deletes a row marked `live`. There is no override, and no force
flag.** There is no version of "delete this customer's paid order" that this tool
should make easy. If live rows exist, the page says so and the reset skips them.

The tag is **one-way**: once `live`, always `live`. A subscription row can be
created by the quiz *before* anybody pays, so the world it started in is not
necessarily the world it ends up in — and mislabelling a test order as live only
costs a row left behind for you to delete by hand, while the opposite loses a real
customer's order. Those are not comparable mistakes, so the tie breaks the same
way every time.

### How the dependent tables stay honest

Changes, consents, the outbox and commissions have no `mode` column. Rather than
give them a second rule to keep in step, every dependent delete is phrased as
**orphan cleanup** — "remove rows that no longer belong to anything that
survived" — and run after its parents. That is automatically right in both cases:

- no live data → every parent goes, so every dependent is an orphan
- live data present → live parents survive, so *their* dependents are not
  orphans and are left alone

A live member therefore keeps their consents, their change history and their
commission rows without any of those tables knowing what "live" means.

## It is safe to run twice

`SqlEngine` exposes no transaction, and wrapping one by hand is unsafe on
Postgres because the pool does not promise consecutive queries land on the same
connection. So the reset is built to be **idempotent** instead: interrupted
halfway it leaves orphans rather than corruption, and running it again finishes
the job.

## The audit record

Each reset writes what it deleted, when, by whom and which Stripe world was
active, into `kv` — which no reset group touches, because a record of a deletion
that the next deletion erases is not a record. The page shows the last one.

## What the checklist cannot tell you

Two things live in Stripe's dashboard and are invisible from here. Both are in
`docs/STRIPE_GO_LIVE.md` §6 and the page says so rather than implying the list is
complete:

- **The Billing Portal must be re-enabled in live mode.** The test-mode setting
  does not carry over. This one catches people out.
- **Account activation must be complete**, or payouts sit in limbo even though
  charges succeed.
