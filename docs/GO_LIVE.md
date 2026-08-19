# Going live — the whole thing, in order

Plain English. Everything you have to do to turn CHRGD from a demo into a shop
that takes real money and ships real parcels, in the order it has to happen.

`STRIPE_GO_LIVE.md` is the detailed Stripe runbook and `POWERBODY_API.md` is the
detailed supplier one. This is the map that sits above both, and it is the one
to follow — the other two go deeper on their own half.

---

## Read this first: the two switches are not the same kind of switch

The natural assumption is "I've got a sandbox Stripe and a sandbox PowerBody, so
I swap two sets of credentials and I'm live." That is true for one of them and
not the other, and the difference decides your timeline.

| | Stripe | PowerBody |
|---|---|---|
| **What changes** | The keys. `sk_test_…` → `sk_live_…`, plus a new webhook | **Nothing.** Same URL, same username, same API key |
| **Who does it** | You, in the Stripe dashboard | **Kasia at PowerBody**, at their end |
| **How long** | An afternoon | Days — it is a request, then a wait |
| **What unblocks it** | Finishing Stripe's account activation | Placing a successful test order via the API and emailing her |

**PowerBody has no separate "live API".** Your account is flagged DEMO on their
servers: limited stock, placeholder products, and orders that fail on purpose.
Their guide is explicit —

> Your API account will be activated in a DEMO/sandbox version, with access
> limited stock and automatic failure of orders, until we have verified that the
> integration is successful, i.e. your API places orders correctly.

and Kasia's email ends with *"Please let me know once you have successfully
placed a test order via API."* That sentence is the gate. Nothing you change in
Vercel opens it.

**So start the PowerBody conversation first.** It is the long pole. Stripe can
be done in an afternoon whenever you like; PowerBody is waiting on somebody
else's inbox.

---

## Phase 0 — Before any of it: who you are

The subscription terms are a legal document members tick a box to accept, and we
store a hash of the exact wording they agreed to. Right now that wording says
your company is `[Registered company name]`, because these four are unset:

```
NEXT_PUBLIC_LEGAL_NAME=Your Company Ltd
NEXT_PUBLIC_COMPANY_NUMBER=12345678
NEXT_PUBLIC_REGISTERED_ADDRESS=1 Example Street, London, N1 1AA
NEXT_PUBLIC_SUPPORT_EMAIL=hello@getchrgd.co.uk
```

Set them in Vercel → Settings → Environment Variables, **then redeploy**. These
are `NEXT_PUBLIC_*`, which means they are baked into the build — a restart will
not pick them up.

Do this **before the first real consent is recorded**, or your evidence trail
points at a document naming nobody. `/legal/terms` shows a warning banner while
any of them are still placeholders, so you can check it is done by loading the
page.

Also worth setting now, if you have somewhere for parcels to come back to that
is not your accountant's office:

```
NEXT_PUBLIC_RETURNS_ADDRESS=...
```

---

## Phase 1 — PowerBody: prove it, then ask

Nothing here touches money or ships anything.

**1. Point the app at PowerBody.** In Vercel, set:

```
SUPPLIER_SOURCE=powerbody
POWERBODY_API_URL=https://www.powerbody.co.uk/api/soap/
POWERBODY_API_USER=<your PowerBody API username>
POWERBODY_API_KEY=<the key Kasia emailed you>
```

Leave these two exactly as they are:

```
SUPPLIER_ORDERING=simulate
NEXT_PUBLIC_DATA_SOURCE=mock
```

Redeploy.

**2. Run the integration check.** Founders Hub → **Settings → Supplier → Test the
integration**. It runs every read-only call one at a time and tells you which one
fails rather than "something went wrong".

The check that matters most is **"Fetch full product detail"** (`getProductInfo`).
If it fails with *Resource path is not callable* or *Access denied*, that call is
not enabled on your account — email Kasia and ask her to enable API access and
permissions. Everything you import before it works comes in named after its own
product code.

Expect the report to say it **looks like a sandbox**: stock of exactly 10 or 100,
placeholder names like `P64`, uniform prices. That is correct and not a bug.

**3. Place the test order PowerBody are waiting for.** Same screen, below the
list: confirm the account is a DEMO one and let it place a single test order.
This is the only thing in the hub that writes to PowerBody, and it is deliberately
walled off from your real fulfilment queue.

