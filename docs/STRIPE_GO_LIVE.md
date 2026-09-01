# Connecting Stripe — Vercel + Postgres runbook

For an app already deployed on Vercel with a hosted Postgres. Takes you from
"Stripe account exists" to "taking real money", test mode first.

`docs/STRIPE_TESTING.md` is the companion: it covers *what to click* to exercise
each flow. This covers *what to configure*.

---

## 0. What infrastructure do you need?

**None that you don't already have.** No queue, no worker, no Redis, no separate
service. Specifically:

| Thing | Needed? | Why |
|---|---|---|
| Hosted Postgres | ✅ already have | Orders, subscriptions, consent evidence, the outbox |
| Vercel | ✅ already have | The webhook is just an API route |
| Database migrations | ⚙️ **automatic** | They run on first connection, behind a Postgres advisory lock, so concurrent serverless instances can't race. Nothing to run by hand |
| Vercel Cron | ⚙️ already in `vercel.json` | Daily at 06:00 UTC. Just needs `CRON_SECRET` set |
| A queue / worker | ❌ | Stripe retries failed webhooks itself; the outbox is a database table |
| Redis / cache | ❌ | Nothing here needs one |
| Email provider | ⬜ optional | Defaults to `manual` — emails queue in the Founders Hub for you to copy out. Add Resend later if the volume justifies it |

The only genuinely new moving part is **the webhook endpoint**, and that is a
route that already exists at `/api/webhooks/stripe`.

---

## 1. Before any money moves: your company details

The subscription terms are a **consented legal document** — members tick a box at
checkout and we store a hash of the exact wording they agreed to. Right now those
terms say your company is `[Registered company name]`, because these are unset:

```
NEXT_PUBLIC_LEGAL_NAME=Your Company Ltd
NEXT_PUBLIC_COMPANY_NUMBER=12345678
NEXT_PUBLIC_REGISTERED_ADDRESS=1 Example Street, London, N1 1AA
NEXT_PUBLIC_SUPPORT_EMAIL=hello@yourdomain.com
```

`/legal/terms` shows a warning banner while any are placeholders, so it can't go
live unnoticed — but set them **before** the first real consent is recorded, or
your evidence trail points at a document naming nobody.

> ⚠️ **These are `NEXT_PUBLIC_*`, so they are baked in at build time.** Setting
> them requires a redeploy, not just a restart.

---

## 2. Stripe dashboard — test mode

Make sure the **Test mode** toggle (top right) is ON for all of this.

### 2a. API keys
**Developers → API keys.** Copy the **Secret key** (`sk_test_…`).

You do *not* need the publishable key. Nothing in the app reads it — we use
Stripe's hosted Checkout, so the browser never talks to Stripe directly.

### 2b. Turn on the Billing Portal
**Settings → Billing → Customer portal.** New Stripe accounts have this **off**,
and the "manage your card" link in the hub returns an error until it's on.

Enable, and configure:
- ✅ Allow customers to update payment methods
- ❌ **Do not** allow customers to cancel subscriptions there

That second one matters. Cancelling in the portal skips your hub, which means the
member never sees the outstanding balance they owe, and never gets asked to
settle it. Send them to the hub to cancel; the portal is for cards only.

### 2c. Create the webhook endpoint
**Developers → Webhooks → Add endpoint.**

- **URL:** `https://getchrgd.co.uk/api/webhooks/stripe`
- **Events — add all seven:**

| Event | What it does |
|---|---|
| `checkout.session.completed` | Marks a one-off order paid. Activates a subscription and captures its delivery address + real card |
| `invoice.paid` | Raises the fulfilment order, advances the subscription clock, clears "past due" |
| `invoice.payment_failed` | Flags past due, emails the member once per dunning episode |
| `customer.subscription.updated` | Mirrors a pause/cancel made in Stripe rather than your hub |
| `customer.subscription.deleted` | Marks the stored subscription cancelled |
| `checkout.session.expired` | Closes an abandoned checkout |
| `charge.refunded` | Reconciles a refund issued in the Stripe dashboard |

Then copy the endpoint's **Signing secret** (`whsec_…`).

> **`invoice.paid` is the one you cannot skip.** It is what advances
> `monthsActive`, and the cancellation balance is measured against that. Without
> it every member looks permanently new and would be asked to settle balances
> they cleared months ago.

