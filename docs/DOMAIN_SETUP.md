# Moving the site to getchrgd.co.uk — the step-by-step guide

Plain English, in the order you should do it. Follow it top to bottom and don't
skip ahead — a few of these steps only work if the one before them finished.

**Time:** about an hour, plus up to a few hours of waiting in Step 3 that you
can walk away from.

**You'll need to be logged in to:** Cloudflare, Vercel, Stripe, and (if you use
"Continue with Google" etc.) whichever sign-in providers you've set up.

---

## What's actually changing

Your site used to be at **quiz.getchrgd.co.uk**. It's moving to
**getchrgd.co.uk** — no "quiz." at the front. At the same time the two
password-protected areas got clearer names.

| Page | Old address | New address |
|---|---|---|
| The quiz | quiz.getchrgd.co.uk | **getchrgd.co.uk** |
| The shop | quiz.getchrgd.co.uk/shop | **getchrgd.co.uk/shop** |
| Where customers manage their subscription | .../hub | **getchrgd.co.uk/myhub** |
| Where you run the business | .../portal | **getchrgd.co.uk/founderhub** |

The old `/hub` and `/portal` addresses still work — anyone who goes there gets
bounced to the new one automatically. That's already built and deployed with the
code. You don't have to do anything about it.

**A word on jargon**, because the next few steps are full of it:

- **Domain** — your web address, `getchrgd.co.uk`.
- **DNS** — the internet's phone book. It turns "getchrgd.co.uk" into the actual
  computer that serves your site. Cloudflare is where you edit your entry.
- **Record** — one line in that phone book.
- **Vercel** — the company that actually runs your website. Your code lives on
  GitHub; Vercel takes it and puts it online.
- **Redirect** — automatic forwarding. Someone types the old address, they land
  on the new one.

---

## Step 1 — Tell Vercel about the new address

Do this one first. Vercel will hand you the exact information Step 2 needs.

1. Go to **vercel.com** and open your project.
2. Click **Settings** (top of the page), then **Domains** in the left sidebar.
3. In the box, type `getchrgd.co.uk` and click **Add**.
4. Vercel will now show you a warning triangle and some setup instructions. **This is normal.** It's telling you the address doesn't point at Vercel yet.
5. **Leave this page open.** It's showing you something you need to copy —
   either an **A record** with a number that looks like `76.76.21.21`, or a
   **CNAME** with a target ending in `.vercel-dns.com`.

> ⚠️ **Copy the value Vercel shows you.** Don't use a number you found in a blog
> post, or the example above. Vercel gives different projects different values,
> and the wrong one means your site simply doesn't load.

---

## Step 2 — Add that record in Cloudflare