**4. Email Kasia** (katarzyna@powerbody.co.uk) to say the test order is placed and
ask for full API access.

**5. When she confirms, re-run the check.** Real names, real stock, real prices
means you are through. Now import products: **Products → PowerBody**, paste SKUs,
**Add**. They land in **Products → Review** as pending — nothing is on sale until
you approve it, and the fields a machine guessed (stack slots, goals, dietary
tags) are the ones to actually read, because they decide who gets recommended
what.

---

## Phase 2 — Stripe: swap the keys

Test mode and live mode share **nothing**. Not keys, not customers, not webhooks,
not the billing portal settings. Everything you configured in test mode has to be
done again with the Test-mode toggle **off**.

1. **Finish account activation.** Stripe → business details, bank account,
   verification. Skip it and charges succeed while payouts sit in limbo.
2. **New live secret key** → set `STRIPE_SECRET_KEY=sk_live_…` in Vercel.
3. **New webhook endpoint**, in live mode:
   - URL: `https://getchrgd.co.uk/api/webhooks/stripe`
   - All seven events: `checkout.session.completed`, `invoice.paid`,
     `invoice.payment_failed`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `checkout.session.expired`,
     `charge.refunded`
   - Copy its signing secret → `STRIPE_WEBHOOK_SECRET=whsec_…`

   `invoice.paid` is the one you cannot skip. It advances `monthsActive`, and the
   cancellation balance is measured against that. Without it every member looks
   permanently new.
4. **Re-enable the Billing Portal in live mode** (Settings → Billing → Customer
   portal). It is off by default on a new account, and this setting does not carry
   over from test mode. Allow card updates; **do not** allow cancellation there —
   cancelling in Stripe's portal skips your hub, so the member never sees the
   balance they owe.
5. Set `PAYMENTS_SOURCE=stripe`, and check `APP_URL=https://getchrgd.co.uk` and
   `CRON_SECRET` are set.
6. **Redeploy.**

**Check it took:** `curl https://getchrgd.co.uk/api/config` should show
`"paymentsLive": true`. Then send a test webhook from the Stripe dashboard and
expect a `200`.

> **If that webhook returns 401, it is Vercel Deployment Protection**, not Stripe.
> Turn it off for Production, or add `/api/webhooks/stripe` and `/api/cron/daily`
> as bypass paths. This is the single most common reason a Stripe integration
> "doesn't work" on Vercel, and it fails silently — payments succeed and no order
> is ever recorded.

**Then buy something.** Real card, cheapest thing in the shop, then refund it from
the Founders Hub. That one round trip proves the charge, the webhook, the order
and the refund all work on live credentials — which nothing in test mode can tell
you.

---

## Phase 3 — Wipe the practice data

Everything the app accumulated while it was pointed at test Stripe and DEMO
PowerBody is test data wearing production clothes: orders nobody paid for,
subscriptions nobody holds, an outbox full of emails about all of it. Left in
place it poisons every number the hub reports, and the nightly cron starts
walking dead subscriptions.

```bash
# See what would go. Writes nothing.
DATABASE_URL='<your production connection string>' node scripts/reset-data.mjs

# Actually do it.
DATABASE_URL='<your production connection string>' node scripts/reset-data.mjs --commit --yes
```

It prints the database it is pointed at before it does anything — read that line.

**It deletes** accounts, orders, subscriptions, consents, the email outbox,
analytics, partners, share cards, competition entries, and the supplier snapshots
used for change detection.

**It keeps** your curated catalogue, your bundles, your hub settings and your
share-card artwork — the things you actually made. The schema is untouched, so
there is nothing to re-migrate.

Do this **after** all your testing and **before** you open the doors. If you test
more afterwards, run it again.

---

## Phase 4 — Open the doors

Four switches, and the order is the safety. All four are in the Founders Hub and
take effect without a redeploy.

| Order | Where | Set to | What it does |
|---|---|---|---|
| 1 | Settings → Supplier → Where we read from | **Live PowerBody** | Real products, stock and prices |
| 2 | Products → Review | Approve | Nothing is sold until you have read it |
| 3 | Settings → Catalogue | **Real** | Customers see only what you curated. **It starts empty** |
| 4 | Settings → Supplier → Order sending | **Live** | Send actually sends |

