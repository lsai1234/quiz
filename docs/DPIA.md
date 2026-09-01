# Data Protection Impact Assessment

**Status: DRAFT — sections marked 🔲 need a decision or a fact only the business has.**
Not legal advice. Have a solicitor or DP adviser review before go-live.

Article 35(3)(b) makes a DPIA mandatory for large-scale processing of special
category data. The ICO's own list adds two more triggers this processing hits:
innovative technology (a model shaping what someone is shown) and invisible
processing. Any one of the three would be enough.

Everything in "What we do" below is read from the code, not from intention, and
each claim names where it is enforced so this can be re-checked rather than
re-believed.

---

## 1. What the processing is

CHRGD sells food supplements on a monthly subscription. A quiz asks about
someone's goals, routine, diet and training, and a safety screen asks whether
they are pregnant or breastfeeding, take prescription medication, or have a
shellfish allergy. A deterministic engine builds a recommended stack from those
answers; a model orders the questions and chooses between products the engine has
already shortlisted.

**Controller:** 🔲 `[Registered company name]`, company number 🔲 `[Company number]`.
**DPO:** not required (Article 37 thresholds not met — no large-scale systematic
monitoring, no large-scale Article 9 processing as a core activity at current
volume). 🔲 Re-check if the member base passes ~10,000.
**Contact for data matters:** 🔲 `[support email]`.

## 2. Necessity and proportionality

**Why we need the health data at all.** Some products in the range are
contraindicated in pregnancy (ashwagandha, hormone-active botanicals, high-dose
caffeine) and some are shellfish-derived (krill oil, most glucosamine). Without
the safety screen we would be recommending them to everyone. The data is
collected to *remove* products, never to add them.

**Why this is the least we can do it with.** Recorded as a design constraint in
`src/lib/quiz-v2/bank/wellbeing.ts`: no question in the bank asks about symptoms,
conditions, medication, pain or diagnosis. The rule bites hardest on menopause
and gut health, where the obvious question is a clinical one, and it is held
there too — the questions ask about someone's day, not their body.

**Alternatives considered and rejected.**

| Alternative | Why not |
|---|---|
| Don't ask at all; rely on the label | The label is the final word and we say so, but shipping someone a contraindicated product because we never asked is not a defensible default for a subscription that auto-substitutes. |
| Ask, but don't store | The exclusions have to survive to the next substitution months later, or the promise not to swap across an allergy is unkeepable. This is exactly the bug fixed in `src/lib/changes/safety.ts`. |
| Free-text "anything we should know?" | Worse. Unbounded free text invites far more sensitive disclosure than three checkboxes and cannot be validated or minimised. |

## 3. Lawful basis

| Processing | Article 6 | Article 9 |
|---|---|---|
| Building and running the plan | 6(1)(b) contract | — |
| Safety-screen answers | 6(1)(a) consent | **9(2)(a) explicit consent** |
| Orders, invoices, tax records | 6(1)(c) legal obligation | — |
| Security, fault diagnosis, fraud | 6(1)(f) legitimate interests | — |
| Marketing email | 6(1)(a) consent / PECR soft opt-in | — |

9(2)(a) is effectively the only route open: 9(2)(h) needs a health professional
under a duty of confidentiality, 9(2)(c) applies to someone incapable of
consenting, and 9(2)(i) is for public bodies. A supplement retailer is none of
those.

**How the consent meets the bar.** Taken on the safety screen before a single
option is shown (`src/components/legal/HealthDataConsent.tsx`), on its own
control, unticked, describing this processing and nothing else. Declining means
the questions are never asked — not asked-and-ignored. Recorded as its own
append-only row with its own context and the timestamp of the tick
(`src/lib/legal/consent.ts`), and enforced server-side, so flags arriving without
a matching current consent are dropped rather than trusted
(`src/lib/legal/health-data.ts`).

## 4. Risks

Likelihood and severity are scored before mitigation, 1–5.

### R1 — Contraindicated product sent to someone who declared a risk
**L4 × S5 = 20 (high).** Physical harm, not just a data breach.
Was live: the safety flags were applied when the stack was built but not carried
into the snapshot governing automatic substitutions.
**Mitigation:** flags are now part of `SafetyConstraints` and tested against each
candidate's contraindications; a snapshot predating the field is treated as
*unknown* and refuses anything contraindicated at all rather than reading the
gap as "no flags". Where nothing suitable remains the line is removed and the
member refunded. **Residual: L1 × S5 = 5.**

