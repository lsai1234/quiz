# Connecting Stripe — the plain-English checklist

Follow top to bottom. Don't skip ahead — a couple of these break silently if
done out of order.

`docs/STRIPE_GO_LIVE.md` is the detailed version. This is the one to actually
work from.

**Roughly 30 minutes.** Have two browser tabs open: **Stripe** and **Vercel**.

---

## PART 1 — Your company details

*~5 minutes. Do this first. Your terms and conditions currently say
"[Registered company name]" instead of your actual company, and customers are
agreeing to them at checkout.*

☐ **1.1** — Vercel → your project → **Settings** → **Environment Variables**

☐ **1.2** — Add these four, one at a time. Set each to **Production**:

| Name (copy exactly) | What to put |
|---|---|
| `NEXT_PUBLIC_LEGAL_NAME` | Your registered company name |
| `NEXT_PUBLIC_COMPANY_NUMBER` | Your Companies House number |
| `NEXT_PUBLIC_REGISTERED_ADDRESS` | Your registered address, one line |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | The email customers should write to |

☐ **1.3** — Leave the tab open. You'll add more in Part 3.

> **Why it matters:** when someone subscribes they tick a box agreeing to your
> terms, and we save a copy of exactly what they agreed to. If your company name
> isn't in there, that record is worthless.

---

## PART 2 — Stripe

*~10 minutes. Check the **Test mode** toggle in the top right is **ON** for all
of this. Nothing here touches real money.*

### Get your key

☐ **2.1** — Stripe → **Developers** → **API keys**

☐ **2.2** — Copy the **Secret key**. Starts with `sk_test_`. Paste it somewhere
for a minute — you'll need it in Part 3.

