# Email capture — implementation plan

Collecting email addresses through the quiz, lawfully, without slowing anyone
down on the way to a stack. Five phases, each shippable on its own.

> **Status: all five phases are built** (2026-08). What shipped follows the plan
> below with two deliberate differences, both noted in §"Where the email is
> asked for" and Phase 2: the build-screen capture *holds* the auto-advance
> while somebody is typing rather than racing it, and the reveal card pre-fills
> from anything already captured. The three open questions in "What I need from
> you" were answered by building the defaults recommended there — 24 months'
> retention (`LEAD_RETENTION_MONTHS`), single opt-in with a welcome email, and
> the entity details still on their placeholders, which the privacy page warns
> about until they are filled in.

> **Not legal advice.** The reasoning below is what UK GDPR and PECR require as
> we understand them, and the code is built to satisfy it. The *wording* shown to
> customers (§ "The words people will read") is the part worth twenty minutes of
> a solicitor's time before it goes live — it is also the part that is cheapest
> to change, since it is versioned data in `legal/content.ts`, not markup.

---

## What we already have

More than half of this is built, which is why the plan is short.

| Piece | Where | State |
| --- | --- | --- |
| Opt-out tokens, per address, unguessable and stable | `lib/notify/marketing.ts` | Live |
| One-click opt-out page + undo | `api/notify/marketing-opt-out` | Live |
| Suppression checked before any promotional strip | `lib/notify/marketing.ts` | Live |
| Consent evidence: versioned text, hashed, IP + user agent, append-only | `lib/legal/consent.ts`, `consents` table | Live, but keyed to a **user account** |
| Outbox that can email a non-member (`userId: null`) | `lib/notify/outbox.ts` | Live |
| Mail streams with per-purpose From addresses | `lib/notify/streams.ts` | Live |
| Quiz answers surviving a refresh | `lib/store.tsx` (`persist`) | Live |
| **A privacy notice** | — | **Missing — Phase 0** |
| **A record of anyone who isn't a customer** | — | **Missing — Phase 0** |

The gap is not "email plumbing". It is that everything we have assumes the person
already bought something and has an account. A quiz-taker has neither.

---

## The rules the design has to satisfy

Four, and each one shapes a specific decision rather than sitting in a policy
document nobody reads.

**1. Marketing to a non-customer needs consent — opt-in, unticked, and separate.**
UK GDPR Art. 4(11) + PECR reg. 22. So the box is never pre-ticked, never bundled
into "I agree to the terms", and — the part that gets missed — **the email must
work without it.** If ticking is the price of getting your stack emailed, the
consent isn't freely given and the whole list is built on sand. Hence Phase 1's
acceptance test: *submit with the box unticked, still get the stack.*

**2. A customer is different.** PECR reg. 22(3)'s soft opt-in lets us market
similar products to someone who bought, or negotiated to buy, provided every
message carries a simple refusal. So the record stores **which basis** applies per
address — `consent` or `soft-opt-in` — because they are not interchangeable and
a list that has forgotten which is which can only be treated as the stricter one.

**3. Tell them at the moment of collection.** Art. 13: who we are, what we'll do
with it, how long we keep it, how to withdraw — linked, in plain sight, at the
field. Hence the privacy notice is Phase 0 and not a later tidy-up: there is no
lawful way to collect the first address without it.

**4. Withdrawal has to be as easy as giving.** Art. 7(3). One click, no login, no
form — which is what the existing opt-out page already does. What it doesn't yet
do is cover a lead who never had an account, and it doesn't distinguish "stop the
marketing" from "stop everything" (we can't stop receipts, and saying so plainly
is what keeps people out of the support inbox).

---

## Where the email is asked for

The quiz has three moments with genuinely different psychology, and the plan uses
two of them.

| Moment | Why it works | Why not |
| --- | --- | --- |
| **The reveal, under the stack** (Phase 1) | They have just been given something worth keeping. "Email me my stack" is a favour to them, not a toll. | — |
| **The build screen** (Phase 2, flagged) | ~3.4s of dead time that already says "building your stack". Filling a field costs nothing there. | It sits *before* the payoff — asking before delivering is the shape that costs conversion. Ship it behind a flag and measure. |
| A step in the questionnaire | — | Highest-cost option: a field in the middle of the flow is a wall, and it collects addresses from people who never saw a stack, which is the least valuable list we could build. **Not doing this.** |

