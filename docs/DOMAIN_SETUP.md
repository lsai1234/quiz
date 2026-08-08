# Moving to getchrgd.co.uk — Cloudflare, Vercel, Stripe and everything else

The site used to live on `quiz.getchrgd.co.uk`. It now lives on the apex domain
`getchrgd.co.uk`, and the two signed-in areas were renamed at the same time.

| What | Was | Now |
|---|---|---|
| The quiz | `quiz.getchrgd.co.uk/` | `getchrgd.co.uk/` |
| The shop | `quiz.getchrgd.co.uk/shop` | `getchrgd.co.uk/shop` |
| Customer hub | `quiz.getchrgd.co.uk/hub` | `getchrgd.co.uk/myhub` |
| Founders Hub | `quiz.getchrgd.co.uk/portal` | `getchrgd.co.uk/founderhub` |

The old *paths* keep working — `next.config.ts` redirects `/hub/*` → `/myhub/*`
and `/portal/*` → `/founderhub/*`, query strings included, so the change links
already sitting in members' inboxes (`/hub?change=…`) still open the right
screen. The old *host* needs a redirect you set up yourself; see §3.

The API routes did **not** move. They are still `/api/hub/*` and
`/api/portal/*`. Nobody types those, no external service points at them, and
renaming them would only have invalidated the Stripe and OAuth setup below.

---

## 1. Cloudflare — DNS

You bought the domain through Cloudflare Registrar, so Cloudflare is already
authoritative for it and there are no nameservers to change.

**Cloudflare dashboard → getchrgd.co.uk → DNS → Records.**

### 1a. Point the apex at Vercel

Add (or edit) an **A** record:

| Field | Value |
|---|---|
| Type | `A` |
| Name | `@` *(this means the apex, getchrgd.co.uk itself)* |
| IPv4 address | **whatever Vercel shows you** — see the note below |
| Proxy status | **DNS only** (grey cloud) |
| TTL | Auto |

> **Take the IP from Vercel, don't take it from here.** In Vercel: **Project →
> Settings → Domains → add `getchrgd.co.uk`** and Vercel prints the exact record
> to create. Its general-purpose apex value has long been `76.76.21.21`, but
> newer projects are issued their own, and using a stale one leaves the domain
> pointing nowhere. Add the domain in Vercel *first*, then create the record
> Cloudflare-side to match.

### 1b. Point www at Vercel

| Field | Value |
|---|---|
| Type | `CNAME` |
| Name | `www` |
| Target | the `*.vercel-dns.com` target Vercel gives you |
| Proxy status | **DNS only** (grey cloud) |
| TTL | Auto |

Then in Vercel add `www.getchrgd.co.uk` as well and set it to **redirect to
`getchrgd.co.uk`** (Vercel offers this on the domain row). Pick one canonical
host and make the other bounce to it — serving the same pages on both splits
your SEO and makes cookies behave inconsistently.

### 1c. The grey cloud is not optional (at first)

Both records must be **DNS only / grey cloud** while Vercel issues the TLS
certificate. Proxied (orange cloud), Cloudflare terminates TLS itself and
Vercel's Let's Encrypt challenge can never complete, so the domain sits on
"Invalid Configuration" forever.

Once Vercel shows the domain as **Valid** with a certificate issued, you *may*
turn the proxy back on if you want Cloudflare's caching or WAF. If you do:

- **SSL/TLS → Overview → Full (strict).** Anything less (Flexible especially)
  causes redirect loops with Vercel and sends traffic to your own origin
  unencrypted.
- Re-check that `/api/webhooks/stripe` still returns `200` to Stripe. A WAF or
  Bot Fight Mode rule that challenges POSTs will silently break payments.
- Leave **Auto Minify** and **Rocket Loader** off. They rewrite the JS that
  Next.js hydrates against.

Honestly: leave it grey. Vercel already has a CDN in front of the app, and
double-proxying buys you very little here while adding a second place where
things break.

### 1d. CAA records

If you already have CAA records on the zone, add one for Let's Encrypt or
Vercel cannot issue the certificate:

```
getchrgd.co.uk  CAA  0 issue "letsencrypt.org"
```

If you have no CAA records at all, skip this — no CAA means "any CA may issue",
which is what you want.

---

## 2. Vercel — the project

**Project → Settings → Domains:**

1. Add `getchrgd.co.uk`. Create the DNS record it asks for (§1a). Wait for
   **Valid Configuration**.
2. Add `www.getchrgd.co.uk`, set it to redirect to `getchrgd.co.uk` (308).
3. Set `getchrgd.co.uk` as the **production domain** — this is the one Vercel
   uses for `VERCEL_PROJECT_PRODUCTION_URL` and the deployment's canonical link.
4. Keep `quiz.getchrgd.co.uk` attached for now, as a redirect (§3).

