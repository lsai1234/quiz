# Emails — what gets sent, from where, and how to switch it on

Plain English. Read the first section to understand what the system does; read
the second when you're ready to make it send for real.

---

## What the system sends

Every email is written by the code, stored in the database, and listed in
**Founders Hub → Emails**. Nothing is ever sent that you cannot see afterwards.

| When | Email | Comes from |
|---|---|---|
| A one-off order is paid for | Order confirmation, with the receipt | `orderconfirmation.noreply@` |
| Someone starts a subscription | Plan confirmation, with the receipt and a link to their hub | `subscriptions.noreply@` |
| We swap a product on someone's plan | What we swapped and what it does to their monthly | `subscriptions.noreply@` |
| We take a product off a plan | What came off and what it does to their monthly | `subscriptions.noreply@` |
| A plan ends | The exit receipt: what was sent, what was paid, what was settled | `subscriptions.noreply@` |
| Someone cancels inside 14 days and returns the box | Where to post it and what comes back | `subscriptions.noreply@` |
| Someone schedules a free exit | When it ends, and that nothing changes until then | `subscriptions.noreply@` |
| A supplier price rise is being passed on | The new price, the date, and the free way out | `billing.noreply@` |
| A card is declined | That Stripe is retrying, and how to update the card | `billing.noreply@` |
| A settlement invoice fails | That the cancellation went through, and how to pay | `billing.noreply@` |
| The terms change materially | What changed and from when | `billing.noreply@` |

### Why three addresses and not one

Mailbox providers score reputation **per sending address**. A price-rise notice
occasionally gets marked as spam; an order receipt almost never does. Sending
both from `hello@` means one bad week for the first drags the second into
people's junk folders — including receipts for money they have already spent.
Separate addresses keep those reputations separate.

It also gives customers something to filter on: "everything from
getCHRGD Orders" is a rule someone can actually write.

### Why `noreply`, and why replies still work

Nobody sits watching those three mailboxes, and pretending otherwise is worse
than saying so. But every one of them sets **Reply-To: contact@getchrgd.co.uk**,
so a customer who hits reply lands in the Google Workspace inbox you do read. A
`noreply` address with no reply path is both bad service and a spam signal;
this is the version that isn't.

### The marketing block

Every email carries a short promotional strip above the footer — three lines and
a button. Subscribers get one about using their plan; everyone else gets one
about the quiz. Emails about a problem (declined card, failed settlement, a box
being returned) carry none, because selling to someone mid-problem is how a
solvable situation becomes a complaint.

**The strip only renders when the email also carries a working opt-out link.**
That is enforced in code, not left to whoever writes the next template. Under
PECR reg. 22 we may market similar products to an existing customer only if
every message gives a simple way to refuse — so the refusal and the promotion
are wired together and cannot be separated.

Opting out stops the strip and nothing else. Receipts, price-change notices and
payment emails keep going, because they are the record of what someone bought.
The opt-out page says so in as many words.

---

## Switching it on

There are three rungs. Climb them as the volume justifies it — the emails and
the Founders Hub page are identical at every rung, only who presses send changes.

### Rung 1 — manual (where you are now)

`NOTIFY_SOURCE=manual`. No API key, no DNS, nothing to set up. Every email is
written and waits in Founders Hub → Emails. You copy the address, subject and
body into Gmail, send it, and press **Mark as sent**.

Perfectly workable at a few emails a week, and every promise the system makes to
a customer still holds.

### Rung 2 — one click per email

You get a **Send email** button on every row.

