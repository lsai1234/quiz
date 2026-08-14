# Emails — the setup guide

Plain English, in the order you should do it. Follow it top to bottom.

**Time:** about 30 minutes, plus up to an hour of waiting in Step 3 that you can
walk away from.

**You'll need to be logged in to:** Cloudflare, Vercel, and a new Resend account.

---

## What you're setting up

Two kinds of email, treated differently on purpose.

**Receipts send themselves.** The moment someone pays — for a one-off order or a
subscription — the confirmation goes out. Nobody presses anything. It lands in
the log so you can see it happened.

**Everything else waits for you.** A product swapped on someone's plan, a price
rise, a plan ending, a failed payment. These appear in Founders Hub → Emails with
a **Send** button, and go out when you press it.

Why the split: a receipt has no judgement in it and is expected within seconds of
paying — a person in the loop can only make it late, and a confirmation that
turns up the next morning reads like a shop that lost the order. Everything else
says something *you decided*. Those are occasionally wrong, they're worth reading
before several hundred people read them, and nobody is waiting on them by the
second.

You can change this later with one setting. Step 6 covers it.

### The addresses

Once set up, emails come from three separate addresses:

| Address | What it sends |
|---|---|
| `orderconfirmation.noreply@getchrgd.co.uk` | Order receipts |
| `subscriptions.noreply@getchrgd.co.uk` | Plan confirmations, changes to a plan, plans ending |
| `billing.noreply@getchrgd.co.uk` | Payments, price changes, terms |

Three rather than one because Gmail and Outlook score reputation **per address**.
A price-rise notice occasionally gets marked as spam; an order receipt almost
never does. If both came from `hello@`, one bad week for the first would start
putting the second in people's junk folders — including receipts for money
they've already spent.

They're `noreply` because nobody watches those inboxes. But all three set
**Reply-To: contact@getchrgd.co.uk**, so anyone who hits reply lands in your
Google Workspace inbox as normal. That matters: a noreply with no reply path
means a customer with a question has nowhere to ask it, and mail providers treat
it as a spam signal too.

---

## Step 1 — Make a Resend account

Resend is the company that physically sends the emails. Free up to 3,000 a month,
which is a long way past where you are.

1. Go to **resend.com** and sign up.
2. That's it for now. Don't create an API key yet — Step 4.

> **Why not just send from Google Workspace?** Workspace is built for a person
> typing an email, not a server sending thousands. Google rate-limits it hard and
> it makes deliverability problems very difficult to diagnose. Your `contact@`
> inbox stays exactly as it is — this is only for the automatic ones.

---

## Step 2 — Add your domain to Resend

1. In Resend, go to **Domains** → **Add Domain**.
2. Type `getchrgd.co.uk` and add it.
3. Resend shows you a list of **DNS records** — usually three or four rows, each
   with a Type (TXT, CNAME or MX), a Name, and a Value.

Leave this page open. You need it for the next step.

**What these are, in plain English:** they're how you prove to Gmail that you own
getchrgd.co.uk and that Resend is allowed to send on your behalf. Without them,
mail from your domain looks exactly like somebody forging your domain — because
technically it is indistinguishable.

---

## Step 3 — Add those records in Cloudflare

1. Log in to Cloudflare and click **getchrgd.co.uk**.
2. Go to **DNS** → **Records**.
3. For each row Resend showed you, click **Add record** and copy it across
   exactly. Type, Name, Value — character for character. Paste, don't retype.

   > **Important:** for any **CNAME** record, click the orange cloud so it turns
   > **grey** (DNS only). Cloudflare proxying breaks mail records. If you leave it
   > orange, your emails will not send and the error will not tell you why.

4. While you're here, add one more record of your own. This one is called DMARC
   and it tells Gmail what to do about anyone forging your domain:

   | Field | Value |
   |---|---|
   | Type | `TXT` |
   | Name | `_dmarc` |
   | Content | `v=DMARC1; p=none; rua=mailto:contact@getchrgd.co.uk` |

   `p=none` means "don't block anything yet, just tell me what's happening". It
   cannot break your email. It starts the reports that let you tighten it later.

5. Go back to Resend and wait for the domain to say **Verified**. Usually a few
   minutes; occasionally up to an hour. Make a cup of tea.

**Do not skip the wait.** Sending from an unverified domain doesn't mean "lands
in spam" — it means Resend rejects it outright and nothing goes anywhere.

---

## Step 4 — Get your API key