**Project → Settings → Environment Variables**, Production scope:

| Variable | Value | Why |
|---|---|---|
| `APP_URL` | `https://getchrgd.co.uk` | The big one. Stripe Checkout's success and cancel URLs, the Stripe billing-portal return URL, every OAuth redirect and every link in every member email are built from it. No trailing slash. |
| `NEXT_PUBLIC_SITE_URL` | `https://getchrgd.co.uk` | Only feeds `/sitemap.xml` and `/robots.txt`, and it already defaults to this value — set it explicitly anyway so a preview deploy can override it. |

**Redeploy after changing them.** Vercel does not apply environment variable
changes to a deployment that is already running, so until you redeploy, Stripe
still returns customers to the old host.

If **Deployment Protection** (Vercel Authentication / password) is on, keep
`/api/webhooks/stripe` and `/api/cron/daily` as protection-bypass paths — those
are called by Stripe and by Vercel Cron, neither of which can log in.

---

## 3. Redirect the old subdomain

`quiz.getchrgd.co.uk` is in people's history, in any link you have posted, and
possibly in an ad account. Redirect it rather than deleting it.

**The easy way — do it in Vercel.** Leave `quiz.getchrgd.co.uk` attached to the
project and set it to **Redirect to `getchrgd.co.uk`**, status **308**. Vercel
preserves the path, so `quiz.getchrgd.co.uk/shop` → `getchrgd.co.uk/shop`. The
DNS record for `quiz` stays exactly as it is today.

**The Cloudflare way**, if you would rather the redirect never touch the app:
**Rules → Redirect Rules → Create rule.**

- **If** — Custom filter expression: `Hostname equals quiz.getchrgd.co.uk`
- **Then** — Dynamic redirect
  - Expression: `concat("https://getchrgd.co.uk", http.request.uri.path)`
  - Status: `301`
  - ✅ Preserve query string
- Deploy.

A Cloudflare redirect rule only fires on **proxied** traffic, so `quiz` must be
an orange-cloud record for this to work. If it is currently a grey-cloud CNAME
to Vercel, either flip it to orange (and point it at anything — the redirect
answers before the origin is consulted) or just use the Vercel method above.

Whichever you pick, **use 301/308 (permanent)** for the host redirect. You want
search engines to transfer ranking to the apex. That is the opposite of the
in-app `/hub` → `/myhub` redirects, which are deliberately temporary because
those paths stay yours.

---

## 4. Stripe

**Nothing in Stripe stores your success/cancel URLs** — the app sends them with
each Checkout Session, built from `APP_URL` (`src/lib/checkout/finalize.ts`,
`src/app/api/cart/route.ts`). So setting `APP_URL` and redeploying fixes those.
What *is* stored in Stripe, and does need changing by hand:

☐ **Webhook endpoint.** Developers → Webhooks → your endpoint → **Update
details**. Change the URL to `https://getchrgd.co.uk/api/webhooks/stripe`.
Do it in **both** test and live mode — they are separate endpoints with separate
signing secrets. If you create a new endpoint instead of editing the old one,
the signing secret changes and you must update `STRIPE_WEBHOOK_SECRET` too.

☐ **Billing portal default return URL.** Settings → Billing → Customer portal →
set the default return link to `https://getchrgd.co.uk/myhub`. The app passes
its own return URL on every session, so this is only the fallback — but it is
the fallback that gets used when a customer opens the portal from an emailed
invoice, which is exactly when you don't want them dumped on a dead host.

☐ **Branding and public business details.** Settings → Business → Branding, and
Public details: any website URL there is shown to customers on the Checkout page
and on receipts. Change `quiz.getchrgd.co.uk` to `getchrgd.co.uk`.

☐ **Checkout settings.** Settings → Payments → Checkout and Payment Links: the
"after payment" and cancel URL defaults, and your terms-of-service and privacy
links, if you set them to the old host. Point terms at
`https://getchrgd.co.uk/legal/terms`.

☐ **Apple Pay / Google Pay domain registration.** Settings → Payments → Payment
method domains. `quiz.getchrgd.co.uk` is registered there; `getchrgd.co.uk` is
not. Until you add and verify the apex, the wallet buttons silently do not
render at checkout — no error, they are just missing, and you lose the fastest
conversion path on mobile without ever seeing a failure.

☐ **Radar rules**, if any reference the old domain.

Then re-run the verification in `docs/STRIPE_GO_LIVE.md` §4 against the new
host: `curl https://getchrgd.co.uk/api/config` should report
`"paymentsLive": true`, and Stripe's **Send test webhook** should get a `200`.

---

## 5. Social sign-in — every provider needs the new callback

Each OAuth provider validates the redirect URI against an allow-list it holds.
The app builds that URI from `APP_URL`, so after the move it sends
`https://getchrgd.co.uk/api/auth/<provider>/callback` — and every provider will
reject it until you add it. Symptom is a `redirect_uri_mismatch` error page
*after* the customer has already typed their password.