### R2 — Health data exposed through the staff console
**L2 × S4 = 8 (medium).** The Founders Hub can read any member's record.
**Mitigation:** the flags are deliberately kept out of `describeConstraints` and
`failedConstraints`, the two strings the hub renders, so a blocked swap says "not
suitable on safety grounds" without naming the condition. Login now uses signed,
rotating, 12-hour tokens with constant-time comparison and rate limiting.
**Residual: L1 × S4 = 4.**
🔲 **Outstanding:** no MFA, and no audit log of which founder read which member.
Both are recommended before the member base grows.

### R3 — Health data leaving the country to a processor
**L3 × S4 = 12 (medium-high).**
**Mitigation:** the safety flags are excluded from every prompt in the codebase —
verified, `safetyFlags` appears in no prompt builder. The customer's name was
removed from the identity prompt. What does go is goals, age band, sex, diet and
free-text follow-ups.
**Residual: L2 × S3 = 6.**
🔲 **Outstanding:** OpenAI zero-data-retention not requested; transfer assessment
not completed. See `docs/PROCESSORS.md`.

### R4 — Data kept indefinitely
**L5 × S3 = 15 (high)** — this was certain, not merely likely.
**Mitigation:** nightly retention sweeps (`src/lib/legal/retention.ts`) clear quiz
answers 365 days after a plan ends, strip consent IP/user-agent at 365 days,
empty email bodies at 90, drop analytics at 400, and erase accounts that never
purchased at 90. Windows come from the same constants the privacy notice renders
from, so the notice cannot promise what the job does not do.
**Residual: L1 × S3 = 3.**

### R5 — No way to exercise data rights
**L5 × S3 = 15 (high)** — also certain.
**Mitigation:** self-service export and deletion in My Hub
(`src/lib/db/erasure.ts`). **Residual: L1 × S2 = 2.**

### R6 — Consent that is not freely given
**L4 × S3 = 12 (medium-high).** One tick-box covered the subscription terms and
the health disclaimer together, so someone who wanted the plan could not refuse
the health processing.
**Mitigation:** separated entirely — its own document, its own record, its own
unticked control, and refusable without losing the service. It is a tick under
the safety options rather than a card in front of them (changed 2026-09-01, for
being more ceremony than the decision deserves), which changes how it looks and
not one thing about what it is: still an affirmative act, in words, about this
processing alone. What enforces it is that an unticked box means the health
answers are refused on tap, dropped at commit and stripped server-side — not
that the question was hidden.
**Residual: L1 × S3 = 3.**

### R7 — Health data left on a shared device
**L3 × S3 = 9 (medium).** The full answer set persists in `localStorage`.
**Mitigation:** seven-day expiry; state with no timestamp is treated as expired.
**Residual: L2 × S2 = 4.**

### R8 — Someone under 18 taking the quiz
**L3 × S3 = 9 (medium).** The quiz asks an age band with "Under 25" as its
lowest rung, which does not identify a 16-year-old.
🔲 **Outstanding — no mitigation in code yet.** Options: make the lowest band
"Under 18" and refuse, or add an age gate. Needs a product decision; the
disclaimer currently says "speak to a doctor if under 18", which is a warning,
not a control.

## 5. Sign-off

| | Name | Date |
|---|---|---|
| Assessed by | 🔲 | 🔲 |
| Reviewed by (solicitor / DP adviser) | 🔲 | 🔲 |
| Accepted by (controller) | 🔲 | 🔲 |

**Residual risks accepted:** R2 (no MFA, no access audit log), R3 (transfer
assessment outstanding), R8 (no age control).
🔲 The controller has to actively accept these, or fix them, before go-live.
Under Article 36 a residual high risk that cannot be mitigated requires prior
consultation with the ICO — none of the residuals above are scored high, but
R8 has no mitigation at all yet and should be closed rather than accepted.

**Review:** on any change to what the quiz asks, what is sent to a processor, or
what the retention windows are — and annually regardless.
