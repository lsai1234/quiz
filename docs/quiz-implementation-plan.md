# CHRGD Quiz — Phase 3 Phased Implementation Plan

**Status:** Phase 3 of 3. Builds on `docs/quiz-audit.md` (findings) and `docs/quiz-redesign.md` (target).
**Rule:** no big-bang rewrite. Every phase ships independently, is individually revertible, and is measured against the Phase 0 baseline.

## Decisions incorporated (from you)
- **Quiz-core = ~25 curated products**, dose/ingredient data managed in the **Founders portal**. Phase 4 **seeds with mock data**; real SKUs land via the portal later.
- **Compliance is build-time, not optional:** curate around authorised-claim ingredients, route all claim copy through one approved-claims gate, **botanicals (ashwagandha, menopause blends) are descriptive-only** (felt benefit carried by an authorised companion nutrient).
- **Bodyweight** is asked as **bands**, optional.
- **Dose caps** ship as safe defaults, portal-editable.
- **Returns/minimum-term (my steer):** move to **cancel-anytime after the first billing + free product swaps**, with the intro discount capped so month 1 is still profitable-on-cancel (the engine already computes `subscriptionProfitableOnCancel`, `pricing.ts:864`). This means dropping `minSubscriptionMonths` from **4 → 1** (`pricing.ts:83`). **This is the one genuine business trade-off in the plan — flagged for your veto** (Phase 6). Risk-reversal converts better than a tie-in for a trust-barrier product; the margin guard stays because the intro cap keeps the first month profitable.

---

## 0. How the phases were ordered

Ranked by **impact ÷ effort**. Impact = expected lift on the two goals (genuine bundle quality + conversion). Effort in engineer-hours (one mid/senior full-stack dev familiar with the repo).

| Phase | Impact | Effort (h) | Impact÷Effort | Risk | Do-order |
|---|---|---|---|---|---|
| **0 — Instrumentation** | Enabling (everything else is unmeasurable without it) | 10–14 | **∞ (gate)** | Low | **1st — mandatory** |
| **1 — Friction cull** | High (shorter flow, wires `primaryGoal`, persist/resume, reframing) | 16–20 | **High** | Low | **2nd** |
| **2 — Value-first pricing** | Highest single conversion lever (+ results-page reasoning) | 24–32 | **High** | Med | **3rd** |
| **3 — Safety gate + bodyweight** | Compliance/safety must-have + dosing | 16–22 | Med-High | Med | 4th |
| **4 — Decision-matrix engine** | Maintainability + enables §5 | 30–40 | Med | Med-High | 5th |
| **5 — Bundle construction rules** | Fixes the quality defects (dup/overdose/filler) | 20–26 | High (depends on 4) | Med | 6th |
| **6 — Cadence + cross-sell + compliance copy** | Margin + legal safety + AOV | 18–24 | Med | Med | 7th |

**Total: ~134–178h (~4–6 weeks).** **Start with Phase 0** — it is the only phase that blocks the rest, because none of the flow/engine changes can be judged without a baseline funnel. Phases 1 and 2 are next because they're the cheapest large conversion wins and don't depend on the engine refactor. The engine work (4–5) is deliberately late: it's behaviour-preserving refactor first (locked by snapshot tests from Phase 0/1), with the quality improvements riding on top, so recommendation logic can't silently regress.

---

## Phase 0 — Instrumentation & baseline **(do first)**

**Objective.** Make the quiz funnel measurable: per-question reach, drop-off, time-on-question, and quiz→checkout conversion. Establish the baseline every later phase is judged against.

**Files/modules.**
- `src/lib/analytics/events.ts` — add a `QUIZ_EVENTS` union alongside `SHOP_EVENTS` (`events.ts:13`); reuse the existing `track()` beacon (no new infra).
- `src/components/scroll/Act2Quiz.tsx` — fire `quiz_start`, `quiz_step_view`, `quiz_step_complete` (+`msOnStep`), `quiz_step_back`, `quiz_subquestion_view/answer`, `quiz_complete`, `quiz_deepdive_offer/accept`; `quiz_abandon` on unload via `sendBeacon`.
- `src/components/stack-review/StackReviewPage.tsx` + `src/hooks/useStackCheckout.ts` — `stack_reveal_view`, `stack_swap/add/remove`, `checkout_start`, `checkout_success` (with `source: 'quiz'`).
- `src/app/api/analytics/route.ts` — confirm it persists/aggregates enough to build a funnel (add a minimal per-event store or forward to a provider).