Add the new URI **alongside** the old one, deploy, verify, then remove the old:

| Provider | Where | Add |
|---|---|---|
| Google | Cloud Console → APIs & Services → Credentials → your OAuth client | `https://getchrgd.co.uk/api/auth/google/callback` — also add `https://getchrgd.co.uk` to **Authorised JavaScript origins** |
| Facebook | developers.facebook.com → your app → Facebook Login → Settings | `https://getchrgd.co.uk/api/auth/facebook/callback`; also update **App Domains** and the Site URL |
| X / Twitter | developer.x.com → your project → User authentication settings | `https://getchrgd.co.uk/api/auth/twitter/callback`, plus Website URL |
| Apple | developer.apple.com → Identifiers → your **Services ID** → Configure | Domain `getchrgd.co.uk`, return URL `https://getchrgd.co.uk/api/auth/apple/callback` |

Only the providers you have credentials set for actually appear on `/myhub`, so
you only need to do the ones you use.

**Everyone gets signed out.** Session cookies are scoped to the host that set
them, so a cookie set on `quiz.getchrgd.co.uk` is not sent to `getchrgd.co.uk`.
Every customer signs in again, and so do you — the Founders Hub password prompt
will reappear at `/founderhub`. Nothing is lost; accounts and subscriptions are
in the database, keyed by account, not by cookie.

---

## 6. Email

If `NOTIFY_SOURCE` is `resend` or `auto`, member emails are sent through Resend
and their links are built from `APP_URL` — so they follow automatically. Two
things to check:

- **The sending domain is verified in Resend.** `NOTIFY_FROM` should be on a
  domain you have verified there (SPF + DKIM records, added in Cloudflare DNS).
  If you were sending from `chrgd.co.uk` and are consolidating on
  `getchrgd.co.uk`, verify the new domain and add its DNS records before
  switching `NOTIFY_FROM`, or your mail starts landing in spam.
- **A DMARC record**, if the zone has none: `_dmarc.getchrgd.co.uk` TXT
  `v=DMARC1; p=none; rua=mailto:you@getchrgd.co.uk`. Start at `p=none`.

---

## 7. Everything else worth ten minutes

- **Google Search Console.** Add `getchrgd.co.uk` as a property and submit
  `https://getchrgd.co.uk/sitemap.xml`. If `quiz.getchrgd.co.uk` is a verified
  property, use **Settings → Change of address** to hand its ranking over —
  that only works because the host redirect in §3 is a 301.
- **`robots.txt`** now allows the quiz, shop and bundles and disallows `/myhub`,
  `/founderhub`, `/order/` and `/api/`. It is generated from
  `src/app/robots.ts`; check `https://getchrgd.co.uk/robots.txt` after deploy.
- **Analytics.** Any property configured with the old hostname, and any
  goal/conversion URL containing `/hub` or `/portal`, needs updating.
- **Ad and social accounts.** Meta/TikTok pixel domain verification is
  per-domain: verify `getchrgd.co.uk` or your ads lose conversion tracking. Same
  for the link in bio, the Instagram profile, and any QR code artwork — a
  printed QR pointing at the old host still works through the redirect, but only
  for as long as you keep that redirect alive. Keep it alive.
- **PowerBody**, if you gave them a callback or whitelisted an origin.
- **Your own bookmarks.** `/founderhub` is the one you will type daily.

---

## 8. Verify, in this order

```bash
curl -sI https://getchrgd.co.uk/                     # 200
curl -sI https://www.getchrgd.co.uk/                 # 308 → https://getchrgd.co.uk/
curl -sI https://quiz.getchrgd.co.uk/shop            # 301/308 → https://getchrgd.co.uk/shop
curl -sI https://getchrgd.co.uk/hub                  # 307 → /myhub
curl -sI https://getchrgd.co.uk/portal/pricing       # 307 → /founderhub/pricing
curl -s  https://getchrgd.co.uk/api/config           # "paymentsLive": true
curl -s  https://getchrgd.co.uk/robots.txt           # names getchrgd.co.uk
```

Then, in a browser:

1. `/` runs the quiz, `/shop` lists products.
2. `/founderhub` asks for the founder password and lets you in.
3. `/myhub` asks you to sign in; social buttons complete without a
   `redirect_uri_mismatch`.
4. A test checkout returns to `https://getchrgd.co.uk/order/confirmation?...`
   and the Stripe webhook shows `200`.
5. "Manage your card" in `/myhub` opens Stripe's portal and returns to
   `https://getchrgd.co.uk/myhub`.

Step 4 is the one that matters. Everything else being wrong costs you a visitor;
that being wrong costs you a customer who has already paid.