**Work one full day's queue in simulate before step 4.** In simulate the order is
placed against the mock supplier rather than skipped, so it can be submitted,
synced, tracked and shipped exactly like a real one. That is the whole point of a
dry run — you find out what the screen does before it can post a parcel.

Only step 4 can ship anything. The app will refuse to arm it while the catalogue
is still on the mock supplier, because mock SKUs are fixtures and ordering them
for real would buy products that don't exist.

**Then send one real order** and check it appears in the PowerBody portal.

---

## Phase 5 — Pay PowerBody, or nothing ships

This surprises people, so it gets its own section. **Orders you send arrive at
PowerBody unpaid and sit there.** There are no credit accounts.

1. Your order lands on their system with an "on hold" status.
2. Log in at **powerbody.eu** with the same credentials as your API account.
3. Select the orders and check out. Payment goes through SagePay.
4. They ship.

They settle daily, so orders placed during the day group together. Pay at midday
and the afternoon's orders need a second payment. The daily invoice is available
the next day.

**Nothing in CHRGD does this for you.** If you send orders and don't log in and
pay, nothing ships and nobody tells you.

---

## Things to decide before you flip the last switch

These are real, they are live-money behaviours, and none of them is a bug. They
need a decision from you rather than a change from anybody.

**1. Cancelling now charges people.** The exit settlement — the balance owed on
goods already sent when someone leaves early — is calculated, shown, agreed to,
and then **actually charged** to the card on file the moment Stripe is live. The
protections are all in code and all in the Terms: never more than they have
already paid, balances of £5 or less waived, first-month discount never
reclaimed, and a "leave free on this date" option shown. `EXIT_LEGAL_REVIEW.md`
is written to be sent to a solicitor as-is. **Send it before the first real
member can cancel**, because the first time this runs it takes money.

**2. PowerBody expects £1,000 a month.** Their guide sets a minimum order total of
£1,000 per month to qualify for dropshipping, and gives you two months from
starting to get there. Below it you may lose the dropshipping account.

**3. You are not VAT registered, on purpose.** The hub tracks your rolling
turnover against the HMRC threshold and will tell you when registration becomes
compulsory. Registering early costs you the VAT rate times your margin — the
arithmetic is in `lib/pricing/vat-position.ts`. Watch the number; don't act on
instinct.

**4. Three places PowerBody will not deliver.** Northern Ireland, Guernsey and
Jersey look like ordinary UK addresses and are refused at their end. The
fulfilment queue flags them before you send. A UK account can only ship within
the UK.

**5. Preview deployments share your database.** If you set the live Stripe keys on
Vercel's Preview environment too, a preview branch can write real orders and
create real Stripe objects. Leave Preview on `PAYMENTS_SOURCE=mock`.

---

## Week one: three things to watch

- **Stripe → Developers → Webhooks.** Any non-`200` means an order didn't
  register. First place to look when something is wrong.
- **Founders Hub → Orders**, for anything stuck at `pending_payment`. That means
  the webhook isn't landing.
- **Founders Hub → Emails**, for anything queued and unsent. Email defaults to
  `manual`, which means messages queue in the hub for you to send by hand.

---

## The whole thing as a checklist

```
[ ] Company name, number, address, support email set in Vercel + redeployed
[ ] SUPPLIER_SOURCE=powerbody with all three credentials
[ ] Integration check passes — especially "Fetch full product detail"
[ ] Sandbox test order placed from the hub
[ ] Emailed Kasia; account promoted out of DEMO; check re-run
[ ] Products imported and approved in Review
[ ] Stripe account activation complete (bank details, verification)
[ ] Live secret key set
[ ] Live webhook created with all seven events; signing secret set
[ ] Billing portal re-enabled in live mode, cancellation disabled
[ ] PAYMENTS_SOURCE=stripe, APP_URL, CRON_SECRET set; redeployed
[ ] /api/config shows paymentsLive: true
[ ] Stripe test webhook returns 200 (not 401)
[ ] Real card round trip: bought, then refunded from the hub
[ ] Exit settlement terms reviewed by a solicitor
[ ] scripts/reset-data.mjs run against production
[ ] One full day's fulfilment queue worked in simulate
[ ] Catalogue switched to Real
[ ] Order sending switched to Live
[ ] One real order sent and confirmed in the PowerBody portal
[ ] Logged in at powerbody.eu and paid for it
```