---

## 3. Vercel environment variables

**Project → Settings → Environment Variables.** Set these for **Production**
(and Preview if you want previews working — but read §7 first, there's a trap).

| Variable | Value | Notes |
|---|---|---|
| `PAYMENTS_SOURCE` | `stripe` | Falls back to mock if the key is missing, so it fails safe |
| `STRIPE_ENVIRONMENT` | `test` | Which key set is used. Flipped from the hub at go-live — no redeploy |
| `STRIPE_TEST_SECRET_KEY` | `sk_test_…` | |
| `STRIPE_TEST_WEBHOOK_SECRET` | `whsec_…` | From §2c. **Different per endpoint** — test and live have separate ones |
| `STRIPE_LIVE_SECRET_KEY` | `sk_live_…` | Add at go-live. Empty until then, which is what stops the hub switching to live |
| `STRIPE_LIVE_WEBHOOK_SECRET` | `whsec_…` | From the **live** endpoint, added at go-live |
| `APP_URL` | `https://getchrgd.co.uk` | Used for Stripe return URLs and email links. Get it wrong and members land on localhost |
| `CRON_SECRET` | a long random string | `openssl rand -hex 32`. Without it the cron route is **closed** in production, so the daily job never runs |
| `DATABASE_URL` | *(already set)* | |
| `SUPPLIER_SOURCE` | `mock` | Leave it — you don't have PowerBody API access yet |
| `NOTIFY_SOURCE` | `manual` | Leave it — emails queue in the hub for you to send |

Then **redeploy**. Vercel does not apply env var changes to a running deployment.

---

## 4. Verify the plumbing before testing flows

Three checks, in order. Each one isolates a different thing.

**1. Did the app resolve to Stripe?**
```
curl https://getchrgd.co.uk/api/config
```
Look for `"paymentsLive": true`. If it's `false`, the secret key isn't reaching
the running deployment — check you redeployed after setting it.

**2. Can Stripe reach the webhook?**
In Stripe: **Developers → Webhooks → your endpoint → Send test webhook.**
Expect a `200`. A `401` almost always means Vercel Deployment Protection (§7).

**3. Did the database migrate?**
Sign in to `/myhub`. If it loads, migrations ran. They apply automatically on the
first Postgres connection.

---

## 5. Test-mode walkthrough

Card `4242 4242 4242 4242`, any future expiry, any CVC.

**Shop, as a guest**
1. `/shop` → add something → checkout. You should land on Stripe's hosted page.
2. Pay, enter an address. You return to `/shop?checkout=success`.
3. **Founders Hub → Orders**: the order is there, status **paid**, with the
   address you typed.
4. Open it → **Submit to PowerBody** (mock) → **Sync status**.

**Subscription**
1. Run the quiz → subscribe → create an account → tick the consent box.
2. Pay. Check Stripe: the customer has a subscription, and **an address** — this
   was the bug that would have shipped every box to nowhere.
3. `/myhub` shows your bundle and **the card you actually used**.

**Change it — this is the part that was silently broken**
4. Add a product in the hub. Stripe's subscription amount changes.
5. Pause. Stripe shows `pause_collection`. Resume. It clears.
6. Cancel. **The Stripe subscription ends.** The hub shows the outstanding
   balance and its arithmetic first — but nothing charges it yet (see §8).

**A failed payment**
7. `stripe trigger invoice.payment_failed`, or use card `4000 0000 0000 0341`.
8. The hub shows the plan active but past due; **Founders Hub → Emails** has one
   queued "we couldn't take your payment".

**The daily job**
```
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://getchrgd.co.uk/api/cron/daily?dryRun=1"
```
`dryRun=1` reports what it would do and writes nothing.

---

## 6. Going live

> **Before you swap the keys**, open **Founders Hub → Settings → Going live**. It
> checks everything in §3 against the *running* deployment — so a variable you
> set but never redeployed shows up as outstanding rather than as a surprise —
> and clears the orders and subscriptions you made while testing, so your first
> real month starts at zero. It refuses to delete anything created against a live
> key, so it stays safe to open afterwards. See `docs/GO_LIVE_RESET.md`.

Test mode and live mode share **nothing** — not keys, not customers, not
webhooks, not the portal config. Repeat §2 with the Test-mode toggle **off**:

1. New **live** secret key → `STRIPE_LIVE_SECRET_KEY`. This is *added alongside*
   the test key, not swapped for it.
2. **New webhook endpoint** in live mode, same URL, same seven events → new
   `STRIPE_LIVE_WEBHOOK_SECRET`.
3. **Re-enable the Billing Portal in live mode** — the test-mode setting does not
   carry over. This one catches people out.
4. Complete Stripe's account activation (bank details, business verification) or
   payouts sit in limbo even though charges succeed.
5. Redeploy — the live keys are new variables, and Vercel does not apply those to
   a running deployment.
6. **Founders Hub → Settings → Payments → Which Stripe → Live mode.** This is the
   moment real cards start being charged; it asks you to confirm, and applies on
   the next request. Going back to test is instant and needs no confirmation.
7. Buy something real and cheap with your own card, then refund it from the
   Founders Hub. That single round trip proves charges, the webhook, the order
   and the refund path all work with live credentials.

> The keys are added by redeploy; the **switch** is not. That is deliberate:
> flipping to live is the moment you least want to be hand-editing secrets in a
> hosting dashboard and hoping you pasted the right one. It is also why the app
> reads the **key prefix** rather than the variable name — an `sk_test_…` pasted
> into `STRIPE_LIVE_SECRET_KEY` is ignored, and the hub says so.

---

## 7. Vercel-specific traps

**Deployment Protection blocks webhooks.** If Vercel Authentication or password
protection is on, Stripe's POST gets a `401` and every payment silently fails to
register. Either turn it off for Production, or add
`/api/webhooks/stripe` and `/api/cron/daily` as protection bypass paths.
*This is the single most common reason a Stripe integration "doesn't work" on
Vercel.*

**Preview deployments share your database and your Stripe keys.** If you set the
Stripe vars on Preview too, a preview branch writes real orders into the same
Postgres and can create real Stripe objects. Either leave Preview on
`PAYMENTS_SOURCE=mock`, or give it a separate database. Do not point Preview at
production data with live keys.

**Cron on the Hobby plan** runs once a day and only roughly on schedule. Your
`vercel.json` asks for daily at 06:00 UTC, which fits. If you later want it more
often, that needs Pro.

**Function duration.** `/api/cron/daily` declares `maxDuration = 300`. Hobby caps
at 60s. It'll be fine at low volume, but if the daily job starts timing out as
subscriptions grow, that's the reason.

**Env vars need a redeploy.** Every time. `NEXT_PUBLIC_*` ones especially — those
are compiled into the browser bundle.

---

## 8. What is NOT wired up yet

Be clear about this before you launch:

- **The cancellation balance is calculated and shown, but not charged.** A member
  cancels, sees what they owe, confirms — and no money is taken. Everything
  underneath it is built and tested; what's missing is the charge itself.
  Before switching that on: get the terms wording reviewed by a solicitor, and
  model the numbers across your real bundles (in the published example someone
  owes £80 having paid £70 — with a 50% scratch card it's £115).
- **Delivery is always free.** The £50 free-delivery threshold is advertised but
  no shipping is ever charged.
- **No VAT handling.** Stripe Tax is not enabled.
- **Three-month tubs are dropshipped every month.** The pricing understands the
  cadence; the supplier order doesn't. Fixing it changes what physically ships.
- **PowerBody is mock.** Orders are raised and can be walked through the
  lifecycle, but nothing is actually sent to a supplier.

---

## 9. Watch these in week one

> Most of this section is now answered by **Founders Hub → Monitoring**, which
> checks for stuck orders, a webhook that stopped arriving, a cron that stopped
> firing and an outbox that stopped draining — and raises a banner on the hub
> dashboard when any of them trips. See `docs/MONITORING.md`. The Stripe
> dashboard is still the authority on webhook delivery itself.

- **Stripe → Developers → Webhooks → your endpoint.** Any non-`200` means an
  order didn't register. This is the first place to look when something's wrong.
- **Founders Hub → Orders**, for rows stuck at `pending_payment` — that means the
  webhook isn't landing.
- **Founders Hub → Emails**, for anything queued and unsent.
- Server logs for `cancelled locally but NOT in Stripe`. Cancellation deliberately
  never blocks on Stripe, so it's the one thing that can drift out of step, and it
  needs cancelling by hand in the dashboard when it does.