*(Ignore the publishable key. We don't use it.)*

### Turn on the customer portal

*This is the "update my card" page. It's switched off in new Stripe accounts,
and the link in your app just errors until you turn it on.*

☐ **2.3** — Stripe → **Settings** → **Billing** → **Customer portal**

☐ **2.4** — Turn ON: *let customers update payment methods*

☐ **2.5** — Turn OFF: *let customers cancel subscriptions*

> **Why turn cancelling off:** if they cancel from Stripe's page, they skip your
> app entirely — so they never see what they owe for products you've already
> sent them. Make them cancel in your hub, where that's shown.

☐ **2.6** — Save.

### Tell Stripe where to send updates

*This is how your app finds out that someone paid. Without it, people get
charged and your app never notices.*

☐ **2.7** — Stripe → **Developers** → **Webhooks** → **Add endpoint**

☐ **2.8** — URL: `https://getchrgd.co.uk/api/webhooks/stripe`
(swap in your real domain)

☐ **2.9** — Tick these **seven** events. All of them:

```
checkout.session.completed
invoice.paid
invoice.payment_failed
customer.subscription.updated
customer.subscription.deleted
checkout.session.expired
charge.refunded
```

☐ **2.10** — Save, then copy the **Signing secret**. Starts with `whsec_`.

---

## PART 3 — Back to Vercel

*~5 minutes.*

☐ **3.1** — Make up a long random password for the next step. Any password
generator, 30+ characters. This just stops strangers triggering your daily job.

☐ **3.2** — Add these six settings, all set to **Production**:

| Name (copy exactly) | What to put |
|---|---|
| `PAYMENTS_SOURCE` | `stripe` |
| `STRIPE_ENVIRONMENT` | `test` |
| `STRIPE_TEST_SECRET_KEY` | The `sk_test_...` key from 2.2 |
| `STRIPE_TEST_WEBHOOK_SECRET` | The `whsec_...` secret from 2.10 |
| `APP_URL` | `https://getchrgd.co.uk` |
| `CRON_SECRET` | The random password from 3.1 |

☐ **3.3** — **Redeploy.** Vercel → **Deployments** → the top one → **⋯** →
**Redeploy**.

> **Don't skip this.** Vercel ignores new settings until you redeploy. If you
> stop here, nothing you just did is switched on.

---

## PART 4 — Check it worked

*~2 minutes. Two checks. Both should pass before you try buying anything.*

☐ **4.1** — Visit this in your browser:
`https://getchrgd.co.uk/api/config`

Look for **`"paymentsLive": true`**.

- ✅ `true` → Stripe is connected. Carry on.
- ❌ `false` → the key isn't reaching your site. Did you redeploy? (Step 3.3)

☐ **4.2** — Stripe → **Developers** → **Webhooks** → click your endpoint →
**Send test webhook** → pick any event → send.

- ✅ Green **200** → your app is receiving updates. Carry on.
- ❌ Red **401** → skip to **"The thing that will probably break"** below.

---

## PART 5 — Buy something

*~10 minutes. Test card: `4242 4242 4242 4242`, any future expiry date, any 3
digits for the code.*

☐ **5.1** — Go to your shop, add something, check out. You should land on a
Stripe payment page.

☐ **5.2** — Pay with the test card. Fill in the address.

☐ **5.3** — Founders Hub → **Orders**. Your order should be there, marked
**paid**, with the address you typed.

*If it says **pending payment** instead, the webhook isn't getting through — see
below.*

☐ **5.4** — Now do the quiz and **subscribe**. Make an account, tick the consent
box, pay.

☐ **5.5** — Check in Stripe that the new subscription has **a delivery address**
on it.

☐ **5.6** — Go to your hub and **cancel**. Check in Stripe that the subscription
has actually stopped.

**That's it — you're connected.** 🎉

---

## The thing that will probably break

**If Stripe shows red 401s**, your site is password-protected and Stripe can't
get in. Payments will go through at Stripe and your app will never hear about
them — orders stay stuck on "pending payment" forever.

**Fix:** Vercel → **Settings** → **Deployment Protection** → turn it off for
Production. (Or add `/api/webhooks/stripe` and `/api/cron/daily` as bypass
paths, if you want to keep the rest protected.)

This is the single most common reason Stripe "doesn't work" on Vercel.

---

## One thing to be careful with

**Only put the Stripe settings on Production. Not Preview.**

Preview deployments share your real database. If you add Stripe keys there too,
a test branch can write real orders into your live data.

---

## When you're ready for real money

Everything above was practice mode. Real mode shares **nothing** with it — you
have to do it all again with the Test toggle **off**.

☐ Turn **Test mode OFF** in Stripe

☐ Get a new secret key (starts `sk_live_`) → **add** `STRIPE_LIVE_SECRET_KEY`.
Add it, don't replace the test one — keeping both is what makes the switch below
a button rather than an edit.

☐ Create the webhook again, same address, same seven events → new signing
secret → add `STRIPE_LIVE_WEBHOOK_SECRET`

☐ **Turn the customer portal on again** — the setting doesn't carry over. Easy
one to miss.

☐ Finish Stripe's account verification (bank details etc.) or your money sits in
limbo even though payments work

☐ Redeploy

☐ **Founders Hub → Settings → Payments → Which Stripe → Live mode.** It asks you
to confirm, then applies on the next request. This is the moment real cards start
being charged. Switching back to test is instant.

☐ Buy something cheap with your own real card, then refund it from the Founders
Hub. That one round trip proves everything works for real.

---

## Things that genuinely don't work yet

Not bugs — just not built. Worth knowing before you launch:

- **The cancellation balance isn't charged.** Someone cancels, sees what they
  owe, confirms — and no money is taken. Everything's built except the actual
  charge. Needs a solicitor to check the wording first, and needs you to check
  the numbers aren't too harsh.
- **Delivery is always free**, even though you advertise "free over £50".
- **No VAT handling.**
- **PowerBody is still fake.** Orders go through the motions but nothing is sent
  to a real supplier.
- **Three-month tubs get sent every month.** The pricing knows better; the
  shipping instruction doesn't.

---

## If something looks wrong later

**Start here:** Stripe → **Developers** → **Webhooks** → your endpoint. Anything
that isn't a green 200 means an order didn't register. This tells you what
happened faster than anything else.

Then:
- **Orders stuck on "pending payment"** → the webhook isn't arriving
- **Founders Hub → Emails** → anything sitting there unsent
- Someone cancelled but Stripe is still charging them → rare, but check the
  Stripe dashboard and cancel by hand. Cancelling in your app never waits for
  Stripe (on purpose — nobody should be trapped), so this is the one thing that
  can drift.