The rule the capture UI is built against: **it never gates anything.** No modal
over the reveal, no "enter your email to see your results", no disabled Continue.
It is a card that can be ignored and dismissed, and the quiz completes, prices and
checks out identically for someone who never types an address.

---

## Phase 0 — The legal spine

**Objective.** A privacy notice, a place to put an address that isn't a customer,
and one function that answers "may we market to this address?" for leads and
members alike. No capture UI — this phase is what makes the next one lawful.

**Files/modules.**
- `src/lib/legal/content.ts` — `getPrivacyDocument()` + `PRIVACY_VERSION`, built
  the same way as the terms so it is versioned, hashable and rendered from data.
  Also `marketingConsentStatement()`: the exact sentence beside the tick, versioned
  on its own, because that is the sentence we have to be able to reproduce years
  later.
- `src/app/legal/privacy/page.tsx` — mirrors `/legal/terms`; linked from the site
  footer and from every capture point.
- `src/lib/db/migrations.ts` — v14:
  - `email_leads` — normalised email (unique), first name, source, primary goal +
    track (so a list can be segmented), `user_id` nullable, first/last seen.
  - `marketing_consents` — append-only: email, action (`opt-in` / `opt-out`),
    basis (`consent` / `soft-opt-in`), statement version + SHA-256, source, IP,
    user agent, timestamp. Never updated, never deleted — the value is the history.
- `src/lib/audience/` — `leads.ts` (upsert, list, count), `consent.ts` (record,
  current state), `suppression.ts` — one `mayMarket(email)` wrapping today's KV
  suppression so there is a single answer, not two that can disagree.

**Dependencies.** None.

**Effort.** 1.5 days.

**Risk.** Low — additive. The migration is a new table; nothing reads it yet.

**Acceptance criteria.**
- `/legal/privacy` renders, is versioned, and says what we collect, why, on what
  basis, how long we keep it, who processes it, and how to get out.
- A consent record can reproduce the exact wording the person saw (hash matches a
  re-render), the same property the checkout consents already have.
- `mayMarket()` returns false for anyone suppressed today, with no behaviour
  change to the existing promotional strip.

**Rollback.** Delete the page link; the table sits unused.

---

## Phase 1 — The capture

**Objective.** "Email me my stack" on the reveal, with the marketing tick beside
it — and a quiz that converts exactly as well for people who ignore it.

**Files/modules.**
- `src/app/api/audience/subscribe/route.ts` — validate + normalise, honeypot field
  and a per-IP window (the `api/orders/confirmation` limiter is the pattern),
  upsert the lead, record consent evidence with `requestMetadata(req)`, queue the
  stack email. Answers 200 on anything short of a malformed request: a failure
  here must never be a thing the customer has to solve.
- `src/lib/notify/types.ts` + `templates.ts` — a `stack-email` template on a new
  `marketing` stream. It is the thing they asked for, so it sends automatically;
  it carries the opt-out footer whether or not they ticked anything.
- `src/components/stack-review/SaveStackCard.tsx` — built from
  `@/components/system` per `DESIGN.md`. Email field, **unticked** checkbox,
  one-line transparency + privacy link, button that says what happens.
  Dismissible; success state replaces it; pre-filled and skipped for a signed-in
  member whose preference we already hold.
- `src/lib/store.tsx` — remember that it was sent/dismissed so it doesn't nag.
- `src/lib/analytics/quiz.ts` — `leadPromptView`, `leadSubmit`, `leadOptIn`,
  `leadDismiss`.

**Dependencies.** Phase 0.

**Effort.** 2 days.

**Risk.** Medium — it is new UI on the highest-value screen in the product. The
mitigations are that it is inert (nothing gates), and the guardrail metric below.

**Acceptance criteria.**
- Submitting with the box **unticked** still emails the stack, and writes **no**
  marketing consent. (The test that proves consent is freely given.)
- Submitting with it ticked writes one consent row carrying the statement version
  and hash.