**Dependencies.** None. First phase.

**Effort.** 10–14h.

**Risk.** **Low.** `track()` already no-ops on the server and never throws (`events.ts:46-66`); events are additive.

**Acceptance criteria.**
- Every step in all four paths emits `quiz_step_view` on entry and `quiz_step_complete` on advance, including compound `goals` sub-parts and inline sub-questions.
- A single anonymous session id spans quiz→reveal→checkout (verify the SPA stays one page-load; if not, thread the id).
- Abandonment fires reliably on tab-close/navigation.

**Proof metric.** We can render a **per-question drop-off curve** and a **quiz→checkout conversion rate** for one week of traffic. (These become the baseline denominators for Phases 1–2 A/B tests — which is why nothing can be sized before this ships.)

**Rollback.** Revert the event calls (or wrap in a `NEXT_PUBLIC_QUIZ_ANALYTICS` flag). Analytics failure can't affect the quiz.

---

## Phase 1 — Friction cull **(2nd)**

**Objective.** Remove/repair the inert questions (audit §2), apply the redesign §3 reframing copy, wire `primaryGoal`, and add answer persistence — hitting the §2 target flow sizes (6 wellbeing / 8 performance). No engine behaviour change beyond `primaryGoal`.

**Files/modules.**
- `src/lib/quiz-flow.ts` — delete `drinkVariety`; delete `immuneBaseline` (copy-only, audit §2); collapse `workoutAddOns` to a single pre-workout toggle; make `caffeine`/`trainingTime` conditional (new `showWhen` predicate); merge `type`+`trainingFocus` **and** `frequency`+`experience` into single steps with inline follow-ups.
- `src/components/scroll/Act2Quiz.tsx` — remove the `exactAge` slider (`~1378-1391`), the `active` lifestyle chip (`~222`), move `name` to the results/email step; set `primaryGoal` on first goal tap; **apply the redesign §3 reframed wording** (diet "how do most of your meals happen?", focus "what are you training for?", caffeine "I run on it", `dailyDrinks` de-hedged).
- `src/lib/store.tsx` — `setGoals` writes `primaryGoal = goals[0]` when unset (`store.tsx:142`); **add `zustand/persist` + a "resume where you left off" prompt** so a refresh no longer wipes all answers (audit §5.3 / drop-off risk #3 — the store is in-memory today, `store.tsx:110`).

**Dependencies.** Phase 0 (to measure the win). Snapshot tests (below) should exist first.

**Effort.** 16–20h (includes persist/resume + the §3 reframing copy).

**Risk.** Low-Med — flow-sequencing regressions. Mitigated: the flow is one config array (`quiz-flow.ts`), so changes are localised and reversible.

**Acceptance criteria.**
- Step counts match redesign §2 per path; deleted questions gone from all paths.
- `answers.primaryGoal` is populated on every completion; persona snapshot bundles **unchanged** except where `primaryGoal` intentionally reorders (documented).
- No dead options remain (`active`, protein/recovery add-ons, `immuneBaseline`).
- A mid-quiz refresh restores answers + offers resume.

**Proof metric.** **Completion rate ↑ and median time-to-complete ↓** vs. Phase 0 baseline, with **quiz→checkout not down** (guardrail). Run as an A/B (below).

**Rollback.** Revert `quiz-flow.ts` to the prior array — the flow restores cleanly; `primaryGoal` write is harmless if left.

---

## Phase 2 — Value-first pricing **(3rd — headline conversion lever)**

**Objective.** Remove `budget` as a quiz question; present the bundle first on the built-bundle screen, then three depths (Essentials/Balanced/Complete) as prefixes of one ideal bundle. Also land the results-page **per-product reasoning tied to the user's actual answers** and **effect-onset expectation-setting** (redesign §8.1–8.2), since the reveal is being rebuilt here anyway.

**Files/modules.**
- `src/lib/quiz-flow.ts` — remove the `budget` step (skip in all paths).
- `src/components/scroll/Act2Quiz.tsx` — remove `BundleDeck`/`BUDGET_DATA` from the flow; keep it as a results-page component.
- `src/components/stack-review/StackReviewPage.tsx` (+ `StackDeck`, `UpgradesCard`, `ProductTile`) — build the tier selector (each tier a ranked prefix of the `complete` bundle); surface a **"why this for you"** line per product grounded in the specific answer (goal/frequency), and an **effect-onset timeline** ("you'll feel this the first session" / "give it 1–3 weeks" / "works quietly, 6–12 weeks") from `effectOnset` (`catalogue/types.ts:158-162`). Reasoning deepens with the new signals (bodyweight etc.) once Phases 3–4 land.
- `src/lib/stack-blueprint/pricing.ts` — reuse `tiers`/`levelForStackPreference`; ensure tier→price is presentational only.

**Dependencies.** Phase 0. Independent of the engine refactor (works on today's factory).

**Effort.** 24–32h (includes the results-page reasoning + effect-onset work).

**Risk.** Med — touches the reveal + pricing presentation; must keep prices consistent with checkout (the shared cap maths in `personalise.ts:95-109` helps).

**Acceptance criteria.**
- No budget question in any path; reveal shows 3 tiers, each a visible prefix of the next.
- Selected tier drives the same price the checkout charges (parity test).
- Subscribe-&-save rate rises with depth as configured (`pricing.ts:34-38`).
- Every product line shows an answer-grounded reason **and** an effect-onset timeline.

**Proof metric.** **Quiz→checkout conversion ↑** (primary) with **AOV not down and refund/cancel not up** (guardrails). Headline A/B.

**Rollback.** Re-enable the `budget` step via a flag; reveal falls back to today's single-stack view.

---

## Phase 3 — Safety gate + bodyweight **(4th)**

**Objective.** Add the hard safety screen (pregnancy/breastfeeding/medication) that removes contraindicated products, and bodyweight bands that scale protein/creatine dosing.

**Files/modules.**
- `src/lib/quiz-flow.ts` + `Act2Quiz.tsx` — new `safety` step (early) and `weight` bands in the `personal`/`about-you` step.
- `src/lib/types.ts` — `safetyFlags: ('pregnancy'|'medication')[]`, `weightBand`.
- `src/lib/catalogue/types.ts` — `contraindications?: SafetyFlag[]`, and `actives` (co-introduced here, used fully in Phase 4/5).
- `src/lib/stack-blueprint/factory.ts` — a hard gate: `if (product.contraindications ∩ answers.safetyFlags) return -Infinity` (mirrors the existing gate style, `factory.ts:171-183`).
- `src/lib/stack-blueprint/pricing.ts` — `sizeConsumption` scales protein/creatine servings/day by `weightBand` (`pricing.ts:440-472`).

**Dependencies.** None hard (additive), but best after Phase 1 so the new steps slot into the trimmed flow.

**Effort.** 16–22h.

**Risk.** Med — safety-critical. Must be covered by an exhaustive contraindication test matrix.

**Acceptance criteria.**
- A flagged (pregnant) persona **never** receives ashwagandha/menopause botanicals/high-dose fish oil in any tier (unit-tested across the persona matrix).
- If the safety gate empties a primary goal, the reveal shows the honest "no strong match / speak to your GP" state (redesign §6.5).
- Heavier weight bands produce larger protein serving sizes / tighter cadence (sizing test).

**Proof metric.** **Zero contraindicated recommendations** in the automated safety matrix; correct dose scaling in sizing tests. (Safety is pass/fail, not an A/B.)

**Rollback.** The gate and weight scaling are additive and flag-guarded; disabling reverts to current behaviour (but launch should not proceed without the gate).

---

## Phase 4 — Decision-matrix engine **(5th — the refactor)**

**Objective.** Replace the magic-number scoring in `factory.ts` with data: a curated **quiz-core** catalogue (with `actives`/dose data, seeded mock, portal-editable), a goal→product map, and a named-weight scoring table. **Behaviour-preserving first**, improvements later.

**Files/modules.**
- New `src/lib/quiz-core/` — `products.ts` (seed mock, ~25 items with `actives`/`contraindications`), `goal-map.ts`, `scoring.ts` (named weights, redesign §5.3), `tiers.ts`.
- `src/lib/stack-blueprint/factory.ts` — `scoreProduct` reads weights from `scoring.ts`; `recommendationPriority` demoted to a tie-breaker (so PowerBody's flat "5" no longer drives ranking, audit §3.3).
- `src/lib/catalogue/types.ts` — finalise `actives`, `contraindications`, `evidenceTier`, `doseAdequate`.
- **Founders portal** (`src/app/portal/products/*`, `src/lib/portal/*`) — editor fields for the quiz-core dose/ingredient data (your stated home for this data).

**Dependencies.** Phase 3 (shares the `actives`/`contraindications` type additions). **Snapshot tests must exist and be green before starting.**

**Effort.** 30–40h.

**Risk.** Med-High — largest surface. Mitigated by: (1) snapshot lock, (2) old factory kept behind a flag until the matrix reproduces it, (3) the portal-editable config means later tuning needs no code.

**Acceptance criteria.**
- Persona snapshot tests stay **green through the refactor** (the matrix reproduces today's picks before any weight is intentionally changed).
- A weight/goal-map change alters recommendations **with no code edit** (config-only).
- Every quiz-core product carries `actives` + `contraindications`.

**Proof metric.** **No persona regressions** (snapshot diff = intended changes only) + a demonstrated config-only tuning change. Maintainability, not a conversion metric.

**Rollback.** Feature-flag: `useMatrix=false` restores the current `factory.ts` path. The matrix is inert until switched on.

---

## Phase 5 — Bundle construction rules **(6th — fixes the defects)**

**Objective.** Enforce the redesign §6 rules: active-ingredient dedup, total dose caps, relevance floor (no budget-filler), "no strong match" path, core+add-on split.

**Files/modules.**
- New `src/lib/quiz-core/bundle-rules.ts` — post-selection pass over the chosen products using their `actives`.
- `src/lib/stack-blueprint/factory.ts` — call the rules after scoring; enforce the `score ≥ floor` gate (removes conf-0 fillers, audit §4).
- `src/components/stack-review/*` — render the **add-on** section separately and the **no-match** state.

**Dependencies.** Phase 4 (needs `actives` data + the matrix).

**Effort.** 20–26h.

**Risk.** Med — changes bundle *contents*. Covered by the persona snapshot suite + targeted defect tests.

**Acceptance criteria.**
- **No two products share an active ingredient** across a bundle (kills double-magnesium/double-ashwagandha, audit §4 P8; double immune cover P14).
- **Dose caps never exceeded** (summed across the bundle).
- **No product below the relevance floor** appears (P1/P5 fillers gone).
- Vegetarian skin/hair persona (P10) shows the no-match state, not a silent degrade.

**Proof metric.** **Re-run the audit §4 persona harness → clean** (no duplication, no overdose, no conf-0 filler) + snapshot tests green. Downstream: **refund/swap-rate and retention** (bundle quality shows up here, not in checkout).

**Rollback.** Each rule is an independent post-processing step behind its own flag; disable individually.

---

## Phase 6 — Cadence fix + cross-sell + compliance copy **(7th)**

**Objective.** Fix the subscription>one-off anomaly, add the bars/drinks cross-sell, and make every claim surface compliant. Includes the **returns/minimum-term change** (your veto point).

**Files/modules.**
- `src/lib/stack-blueprint/pricing.ts` — guard: flat monthly ≤ one-off unit economics (audit §4 P7); reduce `minSubscriptionMonths` 4→1 and cap the intro discount so month 1 is profitable-on-cancel (`pricing.ts:83,847-864`).
- `src/lib/lqd.ts` / `src/lib/pour-plan/*` — pace-aware sizing so drinks land near the chosen pace (audit §4 P13).
- `src/components/stack-review/*` — bars **results-page cross-sell**; drinks↔supps format swap.
- `src/lib/stack-blueprint/approved-claims.ts` + `autopopulate.ts` — extend the `isClaimSafe` gate (`autopopulate.ts:34-53`) to cover **results-page reason lines and quiz "did you know?" tidbits**; apply the redesign §9 wording swaps; botanicals descriptive-only.

**Dependencies.** Phase 2 (reveal), Phase 5 (bundle contents for cross-sell).

**Effort.** 18–24h.

**Risk.** Med — pricing + legal copy. The `minSubscriptionMonths` change is a business decision (flagged).

**Acceptance criteria.**
- **Flat monthly ≤ one-off** for every persona (guard test).
- **No unapproved claim string** appears on any surface (a test asserts every reason/tidbit is in `APPROVED_CLAIMS`).
- Bars appear only as a results-page add-on; never in core logic.
- Subscription copy matches the real cancel/swap terms.

**Proof metric.** **Zero compliance-gate failures**; **AOV ↑** from cross-sell without a **cancel-rate** rise from the term change (watch closely).

**Rollback.** Per-feature flags; the `minSubscriptionMonths` value is config (`pricing.ts`) — revert in one line.

---

## Testing strategy

### 1. Unit tests — decision matrix (`src/lib/quiz-core/__tests__`)
- **Weights & gates:** each hard gate (`safety`, dietary, stimulant, already-taking, narrow-use) fires and blocks; each named weight contributes as configured.
- **Tie-breakers:** evidence > dose > margin > price, in order, with constructed ties.
- **Goal-map coverage:** every `Goal` resolves to at least one safe core product, or is explicitly marked `no-match` (catches the P10 class at build time).

### 2. Snapshot tests — persona → bundle **(the regression guard; build in Phase 0/1)**
- Commit the audit §4 harness as `persona-bundles.snapshot.test.ts` — **14 personas across all four paths**, asserting the full bundle (products, tiers, one-off, monthly). This is the safety net that lets the Phase 4 refactor and Phase 5 rules land without silently changing recommendations.
- Snapshot updates require an explicit, reviewed diff — so a weight change is visible as a bundle change in the PR.

### 3. Targeted correctness tests
- **Safety matrix** (Phase 3): every `safetyFlag` × every contraindicated product → excluded.
- **Ingredient dedup / dose caps** (Phase 5): constructed bundles that *would* double magnesium/ashwagandha or breach a cap → rule trims correctly.
- **Cadence guard** (Phase 6): `monthly ≤ oneOff` for all personas; drinks pace within tolerance.
- **Compliance gate** (Phase 6): assert no reason/tidbit string exists outside `APPROVED_CLAIMS`.

### 4. A/B test design (flow changes)
- **Randomise at `quiz_start`**, persist the variant for the session (and across quiz→reveal→checkout), log it on every event.
- **Phase 1 (friction):** A = current flow, B = trimmed. **Primary:** completion rate. **Guardrails:** quiz→checkout, AOV. **Direction:** expect completion ↑, conversion flat-or-up.
- **Phase 2 (value-first):** A = budget-in-flow, B = value-first tiers. **Primary:** quiz→checkout conversion. **Guardrails:** AOV, refund/cancel rate. This is the headline test.
- **Phase 5 (bundle quality):** hard to read on checkout alone — use a **holdback** and measure **90-day retention, refund-rate, and swap-rate** (quality surfaces post-purchase), plus per-order margin.
- **Sizing:** compute required n from the **Phase 0 baseline** conversion rate and a minimum detectable effect (e.g. +2pp on a ~X% base); pick fixed-horizon or a sequential test up front to avoid peeking. *We cannot size any test until Phase 0 has produced the baseline — another reason it's first.*

---

## Open items carried forward
- **Real quiz-core SKUs** (replacing the Phase 4 mock seed) — you'll add via the portal.
- **Compliance sign-off** on the §9 wording and the dose-cap numbers before launch (Phases 3/6).
- **Your veto** on the `minSubscriptionMonths` 4→1 change (Phase 6) — the only business trade-off in the plan.

*End of Phase 3. This completes the three-phase engagement (audit → redesign → plan). On your approval I can start implementation at Phase 0.*
