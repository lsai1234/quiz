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
| `STRIPE_SECRET_KEY` | `sk_test_…` | Swap for `sk_live_…` at go-live |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | From §2c. **Different per endpoint** — test and live have separate ones |
| `APP_URL` | `https://getchrgd.co.uk` | Used for Stripe return URLs and email links. Get it wrong and members land on localhost |
| `CRON_SECRET` | a long random string | `openssl rand -hex 32`. Without it the cron route is **closed** in production, so the daily job never runs |
| `DATABASE_URL` | *(already set)* | |
| `SUPPLIER_SOURCE` | `mock` | Leave it while testing Stripe. Switching it to `powerbody` is a separate journey with its own gate — see `GO_LIVE.md` |
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
   balance and its arithmetic first, and then **charges it** — in test mode that
   is a test-mode invoice, but the code path is the live one (see §8). Check the
   invoice appears on the Stripe customer.

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

Test mode and live mode share **nothing** — not keys, not customers, not
webhooks, not the portal config. Repeat §2 with the Test-mode toggle **off**:

1. New **live** secret key → `STRIPE_SECRET_KEY`.
2. **New webhook endpoint** in live mode, same URL, same seven events → new
   `STRIPE_WEBHOOK_SECRET`.
3. **Re-enable the Billing Portal in live mode** — the test-mode setting does not
   carry over. This one catches people out.
4. Complete Stripe's account activation (bank details, business verification) or
   payouts sit in limbo even though charges succeed.
5. Redeploy.
6. Buy something real and cheap with your own card, then refund it from the
   Founders Hub. That single round trip proves charges, the webhook, the order
   and the refund path all work with live credentials.

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

## 8. What happens the moment this goes live

This section used to list things that were built but not connected. Most of them
have since been connected, which changes what "flip the switch" means — so read
it as *what starts happening*, not as a list of gaps.

- **Cancelling charges the member.** The exit settlement is calculated, shown,
  agreed to and then billed off-session against the card on file
  (`chargeSettlement`, called from `/api/hub/subscription/cancel`). A decline
  never blocks the cancellation — it leaves an open invoice. The protections are
  in code and in the Terms: capped at what they have already paid, balances of £5
  or less waived, intro discount never reclaimed. **Get `EXIT_LEGAL_REVIEW.md` in
  front of a solicitor before the first real member can cancel** — it is written
  to be sent as-is, and the first run of this takes real money.
- **Delivery is charged.** Checkout charges postage on the customer rate ladder
  (`delivery.customerRates`), and `shipping_price` goes to PowerBody so the
  invoice in the parcel is right. One-off orders let the customer pick
  mainland vs Highlands, because Stripe fixes shipping options before it knows
  the postcode; the fulfilment queue flags a mainland rate paid on a Highlands
  address. Subscriptions get no such pick — Stripe only accepts shipping options
  in payment mode — so postage recurs as a line item at the mainland rate.
- **Delivery cadence is respected.** A three-month tub ships once every three
  months, not monthly: `shipsAtCycle` gates which lines go into each fulfilment
  order. This is what makes the flat monthly price honest, and the exit
  settlement bills against the same model.
- **Still no VAT.** Stripe Tax is not enabled and we are not registered — a
  deliberate position, not an omission. The hub tracks rolling turnover against
  the HMRC threshold (`lib/pricing/vat-position.ts`) and says when registration
  becomes compulsory. The settlement invoice carries no VAT line while that
  holds (`settlement.chargeVat`, its own flag on purpose).
- **PowerBody is only mock until you say otherwise.** Whether orders reach the
  supplier is a separate switch from Stripe entirely — see `GO_LIVE.md`, which
  is the runbook that covers both halves in the order they have to happen.

---

## 9. Watch these in week one

- **Stripe → Developers → Webhooks → your endpoint.** Any non-`200` means an
  order didn't register. This is the first place to look when something's wrong.
- **Founders Hub → Orders**, for rows stuck at `pending_payment` — that means the
  webhook isn't landing.
- **Founders Hub → Emails**, for anything queued and unsent.
- Server logs for `cancelled locally but NOT in Stripe`. Cancellation deliberately
  never blocks on Stripe, so it's the one thing that can drift out of step, and it
  needs cancelling by hand in the dashboard when it does.