- The same address twice does not create two leads or two consent rows for one act.
- Every stack email carries a working one-click opt-out.
- e2e: complete the quiz → capture → the email is in the outbox → the opt-out link
  in it suppresses the address.

**Proof metric.** Capture rate on the reveal (primary). **Reveal → checkout
conversion not down** (guardrail — if it moves, the card goes).

**Rollback.** One flag hides the card; addresses already collected stay lawful.

---

## Phase 2 — The second moment, and one identity per address

**Objective.** Catch the people who never scroll, and stop the same person
existing as three unrelated records.

**Files/modules.**
- `src/components/scroll/Act3Analysis.tsx` — the build-screen field, behind a
  config flag so it can be measured against reveal-only rather than assumed.
- `src/components/auth/AccountGate.tsx` + `api/auth/signup` — a buyer's address
  recorded with basis `soft-opt-in`, plus the tick for anything beyond similar
  products. The gate already captures consent for the terms; this is one more
  field in a form that exists.
- `src/lib/audience/leads.ts` — link a lead to a user when the addresses match, so
  one preference governs the address however it arrived. A member who opts out in
  the hub is opted out of the quiz list too, and vice versa.

**Dependencies.** Phase 1.

**Effort.** 1.5 days.

**Risk.** Medium — this is the phase that can cost conversion, which is exactly
why the build-screen capture is flagged and measured rather than shipped on
conviction.

**Acceptance criteria.**
- Flag off = today's behaviour, byte for byte.
- A quiz lead who later buys is one row, one basis history, one opt-out.
- Opting out anywhere opts out everywhere.

**Proof metric.** Incremental capture per 100 completions vs. Phase 1 alone, with
quiz → checkout as the guardrail.

---

## Phase 3 — Seeing them, and getting them out

**Objective.** The founder-facing half: who is on the list, and a CSV that can be
sent from anywhere without breaking the law.

**Files/modules.**
- `src/app/founderhub/audience/page.tsx` + `src/components/portal/AudiencePage.tsx`
  — counts across the top (total · marketable · suppressed · from buyers), the
  list below, filterable by source, goal, track and date, searchable by address.
  `PortalShell` gets one more nav entry.
- `src/app/api/portal/audience/route.ts` — portal-guarded, same shape as
  `api/portal/subscriptions`.
- `src/app/api/portal/audience/export/route.ts` — `text/csv` with a BOM so Excel
  and Sheets open it clean. Columns: `email, first_name, signed_up_at, source,
  primary_goal, unsubscribe_url`.

