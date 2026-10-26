# Amp Consult: privacy drafts for review

**Status: DRAFT, not published.** Nothing in this file is live. `docs/DPIA.md` and
`src/lib/legal/content.ts` are unchanged. These are proposed texts for you to
approve or change (`docs/amp-consult-offer-plan.md`, Phase 1, item 8). Not legal advice:
the DPIA's own rule applies, so a solicitor or DP adviser should review before
the consult goes to customers.

Everything below is read from the code as it stands after Phase 1, and names where
each point is enforced.

Contents:

1. A consult section for `docs/DPIA.md`
2. An update to the privacy notice's AI section
3. One thing to decide first: the health-data notice the consult's consent points to

---

## 1. DPIA: proposed new section "6. The Amp Consult"

> Proposed to sit after §4 (Risks) as its own section, with the sign-off table
> becoming §7. It reuses the R-numbering style, with a C prefix.

### 6.1 What the consult processes

The Amp Consult is a second quiz (`src/components/consult/AmpConsult.tsx`,
`src/lib/consult/*`). Founders-only at `/quizv2` until the hub's rollout setting
changes. It collects:

| Category | Fields | Article 9? |
|---|---|---|
| Goals and about you | up to 3 goals; age band; sex | No |
| Lifestyle | training days or averages and intensity; aim; afternoon energy 1–10; sleep window and quality; daylight; coffee, tea and energy-drink counts; foods eaten; what's got harder lately (older journey); supplements already taken | No |
| Body map | which of 5 spots are stiff or sore | Treated as health data: never sent to AI, never stored on the server |
| Circuit check | pregnancy/breastfeeding/trying; blood-thinning medicine; weight-loss medication; other prescription medicine; heart condition or high blood pressure; kidney or liver condition; shellfish allergy | **Yes** |
| Weight-loss medication follow-up | symptoms since starting it (low appetite, nausea, constipation, tiredness), only with a second, optional tailoring consent | **Yes** |
| Free text ("Tell Amp more", Pinpoint's typing sheets) | screened for medical content first; the raw text is not kept. What is kept is the validated picks and a note of up to 72 characters | Only if it slips past the screen (see C4) |
| Pinpoint | probe answers, hunch verdicts | No |

### 6.2 Lawful basis

| Processing | Article 6 | Article 9 |
|---|---|---|
| Building the recommendation from lifestyle answers | 6(1)(b) steps at the person's request before a contract | — |
| Circuit check answers, and the exclusions derived from them | 6(1)(a) consent | **9(2)(a) explicit consent**, the circuit check's own consent line (`scenes/CircuitCheck.tsx`), recorded as `{accepted, version, at}` |
| Weight-loss medication symptoms, used to tailor | 6(1)(a) consent | **9(2)(a)**, a second, separate, optional consent (`TAILOR_CONSENT_VERSION`) |
| Scene wording, reading free text, Pinpoint lines (OpenAI) | 6(1)(f) legitimate interests: a clearer consult. Balancing: only coarse, non-health answers are sent, and every output has a scripted fallback | None sent (see 6.4) |

Declining the circuit check's consent stops the consult and keeps nothing
(`circuit.ts` `circuitOutcome`, the `declined` stop).

### 6.3 What is stored, where, and for how long

| What | Where | How long | Health-derived? |
|---|---|---|---|
| The consult in progress | the device, `localStorage` `chrgd-consult` | 7 days | No: the circuit answers, both consents and symptoms are stripped before saving (`persist.ts` `forStorage`) |
| The handoff copy | the device, `localStorage` `chrgd-consult-handoff` | 7 days | Yes: the excluded ingredient families and the pharmacist-note flag. Read back after a reload so the exclusions and note survive (Phase 1, item 3) |
| The results-page answers | the device, `localStorage` `chrgd-quiz` | 7 days | Yes, since Phase 1: the excluded families (`consultExcluded`) and the circuit check's consent record, so checkout can carry them |
| Saved handoff payload | server, kv `consult:{id}` | **30 days, now deleted by the daily job** (`lib/consult/retention.ts`); before Phase 1 it was only hidden | Yes: excluded families, pharmacist-note and tailored flags |
| Safety snapshot on the subscription | server, `MemberSubscription.safetyConstraints.excludedIngredients` | the plan's life, then the quiz-answers retention | Yes. Written only with a current health-data consent (`sanitiseHealthData`), cleared on withdrawal (`withdrawHealthConsent`) |
| Safety snapshot on a one-off order | server, `Order.safetyConstraints` with `Order.healthDataConsent` | orders' 6 years (tax) | Yes. Same gate: dropped by `/api/cart` without a current consent |
| Health-data consent record | server, `consents` table, context `health-data` | consent records' retention | It is the consent itself. Written for subscriptions and for signed-in one-off buyers; a guest's order keeps the consent next to the exclusions instead |
| AI audit log | server, kv `consult-ai-log:YYYY-MM-DD` | 30 days | No: route, subject id, model, timing, outcome. Never text |
| Analytics | `analytics_events`, `analytics_sessions` | 400 days | No. A circuit stop is recorded as `circuit`, never the answer (Phase 1, item 6); the daily job rewrites any older row that named one |

**Never stored anywhere:** the circuit check's answers themselves, the
weight-loss symptoms, the body map on the server, raw free text.

### 6.4 What is sent to OpenAI

All calls are made with `store: false`. Every chat completion uses
`gpt-4.1-mini-2025-04-14` with a strict JSON schema, and typed text goes through
`omni-moderation-latest` first.

| Use | What is sent | Never sent |
|---|---|---|
| Scene wording (`/api/consult/copy`) | the screen's label and scripted words, plus goals, age band, sessions a week, afternoon energy, sleep hours, daylight, caffeine count, comfort mode. Since Phase 1 the browser sends only these fields (`copyAnswersFor`) | circuit, consents, symptoms, body map, foods, shelf, notes, sex, free text |
| Tell Amp more (`/api/consult/understand`) | the screen label and question, and the typed text (≤ 280 characters) once it has passed the medical screen and moderation | text that trips the medical screen is held back and never sent |
| What's this? (`/api/consult/explain`) | the approved glossary entry and the question, after the medical screen | medical questions (answered with the GP/pharmacist line instead) |
| Pinpoint hunch and found lines (`/api/consult/pinpoint`) | the pattern's name and line, up to 4 evidence lines from lifestyle answers, journey, goals, age band, comfort | **the body map**: since Phase 1 its evidence lines stay on the device (`aiEvidence`) and the server refuses their wording (`cleanEvidence`) |
| Pinpoint typing sheets ("tell", "notes") | the screened typed text or stored notes, and candidate question wording | text that trips the medical screen |
| Shelf scan, tracker read, voice | switched off in code (`features.ts`); proposed for removal in Phase 10 | — |

**Never sent to OpenAI:** circuit answers, consents, symptoms, the body map, name,
email, or free text that fails the medical screen.

### 6.5 Risks

Scored before mitigation, 1–5, as in §4.

**C1: An excluded product is swapped in later.** L4 × S5 = 20 (high).
Someone on blood thinners is sent a D3 + K2 when their vitamin D sells out.
*Was live:* the consult's exclusions reached the results page only, and the
subscription's snapshot carried none of them.
*Mitigation (Phase 1):* the exclusions are carried onto the subscription and the
one-off order (`excludedIngredients`), checked by the same ingredient rules the
engine uses (`meetsSafetyConstraints` → `isExcluded`), in the daily swap job and
on the order page, where a founder cannot confirm past them. Tested end to end
(`checkout/__tests__/consult-safety.test.ts`). *Residual: L1 × S5 = 5.*

**C2: The exclusion lists themselves are wrong.** L3 × S5 = 15 (high).
The circuit rules, the weight-loss rules and creatine for older adults are a
conservative starting point, not clinical advice (`circuit.ts`, `engine.ts`).
*Mitigation:* `docs/consult-review-pack.csv` lists every rule and line for
pharmacist sign-off. 🔲 **Outstanding:** the sign-off. Must be done before launch.

**C3: Health data leaves the UK to a processor.** L3 × S4 = 12.
*Mitigation:* no health answer is in any prompt (6.4); `store: false`; coarse
summaries only. 🔲 **Outstanding** (as R3): OpenAI zero-data-retention not
requested; transfer assessment not done.

**C4: Free text carries health information past the screen.** L3 × S3 = 9.
*Mitigation:* a pattern screen (`guard.ts` `looksMedical`) before anything is
sent, moderation before the model, red-team tests (`redteam.test.ts`), raw text
never stored. *Residual: L2 × S3 = 6.* The screen is a pattern list, so it will
miss some phrasings; the footnote asks people to leave medical details out.

**C5: Health-derived data left on a shared device.** L3 × S3 = 9.
The handoff copy and, since Phase 1, the results-page answers hold the excluded
families on the device. *Mitigation:* 7-day expiry on both; the circuit answers
themselves are never saved. *Residual: L2 × S2 = 4.*

**C6: Health data in analytics or logs.** L4 × S3 = 12. *Was live:* stop reasons
named pregnancy or kidney/liver against a session id, and every event's props
went to the host's logs. *Mitigation (Phase 1):* stops recorded by gate only,
scrubbed again on the server, old rows rewritten; the console log is gone.
*Residual: L1 × S2 = 2.*

**C7: Someone under 18.** Closed for the consult: "Under 18" is an age band, and
choosing it stops the consult before any health question (`flow.ts`, the
`under-18` stop). R8 stays open for the original quiz.

### 6.6 Before the consult goes to customers

- 🔲 Pharmacist sign-off of the review pack (C2).
- 🔲 OpenAI zero-data-retention and the transfer assessment (C3).
- 🔲 The health-data notice decision in section 3 below.
- 🔲 The privacy notice update in section 2 below, approved and published.

---

## 2. Privacy notice: proposed AI section

> Replaces the body of the `ai` section, "Where AI is involved", in
> `src/lib/legal/content.ts`. Not applied. Publishing it is a material change to
> the notice, so it needs your sign-off and the notice's own version bump.

**Where AI is involved**

1. We use OpenAI for a few jobs in our quizzes: to order the quiz questions, to
   choose between products our own rules have already shortlisted, to write the
   description of your stack and, in the Amp Consult, to word some screens for
   you, to read anything you choose to type, and to suggest which everyday
   patterns your answers point to.
2. What can be sent: your goals, age band, and lifestyle answers such as how
   often you train, how you sleep, how much daylight you get and how many
   caffeinated drinks you have. In the original quiz, your sex and diet too. If
   you type something, that text, once we have checked it doesn't contain
   medical details.
3. What is never sent: your name, your email, your address, your answers to the
   safety questions (including the Amp Consult's circuit check and anything
   about weight-loss medication), and which parts of your body are stiff or sore.
   If something you type looks like medical information, we don't send it, and
   we tell you so.
4. We ask OpenAI not to store what we send as a saved conversation. We don't keep
   what you type: only the answers it turned into, which you confirm.
5. The model can only work with options our own rules have already decided are
   suitable and safe for you. It cannot add a product, invent a question, or
   change what an option means, and nothing it writes is a health claim. If it is
   slow or unavailable, you see our own wording instead.
6. No decision here has a legal or similarly significant effect on you. You can
   change, swap or ignore anything we suggest, so this is not the kind of
   automated decision-making you have a specific right to object to. If you would
   rather a person looked at your plan, email us and we will.
7. OpenAI processes this in the United States. That transfer is covered by the UK
   Addendum to the European Commission's standard contractual clauses.

**Changes from the current text:**

- Paragraph 1 adds the consult's three uses.
- Paragraph 2 says sex and diet go only in the original quiz, because the
  consult's wording prompt sends neither.
- Paragraph 3 adds the circuit check, weight-loss medication and the body map to
  "never sent".
- Paragraph 4 is new: `store: false`, and raw text not kept.
- Voice and photo uploads are left out deliberately. They are off in code and
  Phase 10 proposes removing them.
- 🔲 The "How long we keep it" section should add a line for saved consults:
  "A copy of your Amp Consult result: 30 days, then it is deleted."

---

## 3. Decide first: the health-data notice the consult's consent points to

Phase 1 writes the circuit check's consent into the existing `health-data`
consent record (item 2), as the plan asks. That record is hashed against the
health-data notice (`/legal/health-data`, version `2026-08-30`). That notice
describes the original quiz's safety question:

> "The safety question asks whether you are pregnant or breastfeeding, take
> prescription medication, or have a shellfish allergy."

The circuit check asks more than that: blood thinners, weight-loss medication,
heart or blood pressure, kidney or liver. So today a consult customer's record
points to a notice that doesn't describe everything they were asked.

**Options:**

1. **Recommended: update the notice to cover both, and bump
   `HEALTH_DATA_VERSION`.** Proposed first paragraph: "Our safety questions ask
   about things that change which supplements are right for you: pregnancy or
   breastfeeding, prescription medicines (including blood thinners and
   weight-loss medication), heart or blood pressure conditions, kidney or liver
   conditions, and a shellfish allergy. That is health information, and the law
   says we need your clear permission before we can use it."
   - By the notice's own rule, a version bump means consents to the old version
     stop counting (`healthConsentIsCurrent`).
   - Existing members keep their snapshots. A new consent is only needed when
     their answers next change.
   - The quiz's own consent screen would show the new text too.
2. **Give the consult its own notice and version** (e.g. `consult-health-data`),
   and record it under its own context.
   - Cleaner separation.
   - But `sanitiseHealthData` and `withdrawHealthConsent` would need to know
     about two versions.

Until this is decided, the consult stays founder-only, so no customer record is
affected.