1. Go to **dash.cloudflare.com** and log in.
2. Click **getchrgd.co.uk** in your list of sites.
3. In the left sidebar click **DNS**, then **Records**.
4. Click the blue **Add record** button.
5. Fill it in with what Vercel showed you in Step 1:
   - **Type**: `A` (or `CNAME`, if that's what Vercel asked for)
   - **Name**: type `@` — this is shorthand for "the address itself,
     getchrgd.co.uk with nothing in front of it"
   - **IPv4 address** (or **Target**): paste the value from Vercel
   - **Proxy status**: click the toggle so the cloud icon turns **grey** and says
     **DNS only**
   - **TTL**: leave as Auto
6. Click **Save**.

> ⚠️ **The grey cloud really matters.** Orange cloud means "send traffic through
> Cloudflare first". If you leave it orange, Vercel can never finish setting up
> the security padlock (the https bit), and your domain will sit stuck on
> "Invalid Configuration" forever with no obvious reason why. Grey cloud. Trust
> me on this one.
>
> Your site is already fast — Vercel has its own worldwide network — so you
> aren't losing anything by leaving it grey. You can turn it orange later if you
> ever specifically need Cloudflare's firewall, but read the "If you ever want
> the orange cloud" note at the bottom first.

**Also check:** if you see any existing record with the name `@` pointing
somewhere else, delete it. Two records fighting over the same name is a
guaranteed outage.

---

## Step 3 — Wait, then check

Go back to the Vercel Domains page from Step 1 and refresh it.

- Usually this works within a couple of minutes.
- Occasionally it takes a few hours. That's DNS being DNS. Make a coffee.
- You're waiting for the warning triangle to become a green tick and the words
  **Valid Configuration**.

Once it's green, open **https://getchrgd.co.uk** in your browser. You should see
your quiz, with a padlock in the address bar.

**If it's still not working after a few hours:** go back to Step 2 and check the
proxy is grey, the Name is exactly `@`, and the value matches Vercel character
for character.

---

## Step 4 — Add the "www" version

Some people type `www.` out of habit. Send them to the right place.

**In Cloudflare** (DNS → Records → Add record):

- **Type**: `CNAME`
- **Name**: `www`
- **Target**: the `.vercel-dns.com` address Vercel gave you
- **Proxy status**: **grey cloud / DNS only** again
- Save.

**In Vercel** (Settings → Domains):

1. Add `www.getchrgd.co.uk`.
2. Once it goes green, find it in the list and set it to **Redirect** →
   `getchrgd.co.uk`, status **308**.

Now `www.getchrgd.co.uk` forwards to `getchrgd.co.uk`. Pick one and stick with
it — having the same site live at two addresses splits your Google ranking
between them.

---

## Step 5 — Forward the old address

`quiz.getchrgd.co.uk` is in people's browser history, in any link you've posted,
and possibly on printed material. Don't delete it — forward it.

**In Vercel** (Settings → Domains):

1. `quiz.getchrgd.co.uk` should already be in the list. Leave its DNS record in
   Cloudflare exactly as it is.
2. Click the **⋯** next to it → **Edit** → set it to **Redirect** →
   `getchrgd.co.uk`, status **301** (permanent).

That's it. `quiz.getchrgd.co.uk/shop` will now land on `getchrgd.co.uk/shop` —
it keeps the rest of the address, not just the front part.

> **Why 301 here but 308 for www?** Both mean "permanent". Vercel offers
> whichever the dropdown offers — either is fine. What matters is that it's
> permanent, not temporary, because that's what tells Google to move your search
> ranking across to the new address.

**Keep this forward switched on permanently.** Not for a month — forever. It
costs nothing, and it's the only thing standing between an old QR code or an old
Instagram link and a dead end.

---

## Step 6 — Tell the app its own address ⚠️ most important step

The app needs to know what it's called. This single setting controls where
Stripe sends customers after they pay, where the "manage my card" button
returns them to, and every link inside every email you send.

1. In Vercel: **Settings** → **Environment Variables**.
2. Look for **`APP_URL`**.
   - If it exists, click **Edit**.
   - If it doesn't, click **Add**.
3. Set:
   - **Key**: `APP_URL`
   - **Value**: `https://getchrgd.co.uk`
   - **Environments**: tick **Production**
4. Save.

> ⚠️ Type it exactly: `https://` at the front, **no** slash at the end, `.co.uk`
> not `.com`.

5. **Now redeploy.** Go to **Deployments**, find the one at the top, click the
   **⋯** on the right, and choose **Redeploy**.

> ⚠️ **Do not skip the redeploy.** Vercel ignores new settings until you do.
> Everything will look fine, and then a real customer will pay you and get sent
> to a dead page. This is the single most likely way to break this move.

---

## Step 7 — Stripe

Stripe holds a few addresses of its own that won't update by themselves. Work
through these five.

Go to **dashboard.stripe.com**.

### 7a. The webhook (how Stripe tells your site someone paid)

1. **Developers** → **Webhooks**.
2. Click your existing endpoint (its address will contain `quiz.getchrgd.co.uk`).
3. Click **Update details** and change the URL to:
   `https://getchrgd.co.uk/api/webhooks/stripe`
4. Save.
5. **Now do it again in the other mode.** There's a **Test mode** toggle at the
   top of Stripe. Test and live are completely separate — changing one does not
   change the other.

> **Edit the existing endpoint, don't create a new one.** A new endpoint gets a
> new secret signing key, which you'd then have to copy into Vercel as
> `STRIPE_WEBHOOK_SECRET`. Editing avoids all that.

**Check it worked:** on the endpoint page click **Send test webhook**. You want
a green `200` response.

### 7b. Apple Pay and Google Pay ⚠️ silent failure

1. **Settings** → **Payments** → **Payment method domains**.
2. `quiz.getchrgd.co.uk` will be listed. Click **Add a new domain** and add
   `getchrgd.co.uk`. Verify it.

> ⚠️ This one gives you no error message. If you skip it, the Apple Pay and
> Google Pay buttons just quietly don't appear at checkout. Nothing looks broken
> — you simply lose the fastest way for someone on a phone to buy from you, and
> you'd probably never work out why sales dipped.

### 7c. The "manage my card" return link

1. **Settings** → **Billing** → **Customer portal**.
2. Find the default return link and set it to `https://getchrgd.co.uk/myhub`.

The app sends its own return address most of the time, so this is the backup —
but it's the one that gets used when a customer clicks through from an emailed
invoice.

### 7d. Your business details on receipts

1. **Settings** → **Business** → **Public details** (and **Branding**).
2. Anywhere it says `quiz.getchrgd.co.uk`, change it to `getchrgd.co.uk`. This
   appears on the checkout page and on every receipt.

### 7e. Your terms link

Still in Stripe's checkout settings — if you've linked your terms and
conditions, point it at `https://getchrgd.co.uk/legal/terms`.

---

## Step 8 — The "Continue with Google" buttons

Skip this entirely if you haven't set up social sign-in.

Every sign-in provider keeps a list of addresses it's willing to send people
back to. Your new address isn't on any of those lists yet.

> ⚠️ **What breaks if you skip this:** the customer taps "Continue with Google",
> types their password, and *then* hits an error page. They've done the work and
> got nothing. It's the worst possible place to fail.

Add the new address **without deleting the old one** — that way nothing breaks
mid-change. Remove the old one in a week.

| Provider | Where to go | What to add |
|---|---|---|
| **Google** | console.cloud.google.com → APIs & Services → Credentials → your OAuth client | Authorised redirect URI: `https://getchrgd.co.uk/api/auth/google/callback`<br>Authorised JavaScript origin: `https://getchrgd.co.uk` |
| **Facebook** | developers.facebook.com → your app → Facebook Login → Settings | Valid OAuth Redirect URI: `https://getchrgd.co.uk/api/auth/facebook/callback` (also update App Domains and Site URL) |
| **X / Twitter** | developer.x.com → your project → User authentication settings | Callback URI: `https://getchrgd.co.uk/api/auth/twitter/callback` (also Website URL) |
| **Apple** | developer.apple.com → Identifiers → your **Services ID** → Configure | Domain: `getchrgd.co.uk`<br>Return URL: `https://getchrgd.co.uk/api/auth/apple/callback` |

---

## Step 9 — Email

Skip if you're still writing your member emails by hand (`NOTIFY_SOURCE=manual`).

The links inside your emails follow `APP_URL`, so Step 6 already handled those.
The thing to check is who the email is *from*:

1. Log in to **Resend**.
2. Check the domain you send from is verified there (it'll have you add a
   couple of records in Cloudflare DNS — same Add record button as Step 2).
3. If you're changing the from-address to `@getchrgd.co.uk`, verify that domain
   **before** you switch, or your emails start landing in spam folders.

---

## Step 10 — Tell Google about the move

1. Go to **search.google.com/search-console**.
2. Add `getchrgd.co.uk` as a new property and verify it (usually one more
   Cloudflare DNS record).
3. Submit your sitemap: `https://getchrgd.co.uk/sitemap.xml`
4. If `quiz.getchrgd.co.uk` is already a verified property in there, open it and
   use **Settings** → **Change of address** to point it at the new one. This
   hands your existing search ranking over — and it only works because you made
   the forward in Step 5 permanent.

---

## Step 11 — Everywhere else your old link lives

Half an hour with a notepad. Go through:

- ☐ Instagram / TikTok bio links
- ☐ Facebook and Instagram **domain verification** (Meta Business Suite → Brand
  Safety → Domains). Not verifying the new domain means you lose conversion
  tracking on your ads.
- ☐ TikTok Ads, if you run any — same story.
- ☐ Google Analytics, and any goal or conversion that mentions `/hub` or
  `/portal`
- ☐ Email signatures
- ☐ Any printed material, packaging inserts or QR codes (these still work
  through the Step 5 forward — which is exactly why you keep it forever)
- ☐ Your own browser bookmarks. `getchrgd.co.uk/founderhub` is the one you'll
  use daily.
- ☐ PowerBody, if you ever gave them a web address

---

## When you're done — check these seven things

Open a browser and go through the list. Use a private/incognito window so you're
seeing it the way a customer does.

1. ☐ **getchrgd.co.uk** loads the quiz, with a padlock in the address bar
2. ☐ **getchrgd.co.uk/shop** shows your products
3. ☐ **quiz.getchrgd.co.uk/shop** bounces you to **getchrgd.co.uk/shop**
4. ☐ **getchrgd.co.uk/portal** bounces you to **/founderhub**, and your founder
   password lets you in
5. ☐ **getchrgd.co.uk/myhub** asks you to sign in — and if you use them, the
   Google/Apple/Facebook buttons complete without an error page
6. ☐ **Buy something with a Stripe test card.** You should land back on
   `getchrgd.co.uk/order/confirmation...`, and in Stripe the webhook should show
   a green `200`
7. ☐ In `/myhub`, click **manage your card**. Stripe's page opens, and the back
   link returns you to `getchrgd.co.uk/myhub`

**Number 6 is the one that matters.** Everything else being wrong costs you a
visitor. That being wrong costs you a customer who has already paid you.

---

## Things that will look broken but are completely normal

**Everyone is signed out — including you.** Sign-ins are remembered per web
address, and this is a new one as far as browsers are concerned. Every customer
signs in again, and the Founders Hub will ask for your password again. **Nothing
is lost.** All the accounts, subscriptions and orders are safe in the database.

**Google still shows the old address in search results** for a while. That's
normal and sorts itself out over a few weeks, faster once you've done Step 10.

**The old address still works.** That's the point — it's forwarding, not
broken.

---

## If something goes wrong

| What you see | What it usually means |
|---|---|
| Vercel stuck on "Invalid Configuration" | The Cloudflare proxy is orange. Turn it grey (Step 2). |
| Site loads but shows a security warning | The padlock hasn't finished setting up. Grey cloud, then wait — it can take up to an hour. |
| The page keeps reloading over and over | If you turned the proxy orange, go to Cloudflare **SSL/TLS** → **Overview** and set it to **Full (strict)**. Anything else causes exactly this. |
| Customers pay but nothing happens in your Founders Hub | The webhook is still pointing at the old address (Step 7a), or you didn't redeploy after Step 6. |
| "redirect_uri_mismatch" after signing in with Google | Step 8. The new address isn't on Google's list yet. |
| Apple Pay button has vanished from checkout | Step 7b. |
| Everything looks right but customers land on the wrong page after paying | You changed `APP_URL` but didn't redeploy. Go and redeploy. |

---

## If you ever want the orange cloud

You don't need it. But if you later want Cloudflare's caching or firewall in
front of your site, only turn the proxy on **after** Vercel shows a green tick
and the padlock works — and then:

- **SSL/TLS** → **Overview** → set to **Full (strict)**. Nothing less.
- Test a purchase immediately. Cloudflare's Bot Fight Mode can block Stripe's
  webhook, which silently breaks payments.
- Turn **Auto Minify** and **Rocket Loader** off. They rewrite your site's code
  in ways that break modern sites like this one.

Honestly: leave it grey. There's no upside here and several ways to lose money.

---

## For whoever works on the code

- `APP_URL` is read at request time, so Stripe return URLs, OAuth redirects and
  email links all follow it — no code change needed to move domains again.
- The old paths redirect in `next.config.ts` (307, deliberately temporary —
  those paths stay ours). The host-level redirect off `quiz.getchrgd.co.uk` is
  the opposite case and is a permanent 301, so ranking transfers.
- The API routes did **not** move: still `/api/hub/*` and `/api/portal/*`.
  Nobody types them, and renaming them would have invalidated the Stripe webhook
  endpoint and every OAuth redirect URI for nothing.
- `src/app/robots.ts` keeps `/myhub` and `/founderhub` out of search results.
  `src/app/sitemap.ts` defaults to `https://getchrgd.co.uk`; override with
  `NEXT_PUBLIC_SITE_URL` on preview deploys.