**The `unsubscribe_url` column is the point of this phase.** It carries the
address's own opt-out token, so a campaign sent from Gmail or Mailchimp can put a
real, working unsubscribe link in the footer as a merge field — and the opt-out
lands back in *our* database, where the next export will already exclude it. Without
it, sending from an outside tool either has no opt-out (unlawful) or has one that
only that tool knows about (a suppression list we can't see).

**Dependencies.** Phase 0. Useful the moment Phase 1 has collected anything.

**Effort.** 1.5 days.

**Risk.** Low.

**Acceptance criteria.**
- A suppressed address is **never** in a default export, and the UI says so rather
  than silently filtering.
- Every export is logged — who, when, how many rows, which filter.
- The CSV round-trips through Sheets with commas, apostrophes and non-ASCII names
  intact.

---

## Phase 4 — Sending, and the opt-out that has to work

**Objective.** Everything needed to actually send marketing — whether from the hub
or from an outside tool — and stay compliant while doing it.

**Files/modules.**
- `src/app/api/notify/marketing-opt-out/route.ts` — keep the one-click GET
  (mailbox providers expect it), and add a preferences page behind it: stop
  marketing, or stop everything that isn't the service, with the same plain
  sentence about what can't be stopped. Works for a lead with no account.
- `src/lib/notify/providers/*` — `List-Unsubscribe` and `List-Unsubscribe-Post`
  headers (RFC 8058). Gmail and Yahoo have required one-click unsubscribe from
  bulk senders since February 2024; without these headers, deliverability is the
  thing that suffers first and silently.
- *Optional, decide when we get here:* a `marketing-broadcast` template and a hub
  composer that queues per recipient through the existing outbox, re-checking
  suppression **at send time, not compose time**, and throttled to the provider's
  daily ceiling (2,000 on Google Workspace — see `docs/EMAILS.md`).
- A welcome email on opt-in, and `AUDIENCE_DOUBLE_OPT_IN` for confirmed opt-in.
  Not required in the UK; worth having as a switch for list quality.

**Dependencies.** Phase 3 (export) or Phase 1 (in-app sending).

**Effort.** 2–3 days, halved if we skip the in-app composer and send from Gmail.

**Risk.** Medium — sending is where a mistake reaches real inboxes. The
suppression re-check at send time is the guardrail.

**Acceptance criteria.**
- An address suppressed between compose and send is not sent to.
- One-click unsubscribe works from a real mail client, with no login.
- Nobody loses a receipt by unsubscribing from marketing.

---

## Phase 5 — Rights, retention, hygiene

**Objective.** The obligations that arrive with a list and don't announce
themselves.

**Files/modules.**
- `src/components/hub/*` — an email-preferences row in My Hub. Withdrawal being
  "as easy as giving" is a legal requirement, and a member who has to hunt for a
  link in an old email complains instead.
- `src/lib/changes/daily.ts` — purge leads with no engagement past the retention
  period (storage limitation; propose 24 months, founder-configurable), and
  unconfirmed double opt-ins after 7 days.
- `src/lib/audience/rights.ts` + a hub control — everything we hold for one
  address, and erase it. A subject access request answered by hand is answered
  late.
- Resend only: bounce and complaint webhooks auto-suppress.

**Dependencies.** Phase 3.

**Effort.** 1.5 days.

**Acceptance criteria.**
- A DSAR is one search and one button.
- Erasure removes the lead but **keeps** the opt-out suppression record — deleting
  that would let the address be re-added and re-emailed, which is the opposite of
  what they asked for. (This exception is standard and worth documenting in the
  privacy notice.)

---

## The words people will read

Drafts, held as versioned data so changing them is an edit and not a deploy of new
markup. These are what to put in front of a solicitor.

**At the field, under the input:**

> We'll email your stack to this address so you don't lose it. We won't share it
> with anyone. [How we handle your data](/legal/privacy)

**The checkbox — unticked, and never a condition of the button:**

> Email me tips, offers and new products from getCHRGD. One click to stop, any
> time.

**The button:** `Email me my stack` — not "Subscribe", because subscribing is not
what the person is doing.

**In the opt-out page, unchanged in substance from what already ships:** what has
stopped, and — the sentence that keeps people out of the support inbox — what
hasn't, and why.

---

## What I need from you

Three answers, none of which block Phase 0 starting:

1. **Retention.** How long do we keep an address that never buys? 24 months is the
   usual answer and what the notice will say unless you'd rather it were shorter.
2. **Double opt-in.** Confirmed opt-in costs 20–30% of sign-ups and buys cleaner
   deliverability. My recommendation: single opt-in now, with the switch built so
   it's a config change if the list ever gets used hard.
3. **The privacy notice's specifics** — the registered entity and address behind
   `LEGAL_ENTITY`, whether we're registered with the ICO (a data controller doing
   direct marketing generally must be, ~£52/year), and confirmation of the
   processor list: Stripe, PowerBody, Google Workspace or Resend, Vercel, OpenAI.

---

## Order, and what ships when

Phase 0 → 1 is the smallest thing worth shipping: a lawful list that fills itself
from the reveal. Phase 3 is what makes it *useful to you* and is a day and a half
whenever you want it — it can jump the queue ahead of Phase 2 if you'd rather have
the export than the second capture point. Phases 4 and 5 are the difference
between having a list and running one, and neither is urgent until the first
campaign goes out.

| Phase | Ships | Effort |
| --- | --- | --- |
| 0 | Privacy notice, lead + consent tables, one suppression answer | 1.5 d |
| 1 | Capture on the reveal, stack email, opt-in evidence | 2 d |
| 2 | Build-screen capture (flagged), buyers, one identity per address | 1.5 d |
| 3 | Founders Hub → Audience, CSV export with per-address opt-out links | 1.5 d |
| 4 | Preference centre, RFC 8058 headers, optional in-app sending | 2–3 d |
| 5 | Hub preferences, retention purge, DSAR, bounce handling | 1.5 d |
