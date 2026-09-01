# Testing the Stripe integration (and everything except live PowerBody)

Everything defaults to **mock**, so the app runs with no keys. This guide switches
**payments** to real Stripe **test mode** while leaving the **supplier on mock**
(we don't have PowerBody API access yet). At the end you'll have exercised: shop
checkout, quiz one-off, subscriptions, the orders hub, PowerBody scan-and-add
(mock), AI autopopulate, and the stock-alerts journey.

> **Two independent switches.** `PAYMENTS_SOURCE` (Stripe) and `SUPPLIER_SOURCE`
> (PowerBody) are separate. Turn payments to `stripe`; leave supplier `mock`.

---

## 1. Get Stripe test keys

1. Create/open a Stripe account → make sure you're in **Test mode** (toggle, top-right).
2. **Developers → API keys**: copy the **Secret key** (`sk_test_…`) and
   **Publishable key** (`pk_test_…`).
3. You'll get the **webhook signing secret** (`whsec_…`) in step 3.

## 2. Set the environment

Add to `.env.local` (local) or your host's env (Vercel → Project → Settings → Environment Variables):

```
PAYMENTS_SOURCE=stripe
STRIPE_ENVIRONMENT=test
STRIPE_TEST_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY=pk_test_xxx   # optional today (we use hosted Checkout)
STRIPE_TEST_WEBHOOK_SECRET=whsec_xxx                  # from step 3
APP_URL=http://localhost:3000                         # your public origin when deployed

# leave the supplier on mock
SUPPLIER_SOURCE=mock
```

Notes:
- The **secret key is required** — without it the payments resolver falls back to
  mock (safe by design). `getPaymentSource()` returns `stripe` only when the key
  for the *selected* environment is present *and* the mode is `stripe`/`auto`.
- `NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY` isn't used by the current
  hosted-checkout flow (we redirect to Stripe's page); set it now for future
  embedded UI. It is `NEXT_PUBLIC_*`, so changing it needs a redeploy.
- **Two runtime switches, both in Founders Hub → Settings → Payments**, both
  persisted in the DB and both winning over the env vars: *how checkout takes
  money* (mock / auto / Stripe) and *which Stripe* (test / live). The keys still
  have to be in the environment.
- Adding `STRIPE_LIVE_SECRET_KEY` and `STRIPE_LIVE_WEBHOOK_SECRET` alongside the
  test pair is what turns going live into a button rather than an edit. Until
  they are set, the hub cannot switch to live — see `docs/STRIPE_GO_LIVE.md` §6.
- The **key prefix is the authority**, not the variable name: an `sk_test_…`
  pasted into `STRIPE_LIVE_SECRET_KEY` is ignored rather than used, and the hub
  says which variable is wrong.
- The single-key form (`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` /
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) still works and fills in for whichever
  world its prefix belongs to. It just cannot switch.

## 3. Receive webhooks

The webhook (`POST /api/webhooks/stripe`) is what marks orders paid, raises
subscription orders, and syncs cancellations. It **must** reach your app.

### Local — Stripe CLI (recommended)
```
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
The CLI prints a `whsec_…` — put it in `STRIPE_TEST_WEBHOOK_SECRET` and restart `npm run dev`.
Keep `stripe listen` running while you test.

### Deployed (Vercel etc.)
Stripe **Developers → Webhooks → Add endpoint**:
- URL: `https://getchrgd.co.uk/api/webhooks/stripe`
- Events — **all seven matter**, and the app handles each:

  | Event | What it does here |
  |---|---|
  | `checkout.session.completed` | marks a one-off order paid; activates a subscription, and captures its delivery address + real card |
  | `invoice.paid` | raises the fulfilment order, advances the subscription clock, clears `past_due` |
  | `invoice.payment_failed` | flags `past_due` and emails the member once per dunning episode |
  | `customer.subscription.updated` | mirrors a pause/cancel made in the Stripe dashboard or billing portal |
  | `customer.subscription.deleted` | marks the stored subscription cancelled |
  | `checkout.session.expired` | closes an abandoned checkout so it stops sitting at `pending_payment` |
  | `charge.refunded` | reconciles a refund issued in Stripe back onto the order |

- Copy the endpoint's **Signing secret** into `STRIPE_WEBHOOK_SECRET`.

> **The clock depends on `invoice.paid` arriving.** `monthsActive` — which the
> cancel settlement is measured against — only advances when that event lands.
> Miss it and members look permanently new, and are asked to settle balances
> they cleared months ago.

> A DB that persists is required for orders/subscriptions to survive. Locally,
> SQLite is fine. On serverless (Vercel) set `DATABASE_URL` to hosted Postgres —
> see `docs/BACKEND.md`.

## 4. Test cards

Use Stripe's test cards (any future expiry, any CVC, any postcode):
- **Success:** `4242 4242 4242 4242`
- **Requires authentication:** `4000 0025 0000 3155`
- **Declined:** `4000 0000 0000 0002`

---

## 5. What to test

### A. Shop one-off (guest)
1. `/shop` → add items → checkout. You're redirected to Stripe Checkout.
2. Pay with `4242…`, fill the address. You return to `/shop?checkout=success`.
3. **Founders Hub → Orders**: a `shop` order appears, status **paid**, with the
   line items and the shipping address you entered.
4. Open it → **Submit to PowerBody** (mock) → **Sync status** → watch it move
   paid → submitted → (sync) received. **Refund** issues a real Stripe test refund.

### B. Quiz one-off
Run the quiz → choose the one-off plan → checkout. Same as above, order `channel = quiz`.

### C. Subscription
1. Quiz → **subscribe** (you'll be asked to create/sign in to an account).
2. On the confirmation, set the **out-of-stock preferences** per line (allow / decline).
3. Pay in Stripe (subscription mode). Back in the app you're subscribed.
4. **Hub (`/myhub`)**: your bundle shows; open a line → the substitution toggle
   reflects your choice. **Orders** shows a `subscription` order for the first invoice.
5. Cancelling the subscription in Stripe (or the billing portal) flips the stored
   subscription to cancelled via the `customer.subscription.deleted` webhook.

### C2. Changing a live subscription (the hub → Stripe path)

1. In `/myhub`, **add a product**. Watch Stripe → the subscription's amount changes
   from the next cycle (`proration_behavior: 'none'`, so no mid-cycle top-up).
2. **Pause**. Stripe shows `pause_collection` with behaviour *void* — invoices
   raised while paused are voided, never banked as a debt. **Resume** clears it.
3. **Cancel**. The Stripe subscription ends immediately. The hub shows the
   outstanding balance and its arithmetic first — *note that nothing charges it
   yet*, that is Phase 3.
4. Break it on purpose: put Stripe in a failing state (or use an invalid
   subscription id in the DB) and change the plan. The hub should show an error
   and **roll back** — a stored plan must never disagree with the card charge.

### C3. A failed payment

1. Update the customer's card to `4000 0000 0000 0341` (attaches fine, fails on
   the next charge) and trigger a renewal, or use
   `stripe trigger invoice.payment_failed`.
2. The hub shows the plan still active, flagged past due.
3. **Founders Hub → Emails**: one "we couldn't take your payment" email, queued.
   Retries of the same invoice must NOT queue more.
4. Pay the invoice in Stripe → the flag clears on `invoice.paid`.

### D. Supplier + catalogue (stays mock — no PowerBody keys)
1. **Founders Hub → PowerBody**: browse the mock feed, see stock / cost / RRP /
   margin, **Add** a few products (single or bulk). They're **AI-classified**
   (claim-safe) on add — review them in **Products**.
2. Added products appear in the shop and quiz.

### E. Stock alerts (the substitution journey)
1. Make sure a subscription includes a product you added from PowerBody (add it in
   the hub, or subscribe to a stack containing one).
2. **Founders Hub → Stock alerts** → in **"Force a SKU out of stock (demo)"** enter
   that product's supplier SKU (copy it from the PowerBody page), then **Run stock
   check**.
3. The affected subscription surfaces. For a line that **allows** substitution,
   click **Swap to <replacement>** — the member's future boxes switch to the
   in-stock same-category product. For a line that **declined**, use **Skip next
   box** or **Notify member**.

---

## 6. Going fully live (later)

- **PowerBody:** implement `src/lib/supplier/powerbody/live.ts` against their API,
  set `POWERBODY_API_URL` / `POWERBODY_API_KEY`, flip `SUPPLIER_SOURCE=powerbody`.
- **Stripe:** swap the test keys for live keys, re-create the webhook endpoint in
  live mode, and (if using it) enable the **Billing portal** in the Stripe dashboard.
- **Daily stock check:** it runs from the "Run stock check" button today; wire it to
  a scheduler (cron / scheduled function) hitting `runStockCheck()` once a day.

## Troubleshooting

- **Order stays `pending_payment`** → the webhook isn't arriving. Check `stripe
  listen` is running (local) or the endpoint's recent deliveries (deployed), and
  that `STRIPE_WEBHOOK_SECRET` matches.
- **Checkout returns `#mock-checkout`** → payments resolved to mock. Confirm
  `STRIPE_SECRET_KEY` is set and the mode is `stripe`/`auto` (env or Settings).
  `GET /api/config` reports `paymentsLive` — the quickest way to check what the
  server actually resolved.
- **A hub change fails with "we couldn't update your billing"** → Stripe refused
  the update and nothing was saved, on purpose. The reason is in the server log.
- **A cancellation succeeded but Stripe still shows the subscription** → look for
  `cancelled locally but NOT in Stripe` in the logs and cancel it by hand.
  Cancellation is deliberately never blocked on Stripe, so this is the one case
  that can drift.
- **Billing portal 400** → only works after a Stripe subscription exists (we need a
  customer id) and with the portal enabled in the Stripe dashboard.