1. **Sign up to [Resend](https://resend.com)** — free up to 3,000 emails a month.
2. **Add `getchrgd.co.uk` as a domain** in Resend. It gives you three or four DNS
   records (SPF, DKIM, and usually a return-path CNAME).
3. **Add those records in Cloudflare**, exactly as Resend prints them. Turn the
   orange cloud OFF for any CNAME it gives you — proxying breaks mail records.
4. **Wait for Resend to say "Verified"**. Usually minutes, occasionally an hour.
   Do not skip this: sending from an unverified domain is not "lands in spam", it
   is rejected outright.
5. **Add a DMARC record** while you are there. Start on the gentlest setting:
   name `_dmarc`, type TXT, value `v=DMARC1; p=none; rua=mailto:contact@getchrgd.co.uk`.
   It changes nothing about delivery and starts the reports that tell you if
   anyone is forging your domain.
6. **Set these in Vercel** (Project → Settings → Environment Variables):

   ```
   NOTIFY_SOURCE=resend
   RESEND_API_KEY=re_...
   NOTIFY_DOMAIN=getchrgd.co.uk
   NOTIFY_REPLY_TO=contact@getchrgd.co.uk
   APP_URL=https://getchrgd.co.uk
   ```

   `NOTIFY_DOMAIN` is the one that creates the three sending addresses. Leave it
   blank and everything falls back to a single `NOTIFY_FROM` address.

7. **Redeploy**, then open Founders Hub → Emails. The sending addresses are
   listed at the top — check they read `…@getchrgd.co.uk`.
8. **Test before a customer does.** Open any queued email, press **Send me a
   copy**, and put in your own address. It sends the exact message a customer
   would get, from the real address, and changes nothing about the queued row.
   Check it lands in the inbox rather than the junk folder — in Gmail, on your
   phone, and in Outlook if you can.

> `APP_URL` matters more than it looks. Every link in every email is built from
> it. Get it wrong and you email customers links to `localhost`.

### Rung 3 — send by itself

`NOTIFY_SOURCE=auto`. The daily job sends everything queued and you only look at
the page when something fails.

Deliberately a separate decision from rung 2: "I can send with one click" and
"email leaves without me reading it" are different levels of trust. Spend a
couple of weeks on rung 2 first — you will edit the wording, and it is much
easier to do that before three hundred people have read it.

---

## The log

**Founders Hub → Emails → Log** is every email ever queued, newest first,
searchable by recipient and by kind. Each row opens to show the message exactly
as the customer received it — both the designed version and the plain-text one —
along with which address it came from, whether it went, and why if it didn't.

Two distinctions the log keeps and never blurs:

- **"Delivered" vs "sent by hand".** A provider confirming delivery and a person
  saying they sent it are different claims. The log labels them differently and
  records the provider's message id for the first.
- **Queued vs sent.** An email that failed stays visible with its reason, and can
  be put back in the queue. Nothing quietly disappears.

This is the page to open when someone says they were never told about something.

---

## Settings reference

| Variable | What it does |
|---|---|
| `NOTIFY_SOURCE` | `manual` · `resend` · `auto`. Who presses send. |
| `RESEND_API_KEY` | From Resend. Needed for `resend` and `auto`. |
| `NOTIFY_DOMAIN` | Verified sending domain. Creates the three noreply addresses. |
| `NOTIFY_REPLY_TO` | Where replies land. Falls back to `NEXT_PUBLIC_SUPPORT_EMAIL`, then `contact@NOTIFY_DOMAIN`. |
| `NOTIFY_FROM_ORDERS` | Override one stream's address, full header form. |
| `NOTIFY_FROM_SUBSCRIPTIONS` | As above. |
| `NOTIFY_FROM_BILLING` | As above. |
| `NOTIFY_FROM` | Single address for everything. Used when `NOTIFY_DOMAIN` is blank. |
| `APP_URL` | Public origin. Every link in every email is built from it. |
| `RESEND_API_URL` | Point the sender at a stub or a self-hosted relay. |
| `NEXT_PUBLIC_LEGAL_NAME` and friends | Printed in the footer of every email. Fill them in before sending for real — company law requires them on business email, and until they are set the footer says `[Registered company name]` in front of every customer. |

---

## Troubleshooting

**Emails are queuing but the Send button isn't there.** No provider is
configured. Check `RESEND_API_KEY` is set on the deployed environment, not just
locally, and that you redeployed after adding it.

**Resend rejects the send.** The reason is on the row in the hub, verbatim. Nine
times out of ten it is the domain not being verified, or a `NOTIFY_FROM_*`
override pointing at a domain that isn't.

**Links in the email point at localhost.** `APP_URL` is unset on that
environment.

**The footer says `[Registered company name]`.** The legal entity settings are
still on their placeholders. Fill in `NEXT_PUBLIC_LEGAL_NAME`,
`NEXT_PUBLIC_COMPANY_NUMBER`, `NEXT_PUBLIC_REGISTERED_ADDRESS` and
`NEXT_PUBLIC_SUPPORT_EMAIL`.

**A customer says they got two receipts.** They didn't — every confirmation is
deduplicated on the order or subscription id by a uniqueness constraint in the
database, so a repeated webhook cannot produce a second one. Search the log for
their address to show what actually went.