1. In Resend, go to **API Keys** → **Create API Key**.
2. Name it something like `getchrgd-production`. Permission: **Sending access**.
3. Copy the key. It starts `re_`.

**It is shown once.** Paste it straight into the next step — if you lose it, you
just make another one, but you can't look this one up again.

---

## Step 5 — Put the settings into Vercel

1. Go to your project in Vercel → **Settings** → **Environment Variables**.
2. Add each of these. Set them for **Production** (and Preview, if you want your
   test deploys emailing too — most people don't).

   | Name | Value |
   |---|---|
   | `NOTIFY_SOURCE` | `resend` |
   | `RESEND_API_KEY` | the `re_...` key from Step 4 |
   | `NOTIFY_DOMAIN` | `getchrgd.co.uk` |
   | `NOTIFY_REPLY_TO` | `contact@getchrgd.co.uk` |
   | `APP_URL` | `https://getchrgd.co.uk` |

3. **Redeploy.** Environment variables only take effect on a new deployment —
   Deployments → the latest one → the `···` menu → **Redeploy**.

> **`APP_URL` matters more than it looks.** Every link in every email is built
> from it — the hub link, the shop link, the unsubscribe link. Get it wrong and
> you email customers links to `localhost` that go nowhere.

### While you're in there

If these four aren't set yet, set them now. They're printed in the footer of
every email, and company law requires them on business email. Until they're
filled in, every customer sees `[Registered company name]` at the bottom of
their receipt.

| Name | Value |
|---|---|
| `NEXT_PUBLIC_LEGAL_NAME` | your registered company name |
| `NEXT_PUBLIC_COMPANY_NUMBER` | your Companies House number |
| `NEXT_PUBLIC_REGISTERED_ADDRESS` | your registered address |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | `contact@getchrgd.co.uk` |

---

## Step 6 — Check it, before a customer does

1. Open **getchrgd.co.uk/founderhub** → **Emails**.

2. Look at the **Sending addresses** panel at the top. All three should read
   `…@getchrgd.co.uk`. If they say `hello@chrgd.dev`, `NOTIFY_DOMAIN` didn't
   take — check the spelling in Vercel and that you redeployed.

3. Under it, in green: *"Order and subscription receipts send automatically.
   Everything else waits for you."* That's the setting live. If it says nothing
   is sending automatically, `RESEND_API_KEY` didn't take.

4. **Send yourself a real one.** Open any email in the list (or any row in the
   **Log**), press **Send me a copy**, and put in your own address. It sends the
   exact message a customer gets, from the real address — and changes nothing
   about the original.

   Check it in **Gmail**, on your **phone**, and in **Outlook** if you can. You're
   looking for: it arrives in the inbox and not junk; the layout holds together;
   the receipt looks like the one on the website; hitting reply addresses to
   `contact@getchrgd.co.uk`.

5. **Then place a real order on your own site** with your own card, and watch the
   receipt arrive by itself. Refund yourself afterwards from the Founders Hub.
   This is the only test that proves the whole chain.

### If you want to change what's automatic

Add `NOTIFY_AUTO_SEND` in Vercel and redeploy:

| Value | Effect |
|---|---|
| *(not set)* | Receipts automatic, everything else waits. **This is what you asked for.** |
| `all` | Everything sends by itself. |
| `none` | Everything waits, even receipts. A kill switch if something goes wrong. |

---

## Using it day to day

**Founders Hub → Emails** has two tabs.

**To send** is your to-do list, and it should reach zero. Receipts won't appear
here — they've already gone. What appears is the emails about decisions: a
product swapped, a price rise, a plan settled. Read each one, press **Send**.
If you'd rather send it yourself with a personal note, the copy buttons are still
there; send it from Gmail, then press **Mark as sent** so it leaves the list.

A receipt only ever shows up here if it *failed*, with the reason on the row. It
retries by itself for a few days; if it's still there after that, something needs
looking at.

**Log** is every email ever, newest first. Search by recipient, filter by kind.
Click any row to see exactly what the customer got — both the designed version
and the plain-text one — with which address it came from and whether it was
delivered.

It keeps two distinctions and never blurs them:

- **"delivered" vs "sent by hand".** A provider confirming delivery and a person
  saying they sent it are different claims.
- **Queued vs sent.** Nothing quietly disappears. A failure stays visible with
  its reason and can be put back in the queue.

This is the page to open when someone says they were never told about something.

---

## The marketing bit

Every email carries a short promotional block above the footer — three lines and
a button. Subscribers get one about getting more from their plan; everyone else
gets one about the quiz.

Emails about a *problem* don't carry it: a declined card, a failed settlement,
someone packing a box to send back. Selling to someone mid-problem is how a
fixable situation turns into a complaint.

**Every one of them carries an opt-out link, and that's not optional.** Under UK
law (PECR reg. 22) you may market to an existing customer about similar products
*provided every message gives them a simple way to refuse*. The code enforces
this: if there's no opt-out link, the promotional block doesn't render at all.

Someone who opts out stops getting the promotional block and nothing else. Their
receipts, price-change notices and payment emails carry on — those are the record
of what they bought, not marketing, and the opt-out page says so plainly.

---

## When something goes wrong

**Everything's queuing and there's no Send button.** No provider. Check
`RESEND_API_KEY` is set on **Production** in Vercel, not just locally, and that
you redeployed afterwards.

**A row says "Failed to send" with a Resend error.** The reason is printed on the
row, word for word. Nine times out of ten it's the domain not verified yet, or a
CNAME still on the orange cloud in Cloudflare.

**Emails arrive but links point at localhost.** `APP_URL` isn't set on that
environment.

**The footer says `[Registered company name]`.** The four legal settings at the
end of Step 5 aren't filled in.

**Emails land in spam.** Check in this order: domain **Verified** in Resend; DMARC
record present; CNAMEs on grey cloud not orange. If all three are right, it's
usually just age — a brand-new sending domain has no reputation, and it settles
over a week or two of real mail.

**A customer says they got two receipts.** They didn't. Every confirmation is
deduplicated on the order or subscription id by a uniqueness constraint in the
database, so a repeated payment webhook physically cannot produce a second one.
Search the log for their address to show them what actually went.

**Something's going out wrong and you need it to stop now.** Set
`NOTIFY_AUTO_SEND=none` in Vercel and redeploy. Emails keep queuing — nothing is
lost — but nothing leaves until you take it off again.

---

## Every setting, in one place

| Variable | What it does |
|---|---|
| `NOTIFY_SOURCE` | `manual` · `resend` · `auto`. Who does the sending. |
| `RESEND_API_KEY` | From Resend. Needed for `resend` and `auto`. |
| `NOTIFY_AUTO_SEND` | Blank (receipts only) · `all` · `none`. What goes without you. |
| `NOTIFY_DOMAIN` | Verified sending domain. Creates the three noreply addresses. |
| `NOTIFY_REPLY_TO` | Where replies land. Falls back to `NEXT_PUBLIC_SUPPORT_EMAIL`, then `contact@NOTIFY_DOMAIN`. |
| `NOTIFY_FROM_ORDERS` | Override one address, full form: `Name <a@b.uk>`. |
| `NOTIFY_FROM_SUBSCRIPTIONS` | As above. |
| `NOTIFY_FROM_BILLING` | As above. |
| `NOTIFY_FROM` | One address for everything. Used when `NOTIFY_DOMAIN` is blank. |
| `APP_URL` | Public origin. Every link in every email is built from it. |
| `RESEND_API_URL` | Point the sender at a stub or a self-hosted relay. Leave blank. |
| `NEXT_PUBLIC_LEGAL_NAME` and the three below it | Printed in the footer of every email. |

---

## What each email is, and where it comes from

| When | Email | Sends itself? | From |
|---|---|---|---|
| A one-off order is paid | Order confirmation + receipt | **Yes** | `orderconfirmation.noreply@` |
| Someone starts a subscription | Plan confirmation + receipt + hub link | **Yes** | `subscriptions.noreply@` |
| We swap a product on a plan | What changed, and the new monthly | No | `subscriptions.noreply@` |
| We take a product off a plan | What came off, and the new monthly | No | `subscriptions.noreply@` |
| A plan ends | Exit receipt: sent, paid, settled | No | `subscriptions.noreply@` |
| Cancelled inside 14 days, returning | Where to post it, what comes back | No | `subscriptions.noreply@` |
| A free exit is scheduled | When it ends, and that nothing changes till then | No | `subscriptions.noreply@` |
| A supplier price rise is passed on | New price, date, and the free way out | No | `billing.noreply@` |
| A card is declined | That Stripe is retrying, and how to fix it | No | `billing.noreply@` |
| A settlement invoice fails | That the cancellation went through, and how to pay | No | `billing.noreply@` |
| The terms change materially | What changed, from when | No | `billing.noreply@` |
