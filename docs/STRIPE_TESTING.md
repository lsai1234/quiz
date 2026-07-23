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
STRIPE_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx   # optional today (we use hosted Checkout)
STRIPE_WEBHOOK_SECRET=whsec_xxx                  # from step 3
APP_URL=http://localhost:3000                    # your public origin when deployed

# leave the supplier on mock
SUPPLIER_SOURCE=mock
```

Notes:
- The **secret key is required** — without it the payments resolver falls back to
  mock (safe by design). `getPaymentSource()` returns `stripe` only when the key
  is present *and* the mode is `stripe`/`auto`.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` isn't used by the current hosted-checkout
  flow (we redirect to Stripe's page); set it now for future embedded UI.
- You can also flip the mode at runtime from the **Founders Hub → Settings →
  Payments** toggle (it persists in the DB and wins over the env var). The key
  still has to be set in the environment.

## 3. Receive webhooks

The webhook (`POST /api/webhooks/stripe`) is what marks orders paid, raises
subscription orders, and syncs cancellations. It **must** reach your app.

### Local — Stripe CLI (recommended)
```
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
The CLI prints a `whsec_…` — put it in `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.
Keep `stripe listen` running while you test.

### Deployed (Vercel etc.)
Stripe **Developers → Webhooks → Add endpoint**:
- URL: `https://<your-domain>/api/webhooks/stripe`
- Events: `checkout.session.completed`, `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.deleted`
- Copy the endpoint's **Signing secret** into `STRIPE_WEBHOOK_SECRET`.

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
4. **Hub (`/hub`)**: your bundle shows; open a line → the substitution toggle
   reflects your choice. **Orders** shows a `subscription` order for the first invoice.
5. Cancelling the subscription in Stripe (or the billing portal) flips the stored
   subscription to cancelled via the `customer.subscription.deleted` webhook.

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
- **Billing portal 400** → only works after a Stripe subscription exists (we need a
  customer id) and with the portal enabled in the Stripe dashboard.
