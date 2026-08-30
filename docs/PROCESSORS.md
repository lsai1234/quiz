# Record of processing, processors and transfers

**Status: DRAFT — 🔲 marks something only the business can supply.**
Not legal advice.

Two documents in one, because they are read together: the Article 30 record of
what we process, and the Article 28 register of who else touches it.

Article 30's under-250-employee exemption does **not** apply here. It falls away
when processing is not occasional or involves special category data, and this is
both.

---

## Controller

| | |
|---|---|
| Legal name | 🔲 `[Registered company name]` |
| Trading name | CHRGD |
| Company number | 🔲 `[Company number]` |
| Registered address | 🔲 `[Registered address]` |
| Contact for data matters | 🔲 `[support email]` |
| ICO registration number | 🔲 — **required.** Any controller processing personal data must pay the data protection fee and register. £40–60/year at ico.org.uk. |
| DPO | Not required at current scale (see DPIA §1) |

---

## Article 30 — what we process

### A. Members

**Purposes:** building and running the subscription; taking payment; delivering
orders; support; service email.
**Categories of person:** customers and people who took the quiz without buying.
**Categories of data:** name, email, delivery address, phone; age band, sex,
weight band; goals, training, diet, routine and free-text quiz follow-ups; plan
and order history; check-ins.
**Lawful basis:** Article 6(1)(b) contract; 6(1)(c) for tax records.
**Retention:** quiz answers 365 days after a plan ends; orders 6 years; see
`RETENTION` in `src/lib/legal/content.ts`, which the privacy notice and the
nightly job both read.
**Recipients:** Stripe, PowerBody, the email provider, Vercel, OpenAI (subset —
see below).

### B. Health and safety answers ⚠️ special category

**Purpose:** excluding products that are unsuitable — at build time and at every
automatic substitution.
**Categories of data:** pregnancy/breastfeeding, prescription medication,
shellfish allergy. Plant-based-only is collected on the same screen and may
evidence a philosophical belief.
**Lawful basis:** Article 6(1)(a) and **Article 9(2)(a) explicit consent**.
**Retention:** with the quiz answers; deleted on withdrawal or erasure.
**Recipients:** **none.** Not sent to any processor, including OpenAI. Kept out
of the staff-facing strings in the Founders Hub.
**Safeguards:** consent taken before collection on its own control; enforced
server-side; never in a prompt.

### C. Partners (influencers)

**Categories:** name, email, password hash, commission ledger, payouts.
**Lawful basis:** 6(1)(b) contract. **Retention:** 🔲 not yet set — the partner
tables have no window. Recommend 6 years after the last payout, matching orders.

### D. Telemetry

**Categories:** anonymous per-visit id, event name, path; error reports which may
carry a user id when raised in an authenticated request.
**Lawful basis:** 6(1)(f) legitimate interests. PECR reg 6 for the storage —
disclosed, with an opt-out, and DNT/GPC honoured.
**Retention:** analytics 400 days, error events 30 days.

### E. Prize draws

**Categories:** social handle, channel, entry route.
**Lawful basis:** 6(1)(b). **Retention:** 🔲 not yet set. Recommend deleting
non-winning entries once the draw is settled and the CAP-required period passes.

---

## Article 28 — processors

Every one of these needs a written contract with the Article 28(3) terms before
go-live. Most publish standard DPAs that only need accepting.

| Processor | What they get | Where | Contract | Status |
|---|---|---|---|---|
| **Stripe** | Name, email, phone, billing address, card (direct to them — never ours) | US / EU | Stripe DPA, accepted in Dashboard → Settings → Legal | 🔲 |
| **PowerBody** | Name, delivery address, phone, email. **No health data** | 🔲 confirm (UK/PL) | 🔲 Supplier agreement — likely needs one drafting; they are a dropshipper, not a SaaS with a standard DPA | 🔲 |
| **OpenAI** | Goals, age band, sex, diet, lifestyle, free-text follow-ups. **No name, email, address or safety flags** | **US** | OpenAI DPA at openai.com/policies/data-processing-addendum | 🔲 |
| **Vercel** | Request logs, IP addresses, hosting | US / EU | Vercel DPA | 🔲 |
| **Google Workspace** *(if `NOTIFY_SOURCE=gmail`)* | Rendered email bodies — name, address, order | US / EU | Google Workspace DPA | 🔲 |
| **Resend** *(if `NOTIFY_SOURCE=resend`)* | Same | US | Resend DPA | 🔲 |
| **Neon / Postgres host** | Everything | 🔲 confirm region | 🔲 | 🔲 |

🔲 **Pick a region deliberately.** Hosting the database in the UK or EU removes a
transfer question entirely and is usually a dropdown at provision time. Worth
doing before there is data to migrate.

---

## International transfers

Only two matter, and only one carries anything sensitive.

### OpenAI (United States)

**What crosses:** goals — which include `menopause` — age band, sex, diet,
lifestyle answers and free-text follow-ups. A menopause goal alongside sex and
age band is a health inference even though no health *answer* is sent, so this
should be treated as a transfer of health-adjacent data rather than ordinary
personal data.

**Mechanism:** UK Addendum to the EU standard contractual clauses, incorporated
by OpenAI's DPA. 🔲 Execute it.

**Transfer risk assessment** — 🔲 to be completed and filed. The substantive
points are already favourable and should be recorded:

- No direct identifiers cross. Name, email and address stay here.
- The safety flags never cross, verified in code.
- The payload is small, curated and per-request; there is no bulk export.
- US government access risk (FISA 702, EO 12333) is the standard concern. The
  mitigating fact is that the data carries no identifier, so it is of limited
  use to a targeted request.
- 🔲 **Request zero data retention** on the API account. OpenAI grant it on
  request for API customers; it removes the 30-day retention window and is the
  single highest-value action outstanding on this page.

### Everyone else

Stripe, Vercel and the email provider all offer EU/UK regions or operate under
their own SCC-backed DPAs. 🔲 Confirm the region selected for each and record it
in the table above.

---

## Before go-live

1. 🔲 Register with the ICO and pay the fee.
2. 🔲 Fill in `LEGAL_ENTITY` — the privacy notice and terms show a warning
   banner until you do, and a notice that cannot name its controller is not one.
3. 🔲 Accept each processor's DPA and record the date.
4. 🔲 Request OpenAI zero data retention.
5. 🔲 Complete and file the transfer risk assessment.
6. 🔲 Set retention for the partner and competition tables.
7. 🔲 Decide the under-18 question (DPIA R8).
8. 🔲 Have a solicitor review the terms, the disclaimer and the privacy notice —
   the code has said this since before any of it was written.

**Review:** whenever a processor is added or changed, and annually.
