# Turning on "Continue with Google" (and the rest) — the step-by-step guide

Plain English. Each provider is independent: do Google today, Microsoft next
month, skip the ones you don't want. Nothing here breaks anything if you stop
halfway.

**What you get.** A row of sign-in buttons in the two places a customer needs an
account: the box that appears when they subscribe (at the payment step) and the
login screen at **getchrgd.co.uk/myhub**. Both places show the same buttons
automatically — you never touch the code.

**The golden rule:** a button only appears once *both* of its settings are saved
in Vercel and the site has been redeployed. Nothing appears by accident, and a
half-finished provider shows nothing at all.

---

## Before you start

Three things that apply to every single provider. Read these once and the rest
of the guide is copy-paste.

### 1. The "callback URL"

Every provider asks where to send the customer back to after they log in. It's
always the same shape:

```
https://getchrgd.co.uk/api/auth/PROVIDER/callback
```

…with `PROVIDER` swapped for the lowercase name. So Google's is
`https://getchrgd.co.uk/api/auth/google/callback`, Microsoft's is
`https://getchrgd.co.uk/api/auth/microsoft/callback`, and so on. Each section
below spells its own out so you can copy it.

It has to match **character for character**. `https` not `http`, no trailing
slash, no `www.`. This is the single most common thing to get wrong.

### 2. `APP_URL` must be set in Vercel

The site builds those callback URLs from a setting called `APP_URL`. If it's
missing, the site guesses from whatever address the visitor came in on — which
on a Vercel preview build is a long random URL no provider will accept.

Check it now: **Vercel → your project → Settings → Environment Variables**.
There should be a row `APP_URL` with the value `https://getchrgd.co.uk`. If it
isn't there, add it (the next section shows how). It only needs to exist for
**Production**.

### 3. The Vercel routine (you'll do this after every provider)

Every provider below ends with two values to save. Here's how, once:

1. Go to **vercel.com**, open your project.
2. **Settings** → **Environment Variables** in the left sidebar.
3. Click **Add New**.
4. **Key** = the name in CAPITALS from the provider's section (e.g. `GOOGLE_CLIENT_ID`).
5. **Value** = paste what you copied from the provider.
6. **Environments** — tick **Production**. (Leave Preview and Development
   unticked unless you've also registered those addresses with the provider,
   which you almost certainly haven't.)
7. **Save**. Repeat for the second value.
8. **Redeploy.** Go to **Deployments**, find the newest one, click the **⋯**
   menu on its right, choose **Redeploy**, confirm.

> ⚠️ **The redeploy is not optional.** Vercel only hands these settings to the
> site when it builds. Save them and walk away and the button will not appear,
> and you'll think you did it wrong. You didn't — it just needs a redeploy.

**Never** put any of these values in a setting whose name starts with
`NEXT_PUBLIC_`. That prefix publishes it to every visitor's browser. The
"secret" half is exactly what someone would need to sign in as your customers.

---

## Which ones to bother with

| Provider | Cost | Effort | Worth it? |
|---|---|---|---|
| **Google** | Free | 10 min | **Do this one first.** Most customers have one. |
| **Microsoft** | Free | 10 min | Yes — Outlook/Hotmail is very common in the UK. |
| **Facebook** | Free | 20 min + review | Popular, but needs Facebook's approval before the public can use it. |
| **Amazon** | Free | 10 min | Nice fit — it's a shopping account. |
| **Discord** | Free | 5 min | Easiest of the lot. Worth it if your audience skews young. |
| **LinkedIn** | Free | 15 min | Only if your customers are corporate. Needs a company page. |
| **GitHub** | Free | 5 min | Only if you're selling to developers. Probably skip. |
| **X (Twitter)** | Free tier | 15 min | Works, but gives us **no email address** — see the warning in its section. |
| **Apple** | **£79/yr** | 30 min | The only one that costs money. Skip unless you want the Apple button. |

You do not need all of them. Three or four is plenty — the buttons past the
third fold away behind "More ways to sign in" anyway.

---

## Google — 10 minutes, free

1. Go to **console.cloud.google.com** and sign in.
2. Top-left, click the project dropdown → **New Project**. Name it `getCHRGD`
   → **Create**. Wait a few seconds, then make sure it's selected in that
   dropdown.
3. Left sidebar → **APIs & Services** → **OAuth consent screen**.
4. Choose **External** → **Create**.
5. Fill in: **App name** = `getCHRGD`, **User support email** = your email,
   **Developer contact** = your email. Save and continue through the remaining
   screens — you don't need to add any scopes or test users.
6. Back on the OAuth consent screen page, click **Publish app** and confirm.
   *(Skip this and only email addresses you've added by hand can sign in.)*
7. Left sidebar → **Credentials** → **+ Create Credentials** → **OAuth client ID**.
8. **Application type** = **Web application**. Name it anything.
9. Under **Authorised redirect URIs** click **+ Add URI** and paste:
   ```
   https://getchrgd.co.uk/api/auth/google/callback
   ```
10. **Create**. A box pops up with two values.

Save into Vercel (see *The Vercel routine* above):

| Vercel Key | What to paste |
|---|---|
| `GOOGLE_CLIENT_ID` | **Client ID** (a long string ending in `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | **Client secret** |

---

## Microsoft — 10 minutes, free

Covers Outlook, Hotmail, Live and work accounts.

1. Go to **portal.azure.com** and sign in with any Microsoft account.
2. Search **Microsoft Entra ID** in the top bar and open it.
3. Left sidebar → **App registrations** → **+ New registration**.
4. **Name** = `getCHRGD`.
5. **Supported account types** — pick the option that mentions **"any
   organizational directory ... and personal Microsoft accounts"**. This matters:
   the other options lock out ordinary Outlook and Hotmail users.
6. **Redirect URI** — choose **Web** in the dropdown, then paste:
   ```
   https://getchrgd.co.uk/api/auth/microsoft/callback
   ```
7. **Register**.
8. On the overview page, copy **Application (client) ID**.
9. Left sidebar → **Certificates & secrets** → **Client secrets** tab → **+ New
   client secret**. Description `getCHRGD`, expiry **24 months** (the maximum).
   **Add**.
10. Copy the **Value** column — *not* the "Secret ID" column. It's only shown
    once; leave the page and it's gone for good and you make a new one.

| Vercel Key | What to paste |
|---|---|
| `MICROSOFT_CLIENT_ID` | **Application (client) ID** |
| `MICROSOFT_CLIENT_SECRET` | The secret's **Value** |

> 📅 **Put a reminder in your calendar** for a month before that 24-month
> expiry. When a Microsoft secret expires the button stops working with no
> warning. It's the only provider here with an expiry date.

---

## Facebook — 20 minutes, free, plus a review wait

1. Go to **developers.facebook.com** → **My Apps** → **Create App**.
2. Pick the use case about **authenticating users / Facebook Login**, then
   **Consumer** if it asks for a type. Name it `getCHRGD`.
3. In the app dashboard, find **Facebook Login** and click **Set up**, then
   **Settings** underneath it.
4. In **Valid OAuth Redirect URIs**, paste:
   ```
   https://getchrgd.co.uk/api/auth/facebook/callback
   ```
   **Save changes**.
5. Left sidebar → **App settings** → **Basic**. Copy the **App ID**, then click
   **Show** next to **App secret** and copy that.

| Vercel Key | What to paste |
|---|---|
| `FACEBOOK_CLIENT_ID` | **App ID** |
| `FACEBOOK_CLIENT_SECRET` | **App secret** |

> ⚠️ **The bit that catches people out.** A new Facebook app is in *development
> mode*: only you and people you add as testers can use the button. Everyone
> else gets an error. To go public you must switch the app to **Live** at the
> top of the dashboard, and request **Advanced access** for the `email`
> permission under **App Review** → **Permissions and Features**. Facebook will
> ask for a privacy policy URL and often a screen recording of the login. Budget
> a few days. Until that's approved, leave Facebook switched off.

---

## Amazon — 10 minutes, free

1. Go to **developer.amazon.com** and sign in with your normal Amazon account.
2. Top menu → **Login with Amazon** (it's under *Apps & Services*).
3. **Create a New Security Profile**.
4. Fill in: **Name** = `getCHRGD` (customers see this), **Description** = one
   line, **Consent Privacy Notice URL** = `https://getchrgd.co.uk/legal/terms`.
   **Save**.
5. In the list of security profiles, find yours, click the **gear/manage** icon
   → **Web Settings**, then **Edit**.
6. **Allowed Origins**: `https://getchrgd.co.uk`
7. **Allowed Return URLs**:
   ```
   https://getchrgd.co.uk/api/auth/amazon/callback
   ```
   **Save**.
8. On that same Web Settings page, copy the **Client ID**, then **Show Secret**
   and copy the **Client Secret**.

| Vercel Key | What to paste |
|---|---|
| `AMAZON_CLIENT_ID` | **Client ID** |
| `AMAZON_CLIENT_SECRET` | **Client Secret** |

---

## Discord — 5 minutes, free

The quickest one here. No review, no waiting.

1. Go to **discord.com/developers/applications** → **New Application**. Name it
   `getCHRGD` → **Create**.
2. Left sidebar → **OAuth2**.
3. Under **Redirects**, click **Add Redirect** and paste:
   ```
   https://getchrgd.co.uk/api/auth/discord/callback
   ```
   **Save Changes** (the bar appears at the bottom).
4. On that same page, copy the **Client ID**. For the secret, click **Reset
   Secret** → confirm → copy it. It's shown once.

| Vercel Key | What to paste |
|---|---|
| `DISCORD_CLIENT_ID` | **Client ID** |
| `DISCORD_CLIENT_SECRET` | **Client Secret** |

---

## LinkedIn — 15 minutes, free

Needs a LinkedIn **company page** — if getCHRGD doesn't have one, create it
first at linkedin.com/company/setup/new (it's free and takes 5 minutes).

1. Go to **linkedin.com/developers/apps** → **Create app**.
2. **App name** = `getCHRGD`, **LinkedIn Page** = your company page, upload a
   logo, tick the legal box → **Create app**.
3. **Products** tab → find **Sign In with LinkedIn using OpenID Connect** →
   **Request access**. It's usually granted immediately.
4. **Auth** tab → **OAuth 2.0 settings** → edit **Authorized redirect URLs for
   your app** → add:
   ```
   https://getchrgd.co.uk/api/auth/linkedin/callback
   ```
   **Update**.
5. On the same **Auth** tab, copy the **Client ID** and the **Primary Client
   Secret**.

| Vercel Key | What to paste |
|---|---|
| `LINKEDIN_CLIENT_ID` | **Client ID** |
| `LINKEDIN_CLIENT_SECRET` | **Primary Client Secret** |

---

## GitHub — 5 minutes, free

Only worth it if you sell to developers.

1. Go to **github.com/settings/developers** → **OAuth Apps** → **New OAuth App**.
2. **Application name** = `getCHRGD`.
3. **Homepage URL** = `https://getchrgd.co.uk`
4. **Authorization callback URL**:
   ```
   https://getchrgd.co.uk/api/auth/github/callback
   ```
5. **Register application**.
6. Copy the **Client ID**. Then **Generate a new client secret** and copy that —
   shown once.

| Vercel Key | What to paste |
|---|---|
| `GITHUB_CLIENT_ID` | **Client ID** |
| `GITHUB_CLIENT_SECRET` | **Client secret** |

---

## X (Twitter) — 15 minutes, free tier

1. Go to **developer.x.com** and sign up for the **Free** tier if you haven't.
2. In the developer portal, create a **Project**, then an **App** inside it.
3. Open the app → **User authentication settings** → **Set up**.
4. **App permissions** = Read. **Type of App** = **Web App, Automated App or
   Bot** (this is the "confidential client" option — it's the one that works).
5. **Callback URI / Redirect URL**:
   ```
   https://getchrgd.co.uk/api/auth/twitter/callback
   ```
   **Website URL** = `https://getchrgd.co.uk`. **Save**.
6. Copy the **OAuth 2.0 Client ID** and **Client Secret** it shows you.

| Vercel Key | What to paste |
|---|---|
| `TWITTER_CLIENT_ID` | **OAuth 2.0 Client ID** |
| `TWITTER_CLIENT_SECRET` | **Client Secret** |

> ⚠️ **X doesn't give us an email address.** Everyone else on this list does.
> That means an X-only customer has no email on their account: we can't tie it
> to a Google account they already had, they can't reset anything by email, and
> your order emails have nowhere to go. Consider leaving this one off.

---

## Apple — 30 minutes, £79/year

The only one that isn't free, and the only one that won't work on a test
machine — Apple refuses anything that isn't a real `https` domain.

1. Join the **Apple Developer Program** at developer.apple.com (£79/year).
2. **Certificates, Identifiers & Profiles** → **Identifiers** → **+** → **App
   IDs** → **App**. Give it a description and a Bundle ID like
   `uk.co.getchrgd.web`. Tick **Sign in with Apple**. **Continue** → **Register**.
3. **Identifiers** → **+** again → this time **Services IDs**. Description
   `getCHRGD Web`, Identifier `uk.co.getchrgd.signin`. **Register**.
4. Open that Services ID → tick **Sign in with Apple** → **Configure**:
   - **Primary App ID** = the App ID from step 2
   - **Domains and Subdomains** = `getchrgd.co.uk`
   - **Return URLs** = `https://getchrgd.co.uk/api/auth/apple/callback`

   **Next** → **Done** → **Continue** → **Save**.
5. **Keys** → **+** → name it, tick **Sign in with Apple**, **Configure** →
   pick your App ID → **Save** → **Continue** → **Register**.
6. **Download** the key file (ends in `.p8`). **You get one download, ever.**
   Note the **Key ID** shown on that page.
7. Your **Team ID** is the 10-character code at the top right of the developer
   portal, next to your name.

| Vercel Key | What to paste |
|---|---|
| `APPLE_CLIENT_ID` | The **Services ID** from step 3 (e.g. `uk.co.getchrgd.signin`) — *not* the App ID |
| `APPLE_TEAM_ID` | The 10-character Team ID |
| `APPLE_KEY_ID` | The Key ID from step 6 |
| `APPLE_PRIVATE_KEY` | The **entire contents** of the `.p8` file — open it in a text editor, select all, copy. Include the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |

---

## Checking it worked

After the redeploy:

1. Open **getchrgd.co.uk/myhub** in a private/incognito window.
2. The new button should be under the Sign in button. If you've set up more than
   four providers, the extras hide behind **"More ways to sign in"** — click it.
3. Click the button. You should land on that provider's own login page with
   *getCHRGD* named on it.
4. Sign in. You should come back to the hub, logged in.
5. Then test the one that actually matters: go through the quiz to the
   subscribe step and check the same buttons appear in the account box before
   payment.

---

## When it goes wrong

| What you see | What it means | Fix |
|---|---|---|
| The button never appears | One of the two settings is missing, or you haven't redeployed | Check both rows exist in Vercel with **Production** ticked, then redeploy |
| "redirect_uri_mismatch" / "The redirect URI does not match" | The callback URL in the provider's console doesn't exactly match | Compare character by character: `https`, no trailing slash, no `www.`, correct provider name in the path |
| "invalid_client" / "unauthorized_client" | The secret is wrong or was copied from the wrong field | Microsoft: you probably copied *Secret ID* instead of *Value*. Others: generate a fresh secret and re-paste |
| Facebook: "App not active" or an error only for other people | The app is still in development mode | Switch it to **Live** and get `email` approved in App Review |
| You come back to the hub with *"That … sign-in didn't complete"* | The provider refused or the round-trip broke | The message names the provider. Nine times in ten it's the callback URL |
| It works for you but not for customers | Facebook development mode, or Google's consent screen still unpublished | Publish the Google consent screen; take the Facebook app Live |

---

## Housekeeping

- **Secrets are secrets.** Anyone with one can impersonate your site to that
  provider. Don't paste them into email or chat. If one leaks, generate a new
  one in the provider's console and update Vercel — old ones stop working the
  moment you replace them.
- **Removing a provider** is the reverse: delete its two rows in Vercel and
  redeploy. The button disappears. Customers who signed up that way keep their
  account and can still get in with the email address on it.
- **Testing on your own machine** works the same way, with the values in a file
  called `.env.local` and `http://localhost:3000/...` as the callback URL
  registered alongside the live one. Apple is the exception — it will not accept
  localhost at all.

For the technical version of all this — env var names, how accounts get linked,
what happens when a provider hands back an unverified email — see
`docs/BACKEND.md` under *Setting up social sign-in*.
